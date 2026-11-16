import { Router } from 'express';
import type { DB } from './db.ts';
import { HttpError, h } from './http.ts';
import { requireAuth, currentUser } from './auth.ts';
import { FEATURED_TITLES } from './seed-books.ts';
import { listEntries } from './logs.ts';

export interface BookRow {
  id: number;
  title: string;
  author: string;
  cover_url: string | null;
  published_year: number | null;
  isbn: string | null;
  open_library_id: string | null;
  description: string | null;
  page_count: number | null;
}

export const toBook = (b: BookRow) => ({
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

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

/** UC-02 alternative flow 2a: look the title up in Open Library and save hits into the catalog. */
async function searchOpenLibrary(db: DB, q: string) {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '10');
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median');
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Kniga/0.1 (book diary app)' } });
  if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
  const data = (await res.json()) as { docs?: OpenLibraryDoc[] };

  const insert = db.prepare(
    `INSERT INTO books (title, author, cover_url, published_year, isbn, open_library_id, page_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(open_library_id) DO NOTHING`,
  );
  const byOlid = db.prepare('SELECT * FROM books WHERE open_library_id = ?');
  const results: BookRow[] = [];
  for (const d of data.docs ?? []) {
    if (!d.key || !d.title) continue;
    const olid = d.key.replace('/works/', '');
    insert.run(
      d.title,
      d.author_name?.[0] ?? '',
      d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      d.first_publish_year ?? null,
      d.isbn?.[0] ?? null,
      olid,
      d.number_of_pages_median ?? null,
    );
    results.push(byOlid.get(olid) as unknown as BookRow);
  }
  return results;
}

export function booksRouter(db: DB, opts: { openLibrary?: typeof searchOpenLibrary } = {}) {
  const r = Router();
  const olSearch = opts.openLibrary ?? searchOpenLibrary;

  // Login page shelf
  r.get('/featured', (_req, res) => {
    const rows = db
      .prepare(`SELECT * FROM books WHERE title IN (${FEATURED_TITLES.map(() => '?').join(',')})`)
      .all(...FEATURED_TITLES) as unknown as BookRow[];
    rows.sort((a, b) => FEATURED_TITLES.indexOf(a.title) - FEATURED_TITLES.indexOf(b.title));
    res.json({ books: rows.map(toBook) });
  });

  // UC-02: search by title, author or ISBN
  r.get(
    '/search',
    h(async (req, res) => {
      const q = String(req.query.q ?? '').trim().slice(0, 200);
      if (q.length < 2) return void res.json({ results: [], source: 'catalog' });

      const like = `%${escapeLike(q)}%`;
      const catalog = db
        .prepare(
          `SELECT * FROM books
           WHERE title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR isbn = ?
           ORDER BY (title LIKE ? ESCAPE '\\') DESC, title
           LIMIT 20`,
        )
        .all(like, like, q.replace(/[-\s]/g, ''), `${escapeLike(q)}%`) as unknown as BookRow[];
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
  r.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined;
    if (!book) throw new HttpError(404, 'Book not found.');

    // Reader average uses each reader's most recent rating (one active rating per user per book).
    const stats = db
      .prepare(
        `WITH latest AS (
           SELECT e.rating FROM log_entries e
           WHERE e.book_id = ? AND e.rating IS NOT NULL
             AND e.id = (SELECT e2.id FROM log_entries e2
                         WHERE e2.user_id = e.user_id AND e2.book_id = e.book_id AND e2.rating IS NOT NULL
                         ORDER BY COALESCE(e2.read_on, substr(e2.created_at, 1, 10)) DESC, e2.id DESC LIMIT 1)
         )
         SELECT COUNT(*) AS ratings, AVG(rating) AS average FROM latest`,
      )
      .get(id) as { ratings: number; average: number | null };
    const readers = db
      .prepare('SELECT COUNT(*) AS n FROM user_books WHERE book_id = ? AND is_read = 1')
      .get(id) as { n: number };

    const user = res.locals.user;
    let me = null;
    if (user) {
      const status = db
        .prepare('SELECT is_read, is_liked, want_to_read FROM user_books WHERE user_id = ? AND book_id = ?')
        .get(user.id, id) as { is_read: number; is_liked: number; want_to_read: number } | undefined;
      const entries = listEntries(db, user.id, { bookId: id });
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
  });

  // UC-05 1a (Read without a diary entry), UC-08 (♥), UC-10 (Want to read)
  r.put('/:id/status', requireAuth, (req, res) => {
    const user = currentUser(res);
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(id)) throw new HttpError(404, 'Book not found.');
    const body = req.body ?? {};
    const cur = (db
      .prepare('SELECT is_read, is_liked, want_to_read FROM user_books WHERE user_id = ? AND book_id = ?')
      .get(user.id, id) as { is_read: number; is_liked: number; want_to_read: number } | undefined) ?? {
      is_read: 0,
      is_liked: 0,
      want_to_read: 0,
    };
    let { is_read, is_liked, want_to_read } = cur;

    if (typeof body.read === 'boolean') {
      if (!body.read) {
        const hasEntries = db
          .prepare('SELECT 1 FROM log_entries WHERE user_id = ? AND book_id = ? LIMIT 1')
          .get(user.id, id);
        if (hasEntries) throw new HttpError(409, 'This book is in your diary. Delete those entries to un-mark it as read.');
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

    db.prepare(
      `INSERT INTO user_books (user_id, book_id, is_read, is_liked, want_to_read) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, book_id) DO UPDATE SET is_read = excluded.is_read, is_liked = excluded.is_liked,
         want_to_read = excluded.want_to_read, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).run(user.id, id, is_read, is_liked, want_to_read);
    res.json({ read: Boolean(is_read), liked: Boolean(is_liked), wantToRead: Boolean(want_to_read) });
  });

  return r;
}
