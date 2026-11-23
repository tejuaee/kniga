import { Router } from 'express';
import { type DB, transaction } from './db.ts';
import { HttpError } from './http.ts';
import { requireAuth, currentUser } from './auth.ts';
import { type BookRow, toBook } from './books.ts';
import { listEntries } from './logs.ts';

export const BIO_MAX = 300;
const TOP = 4;

interface ProfileUserRow {
  id: number;
  username: string;
  bio: string;
  avatar_url: string | null;
  role: string;
  created_at: string;
}

function favorites(db: DB, userId: number) {
  const rows = db
    .prepare(
      `SELECT f.position, b.* FROM favorite_books f JOIN books b ON b.id = f.book_id
       WHERE f.user_id = ? ORDER BY f.position`,
    )
    .all(userId) as unknown as (BookRow & { position: number })[];
  const slots: (ReturnType<typeof toBook> | null)[] = Array(TOP).fill(null);
  for (const r of rows) slots[r.position - 1] = toBook(r);
  return slots;
}

/**
 * Ratings histogram: one bar per half-star step (½ … 5). Each book counts once, using the
 * reader's active rating — the one on their most recent rated entry (same rule as book averages).
 */
function ratingCounts(db: DB, userId: number) {
  const rows = db
    .prepare(
      `SELECT rating FROM (
         SELECT rating, ROW_NUMBER() OVER (
           PARTITION BY book_id ORDER BY COALESCE(read_on, substr(created_at, 1, 10)) DESC, id DESC
         ) AS rn
         FROM log_entries WHERE user_id = ? AND rating IS NOT NULL
       ) WHERE rn = 1`,
    )
    .all(userId) as { rating: number }[];
  const counts = Array(10).fill(0) as number[];
  for (const { rating } of rows) counts[Math.round(rating * 2) - 1]++;
  return counts;
}

function stats(db: DB, userId: number) {
  const n = (sql: string, ...params: (number | string)[]) => (db.prepare(sql).get(...params) as { n: number }).n;
  const year = String(new Date().getUTCFullYear());
  return {
    books: n('SELECT COUNT(*) AS n FROM user_books WHERE user_id = ? AND is_read = 1', userId),
    thisYear: n(
      `SELECT COUNT(DISTINCT book_id) AS n FROM log_entries
       WHERE user_id = ? AND substr(COALESCE(read_on, created_at), 1, 4) = ?`,
      userId,
      year,
    ),
    reviews: n(`SELECT COUNT(*) AS n FROM log_entries WHERE user_id = ? AND review_text <> ''`, userId),
    liked: n('SELECT COUNT(*) AS n FROM user_books WHERE user_id = ? AND is_liked = 1', userId),
    wantToRead: n('SELECT COUNT(*) AS n FROM user_books WHERE user_id = ? AND want_to_read = 1', userId),
  };
}

function tags(db: DB, userId: number) {
  return db
    .prepare(
      `SELECT t.name, COUNT(*) AS count FROM entry_tags et
       JOIN tags t ON t.id = et.tag_id JOIN log_entries e ON e.id = et.entry_id
       WHERE e.user_id = ? GROUP BY t.id ORDER BY count DESC, t.name LIMIT 30`,
    )
    .all(userId) as { name: string; count: number }[];
}

export function usersRouter(db: DB) {
  const r = Router();
  r.use(requireAuth);

  // Edit profile: bio
  r.patch('/me', (req, res) => {
    const user = currentUser(res);
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim() : '';
    if (bio.length > BIO_MAX)
      throw new HttpError(400, 'Please fix the highlighted fields.', { bio: `Keep your bio under ${BIO_MAX} characters.` });
    db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, user.id);
    res.json({ bio });
  });

  // Top 4: an array of exactly four slots, each a book id or null (empty slot)
  r.put('/me/favorites', (req, res) => {
    const user = currentUser(res);
    const ids = req.body?.bookIds;
    if (!Array.isArray(ids) || ids.length !== TOP || !ids.every((x) => x === null || Number.isInteger(x)))
      throw new HttpError(400, `Send exactly ${TOP} slots, each a book id or null.`);
    const chosen = ids.filter((x): x is number => x !== null);
    if (new Set(chosen).size !== chosen.length) throw new HttpError(400, 'A book can only be in your Top 4 once.');
    const exists = db.prepare('SELECT 1 FROM books WHERE id = ?');
    if (chosen.some((id) => !exists.get(id))) throw new HttpError(404, 'Book not found.');

    transaction(db, () => {
      db.prepare('DELETE FROM favorite_books WHERE user_id = ?').run(user.id);
      const insert = db.prepare('INSERT INTO favorite_books (user_id, position, book_id) VALUES (?, ?, ?)');
      ids.forEach((id, i) => id !== null && insert.run(user.id, i + 1, id));
    });
    res.json({ favorites: favorites(db, user.id) });
  });

  // Member search: username match, prefix hits first
  r.get('/', (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 50);
    if (q.length < 2) return void res.json({ results: [] });
    const esc = q.replace(/[\\%_]/g, (c) => '\\' + c);
    const rows = db
      .prepare(
        `SELECT u.username, u.bio, u.avatar_url, u.role,
           (SELECT COUNT(*) FROM user_books ub WHERE ub.user_id = u.id AND ub.is_read = 1) AS books
         FROM users u
         WHERE u.username LIKE ? ESCAPE '\\'
         ORDER BY (u.username LIKE ? ESCAPE '\\') DESC, length(u.username), u.username
         LIMIT 20`,
      )
      .all(`%${esc}%`, `${esc}%`) as { username: string; bio: string; avatar_url: string | null; role: string; books: number }[];
    res.json({
      results: rows.map((u) => ({ username: u.username, bio: u.bio, avatarUrl: u.avatar_url, role: u.role, books: u.books })),
    });
  });

  // Profile page data
  r.get('/:username', (req, res) => {
    const row = db
      .prepare('SELECT id, username, bio, avatar_url, role, created_at FROM users WHERE username = ?')
      .get(String(req.params.username)) as ProfileUserRow | undefined;
    if (!row) throw new HttpError(404, 'No reader with that username.');

    res.json({
      user: {
        id: row.id,
        username: row.username,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        role: row.role,
        createdAt: row.created_at,
      },
      isMe: row.id === currentUser(res).id,
      stats: stats(db, row.id),
      favorites: favorites(db, row.id),
      ratings: ratingCounts(db, row.id),
      tags: tags(db, row.id),
      recent: listEntries(db, row.id, { limit: 6 }),
      reviews: listEntries(db, row.id, { limit: 3, withReview: true }),
    });
  });

  return r;
}
