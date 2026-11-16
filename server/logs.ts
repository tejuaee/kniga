import { Router } from 'express';
import { type DB, transaction } from './db.ts';
import { HttpError } from './http.ts';
import { requireAuth, currentUser } from './auth.ts';

// ---------- shapes
interface EntryRow {
  id: number;
  user_id: number;
  book_id: number;
  read_on: string | null;
  rating: number | null;
  review_text: string;
  has_spoiler: number;
  is_reread: number;
  liked: number;
  created_at: string;
  updated_at: string;
  title: string;
  author: string;
  cover_url: string | null;
  published_year: number | null;
}

export interface Entry {
  id: number;
  book: { id: number; title: string; author: string; coverUrl: string | null; year: number | null };
  readOn: string | null;
  rating: number | null;
  review: string;
  hasSpoiler: boolean;
  isReread: boolean;
  liked: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const SELECT_ENTRY = `
  SELECT e.*, b.title, b.author, b.cover_url, b.published_year
  FROM log_entries e JOIN books b ON b.id = e.book_id`;
// Diary order: date read (entries without a date fall back to when they were logged), newest first.
const ORDER = `ORDER BY COALESCE(e.read_on, substr(e.created_at, 1, 10)) DESC, e.id DESC`;

function hydrate(db: DB, rows: EntryRow[]): Entry[] {
  const tagsByEntry = new Map<number, string[]>();
  if (rows.length) {
    const tagRows = db
      .prepare(
        `SELECT et.entry_id, t.name FROM entry_tags et JOIN tags t ON t.id = et.tag_id
         WHERE et.entry_id IN (${rows.map(() => '?').join(',')}) ORDER BY t.name`,
      )
      .all(...rows.map((r) => r.id)) as { entry_id: number; name: string }[];
    for (const t of tagRows) {
      if (!tagsByEntry.has(t.entry_id)) tagsByEntry.set(t.entry_id, []);
      tagsByEntry.get(t.entry_id)!.push(t.name);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    book: { id: r.book_id, title: r.title, author: r.author, coverUrl: r.cover_url, year: r.published_year },
    readOn: r.read_on,
    rating: r.rating,
    review: r.review_text,
    hasSpoiler: Boolean(r.has_spoiler),
    isReread: Boolean(r.is_reread),
    liked: Boolean(r.liked),
    tags: tagsByEntry.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function listEntries(
  db: DB,
  userId: number,
  opts: { bookId?: number; year?: number; limit?: number; withReview?: boolean } = {},
): Entry[] {
  const where = ['e.user_id = ?'];
  const params: (number | string)[] = [userId];
  if (opts.withReview) where.push(`e.review_text <> ''`);
  if (opts.bookId) {
    where.push('e.book_id = ?');
    params.push(opts.bookId);
  }
  if (opts.year) {
    where.push(`substr(COALESCE(e.read_on, e.created_at), 1, 4) = ?`);
    params.push(String(opts.year));
  }
  const limit = opts.limit ? `LIMIT ${Math.min(Math.max(1, Math.floor(opts.limit)), 500)}` : '';
  const rows = db
    .prepare(`${SELECT_ENTRY} WHERE ${where.join(' AND ')} ${ORDER} ${limit}`)
    .all(...params) as unknown as EntryRow[];
  return hydrate(db, rows);
}

function getEntry(db: DB, id: number, userId: number) {
  const row = db.prepare(`${SELECT_ENTRY} WHERE e.id = ? AND e.user_id = ?`).get(id, userId) as
    | EntryRow
    | undefined;
  if (!row) throw new HttpError(404, 'Log entry not found.');
  return hydrate(db, [row])[0];
}

// ---------- validation (UC-05, UC-06, UC-07, UC-09)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Latest calendar date anywhere on Earth right now (UTC+14), so nobody's "today" is rejected. */
function latestToday() {
  return new Date(Date.now() + 14 * 36e5).toISOString().slice(0, 10);
}

export function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface LogInput {
  bookId: number;
  readOn: string | null;
  rating: number | null;
  review: string;
  hasSpoiler: boolean;
  isReread: boolean;
  liked: boolean;
  tags: string[];
}

export function validateLog(db: DB, body: Record<string, unknown>, opts: { requireBook: boolean }): LogInput {
  const fields: Record<string, string> = {};

  const bookId = Number(body.bookId);
  if (opts.requireBook) {
    if (!Number.isInteger(bookId) || !db.prepare('SELECT 1 FROM books WHERE id = ?').get(bookId))
      fields.bookId = 'Choose a book to log.';
  }

  let readOn: string | null = null;
  if (body.readOn !== null && body.readOn !== undefined && body.readOn !== '') {
    const s = String(body.readOn);
    const d = new Date(s + 'T00:00:00Z');
    if (!DATE_RE.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
      fields.readOn = 'Enter a valid date.';
    else if (s > latestToday()) fields.readOn = "The date can't be in the future."; // UC-05 3a
    else if (s < '1900-01-01') fields.readOn = 'Enter a date after 1900.';
    else readOn = s;
  }

  let rating: number | null = null;
  if (body.rating !== null && body.rating !== undefined && body.rating !== '') {
    const n = Number(body.rating);
    if (!Number.isFinite(n) || n < 0.5 || n > 5 || !Number.isInteger(n * 2))
      fields.rating = 'Ratings go from ½ to 5 stars in half-star steps.'; // UC-06 step 2
    else rating = n;
  }

  const review = typeof body.review === 'string' ? body.review.trim() : '';
  if (review.length > 20000) fields.review = 'Reviews can be up to 20,000 characters.';

  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const tags = [...new Set(rawTags.filter((t): t is string => typeof t === 'string').map(normalizeTag).filter(Boolean))];
  if (tags.length > 20) fields.tags = 'Use up to 20 tags.';
  else if (tags.some((t) => t.length > 40)) fields.tags = 'Tags can be up to 40 characters.';

  if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', fields);

  return {
    bookId,
    readOn,
    rating,
    review,
    hasSpoiler: review ? body.hasSpoiler === true : false,
    isReread: body.isReread === true,
    liked: body.liked === true,
    tags,
  };
}

function saveTags(db: DB, entryId: number, tags: string[]) {
  db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(entryId);
  const upsert = db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
  const find = db.prepare('SELECT id FROM tags WHERE name = ?');
  const link = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
  for (const t of tags) {
    upsert.run(t);
    const { id } = find.get(t) as { id: number };
    link.run(entryId, id);
  }
}

/** Logging (or liking in a log) marks the book Read and drops it from Want to read. */
function markRead(db: DB, userId: number, bookId: number, liked: boolean) {
  db.prepare(
    `INSERT INTO user_books (user_id, book_id, is_read, is_liked, want_to_read) VALUES (?, ?, 1, ?, 0)
     ON CONFLICT(user_id, book_id) DO UPDATE SET is_read = 1, is_liked = excluded.is_liked, want_to_read = 0,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(userId, bookId, liked ? 1 : 0);
}

// ---------- routes
export function logsRouter(db: DB) {
  const r = Router();
  r.use(requireAuth);

  // Diary
  r.get('/', (req, res) => {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const entries = listEntries(db, currentUser(res).id, {
      year: Number.isInteger(year) ? year : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    const years = db
      .prepare(
        `SELECT DISTINCT substr(COALESCE(read_on, created_at), 1, 4) AS y FROM log_entries
         WHERE user_id = ? ORDER BY y DESC`,
      )
      .all(currentUser(res).id) as { y: string }[];
    res.json({ entries, years: years.map((y) => Number(y.y)) });
  });

  // UC-09: suggest tags this reader used before
  r.get('/tags', (req, res) => {
    const q = normalizeTag(String(req.query.q ?? ''));
    const rows = db
      .prepare(
        `SELECT t.name, COUNT(*) AS uses FROM entry_tags et
         JOIN tags t ON t.id = et.tag_id JOIN log_entries e ON e.id = et.entry_id
         WHERE e.user_id = ? AND t.name LIKE ? ESCAPE '\\'
         GROUP BY t.id ORDER BY uses DESC, t.name LIMIT 8`,
      )
      .all(currentUser(res).id, `${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`) as { name: string }[];
    res.json({ tags: rows.map((t) => t.name) });
  });

  r.get('/:id', (req, res) => {
    res.json({ entry: getEntry(db, Number(req.params.id), currentUser(res).id) });
  });

  // UC-05/06/07/09: one form saves date, rating, review, spoiler flag, tags and ♥ together
  r.post('/', (req, res) => {
    const user = currentUser(res);
    const input = validateLog(db, req.body ?? {}, { requireBook: true });
    const id = transaction(db, () => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO log_entries (user_id, book_id, read_on, rating, review_text, has_spoiler, is_reread, liked)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          input.bookId,
          input.readOn,
          input.rating,
          input.review,
          input.hasSpoiler ? 1 : 0,
          input.isReread ? 1 : 0,
          input.liked ? 1 : 0,
        );
      const entryId = Number(lastInsertRowid);
      saveTags(db, entryId, input.tags);
      markRead(db, user.id, input.bookId, input.liked);
      return entryId;
    });
    res.status(201).json({ entry: getEntry(db, id, user.id) });
  });

  r.patch('/:id', (req, res) => {
    const user = currentUser(res);
    const existing = getEntry(db, Number(req.params.id), user.id);
    const input = validateLog(db, req.body ?? {}, { requireBook: false });
    transaction(db, () => {
      db.prepare(
        `UPDATE log_entries SET read_on = ?, rating = ?, review_text = ?, has_spoiler = ?, is_reread = ?, liked = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`,
      ).run(
        input.readOn,
        input.rating,
        input.review,
        input.hasSpoiler ? 1 : 0,
        input.isReread ? 1 : 0,
        input.liked ? 1 : 0,
        existing.id,
        user.id,
      );
      saveTags(db, existing.id, input.tags);
      markRead(db, user.id, existing.book.id, input.liked);
    });
    res.json({ entry: getEntry(db, existing.id, user.id) });
  });

  // Deleting an entry removes its rating from averages; the book stays "Read" (UC-06 1a).
  r.delete('/:id', (req, res) => {
    const user = currentUser(res);
    const existing = getEntry(db, Number(req.params.id), user.id);
    db.prepare('DELETE FROM log_entries WHERE id = ? AND user_id = ?').run(existing.id, user.id);
    res.json({ ok: true });
  });

  return r;
}
