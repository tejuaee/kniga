import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** SQLite backend, using the database built into Node (node:sqlite). Stores everything in one file. */
export function createSqliteDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const conn = new DatabaseSync(path);
  conn.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') conn.exec('PRAGMA journal_mode = WAL;');
  conn.exec(readFileSync(join(import.meta.dirname, 'schema.sqlite.sql'), 'utf8'));

  // Re-use prepared statements: the same SQL text is run many times.
  const statements = new Map();
  const prepare = (sql) => {
    let stmt = statements.get(sql);
    if (!stmt) {
      stmt = conn.prepare(sql);
      statements.set(sql, stmt);
    }
    return stmt;
  };

  const queries = {
    async get(sql, params = []) {
      return prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      return { changes: Number(prepare(sql).run(...params).changes) };
    },
  };

  let inTransaction = false;
  return {
    client: 'sqlite',
    ...queries,
    async transaction(fn) {
      if (inTransaction) return fn(queries); // nested call: part of the outer transaction
      inTransaction = true;
      conn.exec('BEGIN');
      try {
        const result = await fn(queries);
        conn.exec('COMMIT');
        return result;
      } catch (err) {
        conn.exec('ROLLBACK');
        throw err;
      } finally {
        inTransaction = false;
      }
    },
    async close() {
      conn.close();
    },
  };
}
