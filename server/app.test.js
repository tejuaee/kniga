process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db/index.js';
import { createApp } from './app.js';
import { outbox } from './mailer.js';

let server;
let db;
let base = '';

before(async () => {
  db = await openDb({ client: 'sqlite', path: ':memory:' });
  const app = createApp(db, {
    // Never hit the real network in tests.
    openLibrary: async () => {
      throw new Error('offline');
    },
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await db.close();
});

/** Tiny client that keeps a cookie jar like a browser. */
function client() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (set?.includes('kniga_session=;')) cookie = '';
    return { status: res.status, body: await res.json() };
  };
}

const today = () => new Date().toISOString().slice(0, 10);

test('sign up validates fields', async () => {
  const api = client();
  const r = await api('/auth/register', 'POST', { username: 'a', email: 'nope', password: 'short' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.username && r.body.fields.email && r.body.fields.password);

  const r2 = await api('/auth/register', 'POST', {
    username: 'reader1',
    email: 'r1@example.com',
    password: 'onlyletters',
  });
  assert.equal(r2.status, 400);
  assert.match(r2.body.fields.password, /letter and one number/);
});

test('sign up creates an account, logs in, sends a confirmation email', async () => {
  const api = client();
  const r = await api('/auth/register', 'POST', {
    username: 'Tsegts',
    email: 'Tsegts@Example.com',
    password: 'books4ever',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'tsegts@example.com');
  assert.equal(r.body.user.emailVerified, false);

  const me = await api('/auth/me');
  assert.equal(me.body.user.username, 'Tsegts');

  const mail = outbox.at(-1);
  assert.equal(mail.to, 'tsegts@example.com');
  const token = new URL(mail.link).searchParams.get('token');
  assert.equal((await api('/auth/verify', 'POST', { token })).status, 200);
  assert.equal((await api('/auth/me')).body.user.emailVerified, true);
  assert.equal((await api('/auth/verify', 'POST', { token })).status, 400, 'token is single-use');
});

test('duplicate username / email are rejected (UC-01 4a)', async () => {
  const api = client();
  const r = await api('/auth/register', 'POST', {
    username: 'tsegts',
    email: 'TSEGTS@example.com',
    password: 'books4ever',
  });
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
  assert.equal(
    (await api('/auth/login', 'POST', { identifier: 'tsegts@example.com', password: 'books4ever' })).status,
    200,
  );
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

test('profile: stats, ratings histogram, tags, Top 4, bio', async () => {
  const api = client();
  await api('/auth/register', 'POST', { username: 'profiler', email: 'profiler@example.com', password: 'readmore3' });
  const find = async (q) => (await api(`/books/search?q=${encodeURIComponent(q)}`)).body.results[0];
  const dune = await find('Dune');
  const hobbit = await find('The Hobbit');
  const gatsby = await find('Great Gatsby');

  await api('/logs', 'POST', { bookId: dune.id, readOn: today(), rating: 4.5, review: 'Spice.', tags: ['sci-fi'] });
  await api('/logs', 'POST', { bookId: dune.id, readOn: today(), rating: 5, isReread: true, tags: ['sci-fi'] });
  await api('/logs', 'POST', { bookId: hobbit.id, readOn: today(), rating: 4, tags: ['fantasy'] });
  await api(`/books/${gatsby.id}/status`, 'PUT', { liked: true });

  let p = await api('/users/PROFILER');
  assert.equal(p.status, 200);
  assert.equal(p.body.user.username, 'profiler');
  assert.equal(p.body.user.email, undefined, "profiles don't leak email");
  assert.equal(p.body.isMe, true);
  assert.deepEqual(p.body.stats, { books: 3, thisYear: 2, reviews: 1, liked: 1, wantToRead: 0, followers: 0, following: 0 });
  // one bar per book, using its latest rating: Dune → 5, Hobbit → 4
  assert.deepEqual(p.body.ratings, [0, 0, 0, 0, 0, 0, 0, 1, 0, 1]);
  assert.deepEqual(p.body.tags, [
    { name: 'sci-fi', count: 2 },
    { name: 'fantasy', count: 1 },
  ]);
  assert.equal(p.body.recent.length, 3);
  assert.equal(p.body.reviews.length, 1);
  assert.deepEqual(p.body.favorites, [null, null, null, null]);

  // Top 4
  assert.equal((await api('/users/me/favorites', 'PUT', { bookIds: [dune.id] })).status, 400);
  assert.equal((await api('/users/me/favorites', 'PUT', { bookIds: [dune.id, dune.id, null, null] })).status, 400);
  assert.equal((await api('/users/me/favorites', 'PUT', { bookIds: [99999, null, null, null] })).status, 404);
  const fav = await api('/users/me/favorites', 'PUT', { bookIds: [hobbit.id, null, dune.id, null] });
  assert.equal(fav.status, 200);
  assert.deepEqual(
    fav.body.favorites.map((b) => b?.id ?? null),
    [hobbit.id, null, dune.id, null],
  );

  // bio
  assert.equal((await api('/users/me', 'PATCH', { bio: 'x'.repeat(301) })).status, 400);
  assert.equal((await api('/users/me', 'PATCH', { bio: '  Reading everything.  ' })).body.bio, 'Reading everything.');

  // someone else's view
  const other = client();
  await other('/auth/register', 'POST', { username: 'visitor', email: 'visitor@example.com', password: 'readmore4' });
  p = await other('/users/profiler');
  assert.equal(p.body.isMe, false);
  assert.equal(p.body.user.bio, 'Reading everything.');
  assert.equal(p.body.favorites[0].title, 'The Hobbit');
  assert.equal((await other('/users/nobody-here')).status, 404);
  assert.equal((await client()('/users/profiler')).status, 401);
});

test('member search: login required, prefix matches first, LIKE wildcards are literal', async () => {
  assert.equal((await client()('/users?q=ab')).status, 401);
  const api = client();
  for (const username of ['zed_reader', 'reader_zed', 'zedd']) {
    await client()('/auth/register', 'POST', { username, email: `${username}@example.com`, password: 'books4ever' });
  }
  await api('/auth/register', 'POST', { username: 'searcher', email: 'searcher@example.com', password: 'books4ever' });

  const r = await api('/users?q=zed');
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.results.map((u) => u.username),
    ['zedd', 'zed_reader', 'reader_zed'],
  );
  assert.equal(r.body.results[0].books, 0);
  assert.equal(r.body.results[0].email, undefined, 'never leaks email');

  assert.deepEqual((await api('/users?q=z')).body.results, [], 'one character is too short');
  assert.deepEqual((await api('/users?q=%25%25')).body.results, [], '% is not a wildcard');
  assert.deepEqual(
    (await api('/users?q=_r')).body.results.map((u) => u.username),
    ['zed_reader'],
  );
});

test('follow / unfollow: counts, lists, search and profile show it', async () => {
  const signup = async (username) => {
    const api = client();
    await api('/auth/register', 'POST', { username, email: `${username}@example.com`, password: 'books4ever' });
    return api;
  };
  const ann = await signup('ann_f');
  const bob = await signup('bob_f');
  const cat = await signup('cat_f');

  assert.equal((await client()('/users/bob_f/follow', 'PUT')).status, 401, 'login required');
  assert.equal((await ann('/users/ann_f/follow', 'PUT')).status, 400, "can't follow yourself");
  assert.equal((await ann('/users/nobody_here/follow', 'PUT')).status, 404);

  let r = await ann('/users/BOB_F/follow', 'PUT'); // usernames are case-insensitive
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { following: true, followers: 1 });
  r = await ann('/users/bob_f/follow', 'PUT');
  assert.equal(r.body.followers, 1, 'following twice changes nothing');
  await cat('/users/bob_f/follow', 'PUT');
  await ann('/users/cat_f/follow', 'PUT');

  const bobProfile = await ann('/users/bob_f');
  assert.equal(bobProfile.body.isFollowing, true);
  assert.equal(bobProfile.body.stats.followers, 2);
  assert.equal(bobProfile.body.stats.following, 0);
  assert.equal((await bob('/users/bob_f')).body.isFollowing, false);
  assert.equal((await ann('/users/ann_f')).body.stats.following, 2);

  const followers = await bob('/users/bob_f/followers');
  assert.deepEqual(followers.body.results.map((u) => u.username).sort(), ['ann_f', 'cat_f']);
  assert.ok(followers.body.results.every((u) => u.isFollowing === false), "bob doesn't follow them back");
  const following = await ann('/users/ann_f/following');
  assert.deepEqual(following.body.results.map((u) => u.username).sort(), ['bob_f', 'cat_f']);
  assert.ok(following.body.results.every((u) => u.isFollowing === true));

  const search = await ann('/users?q=_f');
  const byName = Object.fromEntries(search.body.results.map((u) => [u.username, u.isFollowing]));
  assert.deepEqual(byName, { ann_f: false, bob_f: true, cat_f: true });

  r = await ann('/users/bob_f/follow', 'DELETE');
  assert.deepEqual(r.body, { following: false, followers: 1 });
  assert.equal((await ann('/users/bob_f')).body.isFollowing, false);
  assert.deepEqual((await bob('/users/bob_f/followers')).body.results.map((u) => u.username), ['cat_f']);
});

test('activity feed, likes, comments and notifications', async () => {
  const signup = async (username) => {
    const api = client();
    await api('/auth/register', 'POST', { username, email: `${username}@example.com`, password: 'books4ever' });
    return api;
  };
  const dan = await signup('dan_s');
  const eve = await signup('eve_s');
  const fay = await signup('fay_s');
  const bookId = (await dan('/books/search?q=dune')).body.results[0].id;
  const log = async (api, review) =>
    (await api('/logs', 'POST', { bookId, readOn: today(), rating: 4, review, tags: [] })).body.entry;

  // feed: only readers you follow, newest first, paged
  const e1 = await log(eve, 'First thoughts');
  await log(fay, 'Fay is not followed');
  let feed = await dan('/feed');
  assert.deepEqual(feed.body, { items: [], nextBefore: null, following: 0 });
  await dan('/users/eve_s/follow', 'PUT');
  const e2 = await log(eve, 'Second read');
  feed = await dan('/feed');
  assert.deepEqual(feed.body.items.map((i) => i.id), [e2.id, e1.id]);
  assert.equal(feed.body.items[0].user.username, 'eve_s');
  assert.deepEqual(feed.body.items[0].social, { likes: 0, dislikes: 0, comments: 0, likedByMe: false, dislikedByMe: false });
  assert.equal((await dan(`/feed?before=${e2.id}`)).body.items[0].id, e1.id);

  // likes
  assert.equal((await dan('/entries/999999/like', 'PUT')).status, 404);
  let r = await dan(`/entries/${e1.id}/like`, 'PUT');
  assert.deepEqual(r.body, { likes: 1, dislikes: 0, comments: 0, likedByMe: true, dislikedByMe: false });
  r = await dan(`/entries/${e1.id}/like`, 'PUT');
  assert.equal(r.body.likes, 1, 'liking twice changes nothing');
  await fay(`/entries/${e1.id}/like`, 'PUT');
  await eve(`/entries/${e1.id}/like`, 'PUT'); // liking your own review: counted, no notification

  // comments
  assert.equal((await dan(`/entries/${e1.id}/comments`, 'POST', { body: '   ' })).status, 400);
  assert.equal((await dan(`/entries/${e1.id}/comments`, 'POST', { body: 'x'.repeat(1001) })).status, 400);
  const c1 = (await dan(`/entries/${e1.id}/comments`, 'POST', { body: 'Great take!' })).body.comment;
  assert.equal(c1.user.username, 'dan_s');
  const c2 = (await fay(`/entries/${e1.id}/comments`, 'POST', { body: 'Agreed' })).body.comment;

  const page = await dan(`/entries/${e1.id}`);
  assert.equal(page.body.isMine, false);
  assert.deepEqual(page.body.entry.social, { likes: 3, dislikes: 0, comments: 2, likedByMe: true, dislikedByMe: false });
  assert.deepEqual(page.body.comments.map((c) => [c.body, c.canDelete]), [['Great take!', true], ['Agreed', false]]);
  assert.equal((await dan(`/comments/${c2.id}`, 'DELETE')).status, 403, "can't delete someone else's comment");

  // notifications for eve: follow + 2 likes + 2 comments, newest first, none for her own like
  let n = await eve('/notifications');
  assert.equal(n.body.unread, 5);
  assert.deepEqual(
    n.body.notifications.map((x) => `${x.type}:${x.actor.username}`),
    ['comment:fay_s', 'comment:dan_s', 'like:fay_s', 'like:dan_s', 'follow:dan_s'],
  );
  assert.equal(n.body.notifications[0].entry.bookTitle, 'Dune');
  assert.equal(n.body.notifications[0].comment, 'Agreed');
  assert.equal((await eve('/notifications/unread-count')).body.unread, 5);

  // taking things back removes their notifications
  r = await dan(`/entries/${e1.id}/like`, 'DELETE');
  assert.deepEqual(r.body, { likes: 2, dislikes: 0, comments: 2, likedByMe: false, dislikedByMe: false });
  assert.equal((await eve(`/comments/${c2.id}`, 'DELETE')).status, 200, 'review owner can delete comments');
  assert.equal((await dan(`/comments/${c1.id}`, 'DELETE')).status, 200, 'author can delete their comment');
  n = await eve('/notifications');
  assert.deepEqual(n.body.notifications.map((x) => `${x.type}:${x.actor.username}`), ['like:fay_s', 'follow:dan_s']);

  await eve('/notifications/read', 'POST');
  assert.equal((await eve('/notifications/unread-count')).body.unread, 0);
  assert.ok((await eve('/notifications')).body.notifications.every((x) => x.read));

  // deleting the review clears its likes, comments and notifications
  await dan(`/entries/${e1.id}/comments`, 'POST', { body: 'one more' });
  await eve(`/logs/${e1.id}`, 'DELETE');
  assert.equal((await dan(`/entries/${e1.id}`)).status, 404);
  n = await eve('/notifications');
  assert.deepEqual(n.body.notifications.map((x) => x.type), ['follow']);
});

test('dislikes: like OR dislike, switching swaps them, no notification for dislikes', async () => {
  const signup = async (username) => {
    const api = client();
    await api('/auth/register', 'POST', { username, email: `${username}@example.com`, password: 'books4ever' });
    return api;
  };
  const gus = await signup('gus_d');
  const hal = await signup('hal_d');
  const bookId = (await gus('/books/search?q=dune')).body.results[0].id;
  const entry = (await gus('/logs', 'POST', { bookId, readOn: today(), review: 'Hot take', tags: [] })).body.entry;
  const pick = (b) => [b.likes, b.dislikes, b.likedByMe, b.dislikedByMe];

  let r = await hal(`/entries/${entry.id}/dislike`, 'PUT');
  assert.deepEqual(pick(r.body), [0, 1, false, true]);
  assert.equal((await gus('/notifications/unread-count')).body.unread, 0, 'dislikes are silent');

  r = await hal(`/entries/${entry.id}/like`, 'PUT'); // switch to like
  assert.deepEqual(pick(r.body), [1, 0, true, false]);
  assert.equal((await gus('/notifications/unread-count')).body.unread, 1);

  r = await hal(`/entries/${entry.id}/dislike`, 'PUT'); // and back: the like (and its notification) go away
  assert.deepEqual(pick(r.body), [0, 1, false, true]);
  assert.equal((await gus('/notifications/unread-count')).body.unread, 0);

  r = await hal(`/entries/${entry.id}/dislike`, 'DELETE');
  assert.deepEqual(pick(r.body), [0, 0, false, false]);
  assert.deepEqual(pick((await hal(`/entries/${entry.id}`)).body.entry.social), [0, 0, false, false]);
});
