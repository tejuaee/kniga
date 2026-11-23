export interface User {
  id: number;
  username: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
  year: number | null;
  isbn?: string | null;
  openLibraryId?: string | null;
  description?: string | null;
  pageCount?: number | null;
}

export interface Entry {
  id: number;
  book: Book;
  readOn: string | null;
  rating: number | null;
  review: string;
  hasSpoiler: boolean;
  isReread: boolean;
  liked: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookPage {
  book: Book;
  stats: { ratings: number; average: number | null; readers: number };
  me: null | {
    read: boolean;
    liked: boolean;
    wantToRead: boolean;
    rating: number | null;
    entries: Entry[];
  };
}

export interface LogInput {
  bookId?: number;
  readOn: string | null;
  rating: number | null;
  review: string;
  hasSpoiler: boolean;
  isReread: boolean;
  liked: boolean;
  tags: string[];
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields ?? {};
  }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong.', data.fields);
  return data as T;
}

/** Today in the reader's own timezone, as YYYY-MM-DD. */
export function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export interface Profile {
  user: Pick<User, 'id' | 'username' | 'bio' | 'avatarUrl' | 'role' | 'createdAt'>;
  isMe: boolean;
  stats: { books: number; thisYear: number; reviews: number; liked: number; wantToRead: number };
  /** Always four slots; null is an empty slot. */
  favorites: (Book | null)[];
  /** Books per half-star step, index 0 = ½ star … index 9 = 5 stars. */
  ratings: number[];
  tags: { name: string; count: number }[];
  recent: Entry[];
  reviews: Entry[];
}

export interface MemberResult {
  username: string;
  bio: string;
  avatarUrl: string | null;
  role: string;
  /** Books marked as read. */
  books: number;
}
