-- Kniga schema for SQLite (the default, local database).
-- Keep it in step with schema.postgres.sql, which is the same tables for Postgres / Supabase.
--
-- Tables follow "KNIGA — ERD.pdf". Additions beyond the ERD exist because the UML use cases need them:
--   users.password_hash / email_verified_at  – UC-01 (sign up, verify email, log in)
--   sessions, email_verifications            – UC-01
--   books.description / page_count           – UC-03 shows them
--   log_entries.liked                        – UC-05 form has a ♥ toggle per entry
--   user_books                               – "Read" without an entry (UC-05 1a), ♥ (UC-08), Want to read (UC-10)
--   favorite_books                           – profile page Top 4
--   follows                                  – follow / unfollow other readers (week 12)
--   likes, comments, notifications           – likes + comments on reviews (lists later), notifications (week 12)

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

CREATE TABLE IF NOT EXISTS favorite_books (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, position),
  UNIQUE (user_id, book_id)
);

-- follower_id follows followee_id
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee ON follows(followee_id);

-- Likes and comments. target_type says what is liked/commented: 'entry' (a log / review) now, 'list' later.
CREATE TABLE IF NOT EXISTS likes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('entry', 'list')),
  target_id   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS likes_target ON likes(target_type, target_id);

-- Dislikes: same shape as likes. A reader has a like OR a dislike on something, never both (the server makes sure).
CREATE TABLE IF NOT EXISTS dislikes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('entry', 'list')),
  target_id   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS dislikes_target ON dislikes(target_type, target_id);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('entry', 'list')),
  target_id   INTEGER NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS comments_target ON comments(target_type, target_id, id);

-- Notifications: user_id is who gets it, actor_id is who did it. type: 'follow' | 'like' | 'comment'.
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('follow', 'like', 'comment')),
  target_type TEXT,
  target_id   INTEGER,
  comment_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, id);
