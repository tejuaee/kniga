import { Router } from 'express';
import { now, escapeLike } from './db/index.js';
import { HttpError, h } from './http.js';
import { requireAuth, currentUser } from './auth.js';

// A log entry as the API returns it:
// { id, book: { id, title, author, coverUrl, year }, readOn, rating, review, hasSpoiler, isReread, liked,
//   tags: [names], createdAt, updatedAt }

export const SELECT_ENTRY = `
  SELECT e.*, b.title, b.author, b.cover_url, b.published_year
  FROM log_entries e JOIN books b ON b.id = e.book_id`;
// Diary order: date read (entries without a date fall back to when they were logged), newest first.
const ORDER = `ORDER BY COALESCE(e.read_on, substr(e.created_at, 1, 10)) DESC, e.id DESC`;

/** Turn database rows into API entries, with their tags. */
export async function hydrate(db, rows) {
  const tagsByEntry = new Map();
  if (rows.length) {
    const tagRows = await db.all(
      `SELECT et.entry_id, t.name FROM entry_tags et JOIN tags t ON t.id = et.tag_id
       WHERE et.entry_id IN (${rows.map(() => '?').join(',')}) ORDER BY t.name`,
      rows.map((r) => r.id),
    );
    for (const t of tagRows) {
      if (!tagsByEntry.has(t.entry_id)) tagsByEntry.set(t.entry_id, []);
      tagsByEntry.get(t.entry_id).push(t.name);
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

/** A reader's entries, newest first. opts: { bookId, year, limit, withReview } */
export async function listEntries(db, userId, opts = {}) {
  const where = ['e.user_id = ?'];
  const params = [userId];
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
  const rows = await db.all(`${SELECT_ENTRY} WHERE ${where.join(' AND ')} ${ORDER} ${limit}`, params);
  return hydrate(db, rows);
}

async function getEntry(db, id, userId) {
  const row = await db.get(`${SELECT_ENTRY} WHERE e.id = ? AND e.user_id = ?`, [id, userId]);
  if (!row) throw new HttpError(404, 'Log entry not found.');
  return (await hydrate(db, [row]))[0];
}

// ---------- validation (UC-05, UC-06, UC-07, UC-09)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Latest calendar date anywhere on Earth right now (UTC+14), so nobody's "today" is rejected. */
function latestToday() {
  return new Date(Date.now() + 14 * 36e5).toISOString().slice(0, 10);
}

export function normalizeTag(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Check the log form. Returns { bookId, readOn, rating, review, hasSpoiler, isReread, liked, tags }. */
export async function validateLog(db, body, opts) {
  const fields = {};

  const bookId = Number(body.bookId);
  if (opts.requireBook) {
    if (!Number.isInteger(bookId) || !(await db.get('SELECT 1 FROM books WHERE id = ?', [bookId])))
      fields.bookId = 'Choose a book to log.';
  }

  let readOn = null;
  if (body.readOn !== null && body.readOn !== undefined && body.readOn !== '') {
    const s = String(body.readOn);
    const d = new Date(s + 'T00:00:00Z');
    if (!DATE_RE.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
      fields.readOn = 'Enter a valid date.';
    else if (s > latestToday()) fields.readOn = "The date can't be in the future."; // UC-05 3a
    else if (s < '1900-01-01') fields.readOn = 'Enter a date after 1900.';
    else readOn = s;
  }

  let rating = null;
  if (body.rating !== null && body.rating !== undefined && body.rating !== '') {
    const n = Number(body.rating);
    if (!Number.isFinite(n) || n < 0.5 || n > 5 || !Number.isInteger(n * 2))
      fields.rating = 'Ratings go from ½ to 5 stars in half-star steps.'; // UC-06 step 2
    else rating = n;
  }

  const review = typeof body.review === 'string' ? body.review.trim() : '';
  if (review.length > 20000) fields.review = 'Reviews can be up to 20,000 characters.';

  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const tags = [...new Set(rawTags.filter((t) => typeof t === 'string').map(normalizeTag).filter(Boolean))];
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

async function saveTags(tx, entryId, tags) {
  await tx.run('DELETE FROM entry_tags WHERE entry_id = ?', [entryId]);
  for (const t of tags) {
    await tx.run('INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [t]);
    const { id } = await tx.get('SELECT id FROM tags WHERE name = ?', [t]);
    await tx.run('INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [entryId, id]);
  }
}

/** Logging (or liking in a log) marks the book Read and drops it from Want to read. */
async function markRead(tx, userId, bookId, liked) {
  await tx.run(
    `INSERT INTO user_books (user_id, book_id, is_read, is_liked, want_to_read) VALUES (?, ?, 1, ?, 0)
     ON CONFLICT (user_id, book_id) DO UPDATE SET is_read = 1, is_liked = excluded.is_liked, want_to_read = 0,
       updated_at = ?`,
    [userId, bookId, liked ? 1 : 0, now()],
  );
}

// ---------- routes
export function logsRouter(db) {
  const r = Router();
  r.use(requireAuth);

  // Diary
  r.get(
    '/',
    h(async (req, res) => {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const entries = await listEntries(db, currentUser(res).id, {
        year: Number.isInteger(year) ? year : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      const years = await db.all(
        `SELECT DISTINCT substr(COALESCE(read_on, created_at), 1, 4) AS y FROM log_entries
         WHERE user_id = ? ORDER BY y DESC`,
        [currentUser(res).id],
      );
      res.json({ entries, years: years.map((y) => Number(y.y)) });
    }),
  );

  // UC-09: suggest tags this reader used before
  r.get(
    '/tags',
    h(async (req, res) => {
      const q = normalizeTag(String(req.query.q ?? ''));
      const rows = await db.all(
        `SELECT t.name, COUNT(*) AS uses FROM entry_tags et
         JOIN tags t ON t.id = et.tag_id JOIN log_entries e ON e.id = et.entry_id
         WHERE e.user_id = ? AND t.name LIKE ? ESCAPE '\\'
         GROUP BY t.id, t.name ORDER BY uses DESC, t.name LIMIT 8`,
        [currentUser(res).id, `${escapeLike(q)}%`],
      );
      res.json({ tags: rows.map((t) => t.name) });
    }),
  );

  r.get(
    '/:id',
    h(async (req, res) => {
      res.json({ entry: await getEntry(db, Number(req.params.id), currentUser(res).id) });
    }),
  );

  // UC-05/06/07/09: one form saves date, rating, review, spoiler flag, tags and ♥ together
  r.post(
    '/',
    h(async (req, res) => {
      const user = currentUser(res);
      const input = await validateLog(db, req.body ?? {}, { requireBook: true });
      const id = await db.transaction(async (tx) => {
        const { id } = await tx.get(
          `INSERT INTO log_entries (user_id, book_id, read_on, rating, review_text, has_spoiler, is_reread, liked)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            user.id,
            input.bookId,
            input.readOn,
            input.rating,
            input.review,
            input.hasSpoiler ? 1 : 0,
            input.isReread ? 1 : 0,
            input.liked ? 1 : 0,
          ],
        );
        await saveTags(tx, id, input.tags);
        await markRead(tx, user.id, input.bookId, input.liked);
        return id;
      });
      res.status(201).json({ entry: await getEntry(db, id, user.id) });
    }),
  );

  r.patch(
    '/:id',
    h(async (req, res) => {
      const user = currentUser(res);
      const existing = await getEntry(db, Number(req.params.id), user.id);
      const input = await validateLog(db, req.body ?? {}, { requireBook: false });
      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE log_entries SET read_on = ?, rating = ?, review_text = ?, has_spoiler = ?, is_reread = ?, liked = ?,
             updated_at = ?
           WHERE id = ? AND user_id = ?`,
          [
            input.readOn,
            input.rating,
            input.review,
            input.hasSpoiler ? 1 : 0,
            input.isReread ? 1 : 0,
            input.liked ? 1 : 0,
            now(),
            existing.id,
            user.id,
          ],
        );
        await saveTags(tx, existing.id, input.tags);
        await markRead(tx, user.id, existing.book.id, input.liked);
      });
      res.json({ entry: await getEntry(db, existing.id, user.id) });
    }),
  );

  // Deleting an entry removes its rating from averages; the book stays "Read" (UC-06 1a).
  r.delete(
    '/:id',
    h(async (req, res) => {
      const user = currentUser(res);
      const existing = await getEntry(db, Number(req.params.id), user.id);
      await db.transaction(async (tx) => {
        // likes / dislikes / comments / notifications point at the entry by id (no foreign key), so clear them too
        for (const table of ['notifications', 'comments', 'likes', 'dislikes'])
          await tx.run(`DELETE FROM ${table} WHERE target_type = 'entry' AND target_id = ?`, [existing.id]);
        await tx.run('DELETE FROM log_entries WHERE id = ? AND user_id = ?', [existing.id, user.id]);
      });
      res.json({ ok: true });
    }),
  );

  return r;
}
