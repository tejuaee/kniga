import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED_BOOKS } from './seed-books.ts';

export type DB = DatabaseSync;

// Tables follow "KNIGA — ERD.pdf". Additions beyond the ERD are marked and exist because
// the UML use cases need them:
//   users.password_hash / email_verified_at  – UC-01 (sign up, verify email, log in)
//   sessions, email_verifications            – UC-01
//   books.description / page_count           – UC-03 shows them
//   log_entries.liked                        – UC-05 form has a ♥ toggle per entry
//   user_books                               – "Read" without an entry (UC-05 1a), ♥ (UC-08),
//                                              Want-to-read (UC-10)
//   favorite_books                           – profile page Top 4
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY,
  username          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash     TEXT NOT NULL,
  bio               TEXT NOT NULL DEFAULT '',
  avatar_url        TEXT,
  role              TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'critic', 'admin')),
  email_verified_at TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id              INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  author          TEXT NOT NULL DEFAULT '',
  cover_url       TEXT,
  published_year  INTEGER,
  isbn            TEXT,
  open_library_id TEXT UNIQUE,
  description     TEXT,
  page_count      INTEGER
);
CREATE INDEX IF NOT EXISTS books_title ON books(title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS log_entries (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  read_on     TEXT,
  rating      REAL CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
  review_text TEXT NOT NULL DEFAULT '',
  has_spoiler INTEGER NOT NULL DEFAULT 0,
  is_reread   INTEGER NOT NULL DEFAULT 0,
  liked       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS log_entries_user ON log_entries(user_id, read_on);
CREATE INDEX IF NOT EXISTS log_entries_book ON log_entries(book_id);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id INTEGER NOT NULL REFERENCES log_entries(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE IF NOT EXISTS user_books (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  is_read      INTEGER NOT NULL DEFAULT 0,
  is_liked     INTEGER NOT NULL DEFAULT 0,
  want_to_read INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, book_id)
);

-- Profile "Top 4" favourite books (Letterboxd-style). Not in the ERD; the profile design needs it.
CREATE TABLE IF NOT EXISTS favorite_books (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, position),
  UNIQUE (user_id, book_id)
);
`;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db: DB) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number };
  if (row.n > 0) return;
  const insert = db.prepare('INSERT INTO books (title, author, published_year) VALUES (?, ?, ?)');
  transaction(db, () => {
    for (const b of SEED_BOOKS) insert.run(b.title, b.author, b.year);
  });
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
