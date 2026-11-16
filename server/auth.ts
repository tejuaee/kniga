import { Router, type Request, type Response, type NextFunction } from 'express';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { DB } from './db.ts';
import { HttpError, h } from './http.ts';
import { createLimiter } from './rate-limit.ts';
import { send, appUrl } from './mailer.ts';

export const SESSION_COOKIE = 'kniga_session';
const REMEMBER_DAYS = 30;
const SHORT_SESSION_HOURS = 24;
const VERIFY_HOURS = 48;

// ---------- passwords (scrypt, salted; format: scrypt$N$r$p$salt$hash)
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, N, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// A real hash of a random password, used so failed lookups take as long as real checks.
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));

// ---------- tokens
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

// ---------- users
interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  bio: string;
  avatar_url: string | null;
  role: string;
  email_verified_at: string | null;
  created_at: string;
}

export interface PublicUser {
  id: number;
  username: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  username: u.username,
  email: u.email,
  bio: u.bio,
  avatarUrl: u.avatar_url,
  role: u.role,
  emailVerified: Boolean(u.email_verified_at),
  createdAt: u.created_at,
});

// ---------- validation (UC-01 steps 4, 4a, 4b)
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function validateSignup(body: Record<string, unknown>) {
  const username = str(body.username).trim();
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  const fields: Record<string, string> = {};

  if (!USERNAME_RE.test(username)) fields.username = 'Use 3–20 letters, numbers or underscores.';
  if (!EMAIL_RE.test(email) || email.length > 254) fields.email = 'Enter a valid email address.';
  if (password.length < 8) fields.password = 'Use at least 8 characters.';
  else if (password.length > 128) fields.password = 'Use 128 characters or fewer.';
  else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    fields.password = 'Include at least one letter and one number.';

  if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', fields);
  return { username, email, password };
}

// ---------- sessions
function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createSession(db: DB, res: Response, userId: number, remember: boolean) {
  const token = newToken();
  const ms = remember ? REMEMBER_DAYS * 864e5 : SHORT_SESSION_HOURS * 36e5;
  const expires = new Date(Date.now() + ms);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expires.toISOString(),
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // "Keep me logged in" → persistent cookie; otherwise it ends with the browser session.
    ...(remember ? { expires } : {}),
  });
}

/** Attaches res.locals.user when a valid session cookie is present. */
export function loadUser(db: DB) {
  const find = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  );
  return (req: Request, res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const row = find.get(sha256(token), new Date().toISOString()) as UserRow | undefined;
      if (row) {
        res.locals.user = toPublicUser(row);
        res.locals.sessionHash = sha256(token);
      }
    }
    next();
  };
}

export function requireAuth(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user) return next(new HttpError(401, 'Please log in first.'));
  next();
}

export const currentUser = (res: Response) => res.locals.user as PublicUser;

function issueVerification(db: DB, user: { id: number; email: string; username: string }) {
  const token = newToken();
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    user.id,
    new Date(Date.now() + VERIFY_HOURS * 36e5).toISOString(),
  );
  const link = `${appUrl()}/verify?token=${token}`;
  send({
    to: user.email,
    subject: 'Confirm your Kniga account',
    text: `Hi ${user.username},\n\nConfirm your email to finish setting up Kniga:\n${link}\n\nThis link expires in ${VERIFY_HOURS} hours.`,
    link,
  });
}

// ---------- routes
export function authRouter(db: DB) {
  const r = Router();
  const loginLimiter = createLimiter(10, 15 * 60 * 1000);
  const signupLimiter = createLimiter(20, 60 * 60 * 1000);

  // UC-01: sign up
  r.post(
    '/register',
    h(async (req, res) => {
      signupLimiter.check(req.ip ?? 'unknown');
      const { username, email, password } = validateSignup(req.body ?? {});

      const fields: Record<string, string> = {};
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
        fields.username = 'That username is taken.';
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
        fields.email = 'An account with this email already exists.';
      if (Object.keys(fields).length) throw new HttpError(409, 'Please fix the highlighted fields.', fields);

      const hash = await hashPassword(password);
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
        .run(username, email, hash);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid) as unknown as UserRow;

      issueVerification(db, user);
      createSession(db, res, user.id, true);
      res.status(201).json({ user: toPublicUser(user) });
    }),
  );

  // UC-01: log in with email or username
  r.post(
    '/login',
    h(async (req, res) => {
      const identifier = str(req.body?.identifier).trim();
      const password = str(req.body?.password);
      const remember = req.body?.remember !== false;
      if (!identifier || !password) {
        throw new HttpError(400, 'Enter your email or username and your password.', {
          ...(identifier ? {} : { identifier: 'Required.' }),
          ...(password ? {} : { password: 'Required.' }),
        });
      }
      const limitKey = `${req.ip}:${identifier.toLowerCase()}`;
      loginLimiter.check(limitKey);

      const user = db
        .prepare('SELECT * FROM users WHERE email = ? OR username = ?')
        .get(identifier.toLowerCase(), identifier) as UserRow | undefined;
      const ok = user
        ? await verifyPassword(password, user.password_hash)
        : (await verifyPassword(password, await DUMMY_HASH), false);
      if (!user || !ok) throw new HttpError(401, 'Incorrect email/username or password.');

      loginLimiter.reset(limitKey);
      createSession(db, res, user.id, remember);
      res.json({ user: toPublicUser(user) });
    }),
  );

  r.post('/logout', (_req, res) => {
    if (res.locals.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(res.locals.sessionHash);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/me', (_req, res) => {
    res.json({ user: res.locals.user ?? null });
  });

  // UC-01 step 6: confirm email
  r.post('/verify', (req, res) => {
    const token = str(req.body?.token);
    const row = db
      .prepare('SELECT user_id FROM email_verifications WHERE token_hash = ? AND expires_at > ?')
      .get(sha256(token), new Date().toISOString()) as { user_id: number } | undefined;
    if (!row) throw new HttpError(400, 'This confirmation link is invalid or has expired.');
    db.prepare("UPDATE users SET email_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(
      row.user_id,
    );
    db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(row.user_id);
    res.json({ ok: true });
  });

  r.post('/resend-verification', requireAuth, (_req, res) => {
    const user = currentUser(res);
    if (user.emailVerified) return void res.json({ ok: true, alreadyVerified: true });
    issueVerification(db, user);
    res.json({ ok: true });
  });

  return r;
}
