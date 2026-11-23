import { Router } from 'express';
import { now, escapeLike } from './db/index.js';
import { HttpError, h } from './http.js';
import { requireAuth, currentUser } from './auth.js';
import { toBook } from './books.js';
import { listEntries } from './logs.js';
import { notify, unnotify } from './social.js';

export const BIO_MAX = 300;
const TOP = 4;
const LIST_LIMIT = 100;

async function favorites(db, userId) {
  const rows = await db.all(
    `SELECT f.position, b.* FROM favorite_books f JOIN books b ON b.id = f.book_id
     WHERE f.user_id = ? ORDER BY f.position`,
    [userId],
  );
  const slots = Array(TOP).fill(null);
  for (const r of rows) slots[r.position - 1] = toBook(r);
  return slots;
}

/**
 * Ratings histogram: one bar per half-star step (½ … 5). Each book counts once, using the
 * reader's active rating — the one on their most recent rated entry (same rule as book averages).
 */
async function ratingCounts(db, userId) {
  const rows = await db.all(
    `SELECT rating FROM (
       SELECT rating, ROW_NUMBER() OVER (
         PARTITION BY book_id ORDER BY COALESCE(read_on, substr(created_at, 1, 10)) DESC, id DESC
       ) AS rn
       FROM log_entries WHERE user_id = ? AND rating IS NOT NULL
     ) latest WHERE rn = 1`,
    [userId],
  );
  const counts = Array(10).fill(0);
  for (const { rating } of rows) counts[Math.round(rating * 2) - 1]++;
  return counts;
}

async function stats(db, userId) {
  const n = async (sql, ...params) => (await db.get(sql, params)).n;
  const year = String(new Date().getUTCFullYear());
  return {
    books: await n('SELECT COUNT(*) AS n FROM user_books WHERE user_id = ? AND is_read = 1', userId),
    thisYear: await n(
      `SELECT COUNT(DISTINCT book_id) AS n FROM log_entries
       WHERE user_id = ? AND substr(COALESCE(read_on, created_at), 1, 4) = ?`,
      userId,
      year,
    ),
    reviews: await n(`SELECT COUNT(*) AS n FROM log_entries WHERE user_id = ? AND review_text <> ''`, userId),
    liked: await n('SELECT COUNT(*) AS n FROM user_books WHERE user_id = ? AND is_liked = 1', userId),
    wantToRead: await n('SELECT COUNT(*) AS n FROM user_books WHERE user_id = ? AND want_to_read = 1', userId),
    followers: await followerCount(db, userId),
    following: await n('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?', userId),
  };
}

async function followerCount(db, userId) {
  return (await db.get('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?', [userId])).n;
}

async function tags(db, userId) {
  return db.all(
    `SELECT t.name, COUNT(*) AS count FROM entry_tags et
     JOIN tags t ON t.id = et.tag_id JOIN log_entries e ON e.id = et.entry_id
     WHERE e.user_id = ? GROUP BY t.id, t.name ORDER BY count DESC, t.name LIMIT 30`,
    [userId],
  );
}

/**
 * A list of readers as small cards: { username, bio, avatarUrl, role, books, isFollowing }.
 * `isFollowing` is whether the viewer follows them. `from` is the FROM/WHERE/ORDER part of the query.
 */
async function readerCards(db, viewerId, from, params) {
  const rows = await db.all(
    `SELECT u.username, u.bio, u.avatar_url, u.role,
       (SELECT COUNT(*) FROM user_books ub WHERE ub.user_id = u.id AND ub.is_read = 1) AS books,
       EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id) AS is_following
     ${from}`,
    [viewerId, ...params],
  );
  return rows.map((u) => ({
    username: u.username,
    bio: u.bio,
    avatarUrl: u.avatar_url,
    role: u.role,
    books: u.books,
    isFollowing: Boolean(u.is_following),
  }));
}

async function findUser(db, username) {
  const row = await db.get(
    'SELECT id, username, bio, avatar_url, role, created_at FROM users WHERE lower(username) = lower(?)',
    [String(username)],
  );
  if (!row) throw new HttpError(404, 'No reader with that username.');
  return row;
}

