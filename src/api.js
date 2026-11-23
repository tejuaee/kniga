// Talks to the Kniga API. Shapes the API sends back (camelCase):
//
//   User    { id, username, email, bio, avatarUrl, role, emailVerified, createdAt }
//   Book    { id, title, author, coverUrl, year, isbn?, openLibraryId?, description?, pageCount? }
//   Entry   { id, book, readOn, rating, review, hasSpoiler, isReread, liked, tags: [names], createdAt, updatedAt }
//   Reader  { username, bio, avatarUrl, role, books, isFollowing }      (search results, follower lists)
//   Profile { user, isMe, isFollowing, stats: { books, thisYear, reviews, liked, wantToRead, followers, following },
//             favorites: [4 slots: Book or null], ratings: [10 counts, ½★ … 5★], tags, recent: [Entry], reviews: [Entry] }

export class ApiError extends Error {
  status;
  fields;
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields ?? {};
  }
}

export async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong.', data.fields);
  return data;
}

/** Today in the reader's own timezone, as YYYY-MM-DD. */
export function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
