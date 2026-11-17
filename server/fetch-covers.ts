// Backfill covers (and Open Library id / ISBN / page count) for catalog books that have no cover yet,
// e.g. the seed catalog. Uses the free Open Library API — no key needed.
//
//   npm run covers                 # books without a cover
//   npm run covers -- --all        # re-check every book
import { openDb } from './db.ts';
import type { BookRow } from './books.ts';

interface Doc {
  key: string;
  title: string;
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
}

const db = openDb(process.env.DATABASE_PATH ?? 'data/kniga.db');
const all = process.argv.includes('--all');
const books = db
  .prepare(`SELECT * FROM books ${all ? '' : 'WHERE cover_url IS NULL'} ORDER BY id`)
  .all() as unknown as BookRow[];

const olidTaken = db.prepare('SELECT id FROM books WHERE open_library_id = ? AND id != ?');
const update = db.prepare(
  `UPDATE books SET cover_url = ?, open_library_id = COALESCE(?, open_library_id),
     isbn = COALESCE(isbn, ?), page_count = COALESCE(page_count, ?) WHERE id = ?`,
);

async function search(title: string, author: string): Promise<Doc | undefined> {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('title', title);
  if (author && !['Various', 'Unknown'].includes(author)) url.searchParams.set('author', author);
  url.searchParams.set('limit', '5');
  url.searchParams.set('fields', 'key,title,isbn,cover_i,number_of_pages_median');
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Kniga/0.1 (book diary app)' } });
  if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
  const { docs = [] } = (await res.json()) as { docs?: Doc[] };
  return docs.find((d) => d.cover_i); // first hit that actually has a cover
}

/** Title + author first; if the author spelling doesn't match Open Library's, retry by title alone. One retry on network errors. */
async function lookup(title: string, author: string): Promise<Doc | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await search(title, author)) ?? (author ? await search(title, '') : undefined);
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

let found = 0;
console.log(`Looking up ${books.length} book(s) on Open Library…`);
for (const b of books) {
  try {
    const d = await lookup(b.title, b.author);
    if (!d?.cover_i) {
      console.log(`  –  ${b.title}: no cover found`);
    } else {
      const olid = d.key.replace('/works/', '');
      const safeOlid = olidTaken.get(olid, b.id) ? null : olid; // another row already owns this work
      update.run(`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`, safeOlid, d.isbn?.[0] ?? null, d.number_of_pages_median ?? null, b.id);
      found++;
      console.log(`  ✓  ${b.title}`);
    }
  } catch (err) {
    console.log(`  ✗  ${b.title}: ${(err as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 400)); // be polite to Open Library
}
console.log(`Done: ${found}/${books.length} covers added.`);
