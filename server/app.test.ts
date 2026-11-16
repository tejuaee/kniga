process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { outbox } from './mailer.ts';

let server: Server;
let base = '';

before(async () => {
  const db = openDb(':memory:');
  const app = createApp(db, {
    // Never hit the real network in tests.
    openLibrary: async () => {
      throw new Error('offline');
    },
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => server.close());

/** Tiny client that keeps a cookie jar like a browser. */
function client() {
  let cookie = '';
  return async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (set?.includes('kniga_session=;')) cookie = '';
    return { status: res.status, body: (await res.json()) as any };
  };
}

const today = () => new Date().toISOString().slice(0, 10);

test('sign up validates fields', async () => {
  const api = client();
  const r = await api('/auth/register', 'POST', { username: 'a', email: 'nope', password: 'short' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.username && r.body.fields.email && r.body.fields.password);

  const r2 = await api('/auth/register', 'POST', { username: 'reader1', email: 'r1@example.com', password: 'onlyletters' });
  assert.equal(r2.status, 400);
  assert.match(r2.body.fields.password, /letter and one number/);
});

test('sign up creates an account, logs in, sends a confirmation email', async () => {
  const api = client();
  const r = await api('/auth/register', 'POST', { username: 'Tsegts', email: 'Tsegts@Example.com', password: 'books4ever' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'tsegts@example.com');
  assert.equal(r.body.user.emailVerified, false);

  const me = await api('/auth/me');
  assert.equal(me.body.user.username, 'Tsegts');

  const mail = outbox.at(-1)!;
  assert.equal(mail.to, 'tsegts@example.com');
  const token = new URL(mail.link!).searchParams.get('token');
  assert.equal((await api('/auth/verify', 'POST', { token })).status, 200);
  assert.equal((await api('/auth/me')).body.user.emailVerified, true);
  assert.equal((await api('/auth/verify', 'POST', { token })).status, 400, 'token is single-use');
});

test('duplicate username / email are rejected (UC-01 4a)', async () => {
  const api = client();
  const r = await api('/auth/register', 'POST', { username: 'tsegts', email: 'TSEGTS@example.com', password: 'books4ever' });
  assert.equal(r.status, 409);
  assert.ok(r.body.fields.username);
  assert.ok(r.body.fields.email);
});

test('log in by email or username; wrong password is a generic error; logout ends the session', async () => {
  const api = client();
  const bad = await api('/auth/login', 'POST', { identifier: 'tsegts', password: 'wrong-pass1' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, 'Incorrect email/username or password.');
  const unknown = await api('/auth/login', 'POST', { identifier: 'nobody', password: 'wrong-pass1' });
  assert.equal(unknown.body.error, bad.body.error, "don't reveal which accounts exist");

  assert.equal((await api('/auth/login', 'POST', { identifier: 'TSEGTS', password: 'books4ever' })).status, 200);
  assert.equal((await api('/auth/login', 'POST', { identifier: 'tsegts@example.com', password: 'books4ever' })).status, 200);
  assert.ok((await api('/auth/me')).body.user);

  await api('/auth/logout', 'POST');
  assert.equal((await api('/auth/me')).body.user, null);
});

test('state-changing requests must be JSON (CSRF guard)', async () => {
  const res = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'identifier=tsegts&password=books4ever',
  });
  assert.equal(res.status, 415);
});

test('logging requires a session', async () => {
  const api = client();
  assert.equal((await api('/logs', 'POST', { bookId: 1 })).status, 401);
});

test('log entries: create, validate, re-read, edit, delete', async () => {
  const api = client();
  await api('/auth/register', 'POST', { username: 'sukhbat', email: 'sukhbat@example.com', password: 'readmore1' });

  const search = await api('/books/search?q=hail%20mary');
  assert.equal(search.body.source, 'catalog');
  const book = search.body.results[0];
  assert.equal(book.title, 'Project Hail Mary');

  // Want to read first; logging should remove it (UC-10)
  await api(`/books/${book.id}/status`, 'PUT', { wantToRead: true });

  // validation
  const future = await api('/logs', 'POST', { bookId: book.id, readOn: '2999-01-01' });
  assert.equal(future.status, 400);
  assert.ok(future.body.fields.readOn);
  const badRating = await api('/logs', 'POST', { bookId: book.id, rating: 4.3 });
  assert.ok(badRating.body.fields.rating);
  const noBook = await api('/logs', 'POST', { bookId: 99999 });
  assert.ok(noBook.body.fields.bookId);

  const created = await api('/logs', 'POST', {
    bookId: book.id,
    readOn: today(),
    rating: 4.5,
    review: 'Rocky is the best.',
    hasSpoiler: false,
    liked: true,
    tags: ['Sci-Fi', ' sci-fi ', 'Space  Opera'],
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.entry.tags, ['sci-fi', 'space opera']);
  assert.equal(created.body.entry.rating, 4.5);

  let page = await api(`/books/${book.id}`);
  assert.equal(page.body.me.read, true);
  assert.equal(page.body.me.liked, true);
  assert.equal(page.body.me.wantToRead, false);
  assert.equal(page.body.me.rating, 4.5);
  assert.equal(page.body.stats.average, 4.5);

  // re-read: second entry, first one stays (UC-05 3b); active rating = latest
  const reread = await api('/logs', 'POST', { bookId: book.id, readOn: today(), rating: 5, isReread: true });
  assert.equal(reread.body.entry.isReread, true);
  page = await api(`/books/${book.id}`);
  assert.equal(page.body.me.entries.length, 2);
  assert.equal(page.body.me.rating, 5);
  assert.equal(page.body.stats.ratings, 1, 'one active rating per reader');

  // spoiler flag needs a review
  const edited = await api(`/logs/${reread.body.entry.id}`, 'PATCH', { readOn: today(), rating: 3, hasSpoiler: true });
  assert.equal(edited.body.entry.rating, 3);
  assert.equal(edited.body.entry.hasSpoiler, false);

  // tag suggestions
  const tags = await api('/logs/tags?q=sp');
  assert.deepEqual(tags.body.tags, ['space opera']);

  // diary
  const diary = await api('/logs');
  assert.equal(diary.body.entries.length, 2);
  assert.deepEqual(diary.body.years, [new Date().getUTCFullYear()]);

  // other users can't touch it
  const other = client();
  await other('/auth/register', 'POST', { username: 'temuujin', email: 't@example.com', password: 'readmore2' });
  assert.equal((await other(`/logs/${created.body.entry.id}`, 'DELETE')).status, 404);

  // delete keeps "Read" (UC-06 1a) but can't un-read while entries exist
  assert.equal((await api(`/books/${book.id}/status`, 'PUT', { read: false })).status, 409);
  await api(`/logs/${created.body.entry.id}`, 'DELETE');
  await api(`/logs/${reread.body.entry.id}`, 'DELETE');
  page = await api(`/books/${book.id}`);
  assert.equal(page.body.me.entries.length, 0);
  assert.equal(page.body.me.read, true);
  assert.equal(page.body.stats.ratings, 0);
});

test('search falls back gracefully when Open Library is down (UC-02 2c)', async () => {
  const api = client();
  const r = await api('/books/search?q=zzzz-not-a-real-book');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results, []);
  assert.ok(r.body.warning);
});
