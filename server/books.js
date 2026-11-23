import { Router } from 'express';
import { now, escapeLike } from './db/index.js';
import { HttpError, h } from './http.js';
import { requireAuth, currentUser } from './auth.js';
import { FEATURED_TITLES } from './seed-books.js';
import { listEntries } from './logs.js';

/** Database row (snake_case) → API book (camelCase). */
export const toBook = (b) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  coverUrl: b.cover_url,
  year: b.published_year,
  isbn: b.isbn,
  openLibraryId: b.open_library_id,
  description: b.description,
  pageCount: b.page_count,
});

/** UC-02 alternative flow 2a: look the title up in Open Library and save hits into the catalog. */
async function searchOpenLibrary(db, q) {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '10');
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median');
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'Kniga/0.1 (book diary app)' },
  });
  if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
  const data = await res.json();

  const results = [];
  for (const d of data.docs ?? []) {
    if (!d.key || !d.title) continue;
    const olid = d.key.replace('/works/', '');
    await db.run(
      `INSERT INTO books (title, author, cover_url, published_year, isbn, open_library_id, page_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (open_library_id) DO NOTHING`,
      [
        d.title,
        d.author_name?.[0] ?? '',
        d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        d.first_publish_year ?? null,
        d.isbn?.[0] ?? null,
        olid,
        d.number_of_pages_median ?? null,
      ],
    );
    results.push(await db.get('SELECT * FROM books WHERE open_library_id = ?', [olid]));
  }
  return results;
}

async function getStatus(db, userId, bookId) {
  return db.get('SELECT is_read, is_liked, want_to_read FROM user_books WHERE user_id = ? AND book_id = ?', [
    userId,
    bookId,
  ]);
}

export function booksRouter(db, opts = {}) {
  const r = Router();
  const olSearch = opts.openLibrary ?? searchOpenLibrary;

  // Login page shelf
  r.get(
    '/featured',
    h(async (_req, res) => {
      const rows = await db.all(
        `SELECT * FROM books WHERE title IN (${FEATURED_TITLES.map(() => '?').join(',')})`,
        FEATURED_TITLES,
      );
      rows.sort((a, b) => FEATURED_TITLES.indexOf(a.title) - FEATURED_TITLES.indexOf(b.title));
      res.json({ books: rows.map(toBook) });
    }),
  );

  // UC-02: search by title, author or ISBN
  r.get(
    '/search',
    h(async (req, res) => {
      const q = String(req.query.q ?? '')
        .trim()
        .slice(0, 200);
      if (q.length < 2) return void res.json({ results: [], source: 'catalog' });

      const like = `%${escapeLike(q)}%`;
      const catalog = await db.all(
        `SELECT * FROM books
         WHERE lower(title) LIKE lower(?) ESCAPE '\\' OR lower(author) LIKE lower(?) ESCAPE '\\' OR isbn = ?
         ORDER BY (lower(title) LIKE lower(?) ESCAPE '\\') DESC, title
         LIMIT 20`,
        [like, like, q.replace(/[-\s]/g, ''), `${escapeLike(q)}%`],
      );
      if (catalog.length) return void res.json({ results: catalog.map(toBook), source: 'catalog' });

      try {
        const found = await olSearch(db, q);
        res.json({ results: found.map(toBook), source: 'openlibrary' });
      } catch {
        // UC-02 2c: API down → show catalog results (none here) with a warning
        res.json({
          results: [],
          source: 'catalog',
          warning: "Open Library isn't responding right now, so only Kniga's catalog was searched.",
        });
      }
    }),
  );

  // UC-03: book page data (+ the viewer's own status and diary entries)
  r.get(
    '/:id',
    h(async (req, res) => {
      const id = Number(req.params.id);
      const book = await db.get('SELECT * FROM books WHERE id = ?', [id]);
      if (!book) throw new HttpError(404, 'Book not found.');

      // Reader average uses each reader's most recent rating (one active rating per user per book).
      const stats = await db.get(
        `WITH latest AS (
           SELECT e.rating FROM log_entries e
           WHERE e.book_id = ? AND e.rating IS NOT NULL
             AND e.id = (SELECT e2.id FROM log_entries e2
                         WHERE e2.user_id = e.user_id AND e2.book_id = e.book_id AND e2.rating IS NOT NULL
                         ORDER BY COALESCE(e2.read_on, substr(e2.created_at, 1, 10)) DESC, e2.id DESC LIMIT 1)
         )
         SELECT COUNT(*) AS ratings, AVG(rating) AS average FROM latest`,
        [id],
      );
      const readers = await db.get('SELECT COUNT(*) AS n FROM user_books WHERE book_id = ? AND is_read = 1', [id]);

      const user = res.locals.user;
      let me = null;
      if (user) {
        const status = await getStatus(db, user.id, id);
        const entries = await listEntries(db, user.id, { bookId: id });
        const rated = entries.find((e) => e.rating !== null);
        me = {
          read: Boolean(status?.is_read),
          liked: Boolean(status?.is_liked),
          wantToRead: Boolean(status?.want_to_read),
          rating: rated?.rating ?? null,
          entries,
        };
      }
      res.json({
        book: toBook(book),
        stats: { ratings: stats.ratings, average: stats.average, readers: readers.n },
        me,
      });
    }),
  );

  // UC-05 1a (Read without a diary entry), UC-08 (♥), UC-10 (Want to read)
  r.put(
    '/:id/status',
    requireAuth,
    h(async (req, res) => {
      const user = currentUser(res);
      const id = Number(req.params.id);
      if (!(await db.get('SELECT 1 FROM books WHERE id = ?', [id]))) throw new HttpError(404, 'Book not found.');
      const body = req.body ?? {};
      const cur = (await getStatus(db, user.id, id)) ?? { is_read: 0, is_liked: 0, want_to_read: 0 };
      let { is_read, is_liked, want_to_read } = cur;

      if (typeof body.read === 'boolean') {
        if (!body.read) {
          const hasEntries = await db.get('SELECT 1 FROM log_entries WHERE user_id = ? AND book_id = ? LIMIT 1', [
            user.id,
            id,
          ]);
          if (hasEntries)
            throw new HttpError(409, 'This book is in your diary. Delete those entries to un-mark it as read.');
          is_liked = 0;
        }
        is_read = body.read ? 1 : 0;
      }
      if (typeof body.liked === 'boolean') {
        is_liked = body.liked ? 1 : 0;
        if (body.liked) is_read = 1; // ♥ includes "mark as read"
      }
      if (typeof body.wantToRead === 'boolean') want_to_read = body.wantToRead ? 1 : 0;
      if (is_read) want_to_read = 0; // reading a book removes it from Want to read (UC-10)

      await db.run(
        `INSERT INTO user_books (user_id, book_id, is_read, is_liked, want_to_read) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, book_id) DO UPDATE SET is_read = excluded.is_read, is_liked = excluded.is_liked,
           want_to_read = excluded.want_to_read, updated_at = ?`,
        [user.id, id, is_read, is_liked, want_to_read, now()],
      );
      res.json({ read: Boolean(is_read), liked: Boolean(is_liked), wantToRead: Boolean(want_to_read) });
    }),
  );

  return r;
}
