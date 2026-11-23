import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Postgres backend, for Supabase (or any Postgres). Needs the `pg` package: `npm install pg`.
 *
 * The app writes SQL with `?` placeholders (SQLite style); they are turned into `$1, $2, …` here.
 * `pool` can be passed in instead of a URL (the tests do this); it must look like a pg.Pool.
 */
export async function createPostgresDb(url, { pool } = {}) {
  if (!pool) {
    if (!url) throw new Error('DB_CLIENT=postgres needs DATABASE_URL (Supabase → Project Settings → Database).');
    let pg;
    try {
      pg = (await import('pg')).default;
    } catch {
      throw new Error('DB_CLIENT=postgres needs the "pg" package. Run: npm install pg');
    }
    // COUNT(*) comes back as bigint and AVG(...) as numeric; pg returns both as strings unless told otherwise.
    pg.types.setTypeParser(20, Number);
    pg.types.setTypeParser(1700, Number);
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  }

  await pool.query(readFileSync(join(import.meta.dirname, 'schema.postgres.sql'), 'utf8'));

  const toPg = (sql) => {
    let n = 0;
    return sql.replace(/\?/g, () => `$${++n}`);
  };
  const queriesOn = (c) => ({
    async get(sql, params = []) {
      return (await c.query(toPg(sql), params)).rows[0];
    },
    async all(sql, params = []) {
      return (await c.query(toPg(sql), params)).rows;
    },
    async run(sql, params = []) {
      return { changes: (await c.query(toPg(sql), params)).rowCount ?? 0 };
    },
  });

  return {
    client: 'postgres',
    ...queriesOn(pool),
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const result = await fn(queriesOn(c));
        await c.query('COMMIT');
        return result;
      } catch (err) {
        await c.query('ROLLBACK');
        throw err;
      } finally {
        c.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
