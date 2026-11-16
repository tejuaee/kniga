# Kniga

A social network for books: log what you read, rate it from ½ to 5 stars, review it and keep a reading diary.
Inspired by Letterboxd. Book data comes from [Open Library](https://openlibrary.org).

Team: Sh. Temuujin, T. Tsegts, S. Sukhbat. The design lives in the Figma file *KNIGA — App Design*.
The spec is the *KNIGA — UML загварчлал* + *KNIGA — ERD* documents.

## What works so far

| Use case | Status |
| --- | --- |
| UC-01 Sign up / log in | ✅ Sign up, log in with email **or** username, "keep me logged in", log out, email confirmation link |
| UC-02 Search books | ✅ Searches the catalog; falls back to Open Library and saves results; warns if the API is down |
| UC-05 Mark as read | ✅ Every log marks the book Read and removes it from Want to read |
| UC-06 Rate | ✅ Half-star ratings (click the left half of a star; arrow keys work too) |
| UC-07 Write a review | ✅ Review text with a spoiler flag |
| UC-08 ♥ Like | ✅ From the log form or the book page |
| UC-09 Tags | ✅ Lowercased, de-duplicated, suggestions from tags you used before |
| UC-10 Want to read | ✅ Toggle on the book page |
| Diary | ✅ Letterboxd-style diary grouped by month, edit/delete entries, filter by year |
| Recent Logs | ✅ Home page shows your 10 latest entries, 4 at a time, horizontally scrollable |

Not built yet: profile pages, Top 4, lists, review likes/comments, following, critic verification, Patron covers,
password reset and Google sign-in.

## Run it

Requires **Node 23.6+** (uses Node's built-in SQLite and runs the TypeScript server directly).

```bash
npm install
npm run dev        # API on :3001, web app on :5173 (Vite picks the next free port if 5173 is taken)
```

Open the web app URL Vite prints and create an account. In development, emails (the confirmation link)
are printed in the terminal running the API instead of being sent.

```bash
npm test           # API tests (auth + log entries)
npm run typecheck
npm run build && npm start   # production: one server on :3001 serves the API and the built app
```

Environment variables: `PORT` (3001), `DATABASE_PATH` (`data/kniga.db`), `APP_URL` (used in email links,
default `http://localhost:5173`).

## How it's built

- **Frontend:** React 18 + TypeScript + Vite, React Router. Styles in `src/styles.css` use the same tokens as Figma
  (cream/linen base, beige accents, sky blue, light navy grey).
- **Backend:** Express + `node:sqlite`. Code in `server/`.
- **Auth:** scrypt password hashes, random session tokens stored hashed in the database, HttpOnly SameSite=Lax
  cookies, login rate limiting, generic "incorrect email/username or password" errors. State-changing requests must
  be JSON, which blocks cross-site form posts.

### Database

Tables follow the ERD (`users`, `books`, `log_entries`, `tags`, `entry_tags`), plus what the use cases need:

- `sessions`, `email_verifications`: sign-up and login (UC-01)
- `user_books`: Read without an entry, ♥ and Want to read (UC-05 1a, UC-08, UC-10). The ERD had no table for these.
- `log_entries.liked`: the ♥ toggle on each log
- `books.description`, `books.page_count`: shown on the book page (UC-03)

**Rating rule:** each log entry can carry a rating. A reader's *active* rating for a book is the one on their most
recent rated entry, so averages count one rating per reader, as the UML requires.

The 58-book starting catalog from the UML appendix is seeded on first run (`server/seed-books.ts`).

## Repo layout

```
server/        API (auth.ts, books.ts, logs.ts, db.ts) + tests
src/           React app (pages/, components/)
design/        the original profile-page design export
```
