import { SEED_BOOKS } from '../seed-books.js';
import { createSqliteDb } from './sqlite.js';
import { createPostgresDb } from './postgres.js';

/**
 * Opens the database. Which one is chosen by environment variables:
 *
 *   DB_CLIENT=sqlite  (default)  → a local file, DATABASE_PATH (default data/kniga.db)
 *   DB_CLIENT=postgres           → Postgres / Supabase at DATABASE_URL
 *
 * Every database object has the same async methods, so the rest of the server doesn't care which one it is:
 *
 *   await db.get(sql, [params])   → first row, or undefined
 *   await db.all(sql, [params])   → array of rows
 *   await db.run(sql, [params])   → { changes }
 *   await db.transaction(async (tx) => { ... })   → tx has get/all/run; all-or-nothing
 *
 * Rules for SQL so it works on both databases:
 *   - use `?` for parameters
 *   - get new ids with `INSERT ... RETURNING id` (db.get), not "last insert id"
 *   - pass the current time from JavaScript (`now()` below), don't use strftime()/NOW()
 *   - case-insensitive text matching: lower(column) = lower(?) / lower(column) LIKE lower(?)
 *   - only database calls inside a transaction (no fetch() etc.)
 */
export async function openDb(options = {}) {
  const client = options.client ?? process.env.DB_CLIENT ?? 'sqlite';
  let db;
  if (client === 'sqlite') {
    db = createSqliteDb(options.path ?? process.env.DATABASE_PATH ?? 'data/kniga.db');
  } else if (client === 'postgres') {
    db = await createPostgresDb(options.url ?? process.env.DATABASE_URL, { pool: options.pool });
  } else {
    throw new Error(`Unknown DB_CLIENT "${client}". Use "sqlite" or "postgres".`);
  }
  await seed(db);
  return db;
}

/** First run: fill the catalog with the starting book list. */
async function seed(db) {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM books');
  if (n > 0) return;
  await db.transaction(async (tx) => {
    for (const b of SEED_BOOKS) {
      await tx.run('INSERT INTO books (title, author, published_year) VALUES (?, ?, ?)', [b.title, b.author, b.year]);
    }
  });
}

/** Current time as stored in the database (ISO-8601 text). */
export const now = () => new Date().toISOString();

/** Escape LIKE wildcards in user input; use with `ESCAPE '\'`. */
export const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