export function usersRouter(db) {
  const r = Router();
  r.use(requireAuth);

  // Edit profile: bio
  r.patch(
    '/me',
    h(async (req, res) => {
      const user = currentUser(res);
      const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim() : '';
      if (bio.length > BIO_MAX)
        throw new HttpError(400, 'Please fix the highlighted fields.', {
          bio: `Keep your bio under ${BIO_MAX} characters.`,
        });
      await db.run('UPDATE users SET bio = ? WHERE id = ?', [bio, user.id]);
      res.json({ bio });
    }),
  );

  // Top 4: an array of exactly four slots, each a book id or null (empty slot)
  r.put(
    '/me/favorites',
    h(async (req, res) => {
      const user = currentUser(res);
      const ids = req.body?.bookIds;
      if (!Array.isArray(ids) || ids.length !== TOP || !ids.every((x) => x === null || Number.isInteger(x)))
        throw new HttpError(400, `Send exactly ${TOP} slots, each a book id or null.`);
      const chosen = ids.filter((x) => x !== null);
      if (new Set(chosen).size !== chosen.length) throw new HttpError(400, 'A book can only be in your Top 4 once.');
      for (const id of chosen) {
        if (!(await db.get('SELECT 1 FROM books WHERE id = ?', [id]))) throw new HttpError(404, 'Book not found.');
      }

      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM favorite_books WHERE user_id = ?', [user.id]);
        for (const [i, id] of ids.entries()) {
          if (id !== null)
            await tx.run('INSERT INTO favorite_books (user_id, position, book_id) VALUES (?, ?, ?)', [user.id, i + 1, id]);
        }
      });
      res.json({ favorites: await favorites(db, user.id) });
    }),
  );

  // Reader search: username match, names that start with the query first
  r.get(
    '/',
    h(async (req, res) => {
      const q = String(req.query.q ?? '')
        .trim()
        .slice(0, 50);
      if (q.length < 2) return void res.json({ results: [] });
      const esc = escapeLike(q);
      const results = await readerCards(
        db,
        currentUser(res).id,
        `FROM users u
         WHERE lower(u.username) LIKE lower(?) ESCAPE '\\'
         ORDER BY (lower(u.username) LIKE lower(?) ESCAPE '\\') DESC, length(u.username), u.username
         LIMIT 20`,
        [`%${esc}%`, `${esc}%`],
      );
      res.json({ results });
    }),
  );

  // Profile page data
  r.get(
    '/:username',
    h(async (req, res) => {
      const row = await findUser(db, req.params.username);
      const me = currentUser(res);
      res.json({
        user: {
          id: row.id,
          username: row.username,
          bio: row.bio,
          avatarUrl: row.avatar_url,
          role: row.role,
          createdAt: row.created_at,
        },
        isMe: row.id === me.id,
        isFollowing: Boolean(
          await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?', [me.id, row.id]),
        ),
        stats: await stats(db, row.id),
        favorites: await favorites(db, row.id),
        ratings: await ratingCounts(db, row.id),
        tags: await tags(db, row.id),
        recent: await listEntries(db, row.id, { limit: 6 }),
        reviews: await listEntries(db, row.id, { limit: 3, withReview: true }),
      });
    }),
  );

  // Follow a reader. Following twice is fine (nothing changes).
  r.put(
    '/:username/follow',
    h(async (req, res) => {
      const me = currentUser(res);
      const target = await findUser(db, req.params.username);
      if (target.id === me.id) throw new HttpError(400, "You can't follow yourself.");
      const { changes } = await db.run(
        'INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
        [me.id, target.id, now()],
      );
      if (changes) await notify(db, { to: target.id, actor: me.id, type: 'follow' });
      res.json({ following: true, followers: await followerCount(db, target.id) });
    }),
  );

  // Unfollow a reader.
  r.delete(
    '/:username/follow',
    h(async (req, res) => {
      const me = currentUser(res);
      const target = await findUser(db, req.params.username);
      await db.run('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', [me.id, target.id]);
      await unnotify(db, { to: target.id, actor: me.id, type: 'follow' });
      res.json({ following: false, followers: await followerCount(db, target.id) });
    }),
  );

  // Who follows this reader (newest first)
  r.get(
    '/:username/followers',
    h(async (req, res) => {
      const target = await findUser(db, req.params.username);
      const results = await readerCards(
        db,
        currentUser(res).id,
        `FROM follows fl JOIN users u ON u.id = fl.follower_id
         WHERE fl.followee_id = ? ORDER BY fl.created_at DESC LIMIT ${LIST_LIMIT}`,
        [target.id],
      );
      res.json({ username: target.username, results });
    }),
  );

  // Who this reader follows (newest first)
  r.get(
    '/:username/following',
    h(async (req, res) => {
      const target = await findUser(db, req.params.username);
      const results = await readerCards(
        db,
        currentUser(res).id,
        `FROM follows fl JOIN users u ON u.id = fl.followee_id
         WHERE fl.follower_id = ? ORDER BY fl.created_at DESC LIMIT ${LIST_LIMIT}`,
        [target.id],
      );
      res.json({ username: target.username, results });
    }),
  );

  return r;
}
