import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { HttpError, errorHandler } from './http.ts';
import { authRouter, loadUser } from './auth.ts';
import { booksRouter } from './books.ts';
import { logsRouter } from './logs.ts';

/**
 * CSRF guard: session cookies are SameSite=Lax, and every state-changing API call must be JSON.
 * Browsers can't send a cross-site `application/json` request without a CORS preflight,
 * which this server never approves.
 */
function requireJson(req: Request, _res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return next(new HttpError(415, 'Send requests as JSON.'));
  }
  next();
}

export function createApp(db: DB, opts: Parameters<typeof booksRouter>[1] = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  const api = express.Router();
  api.use(requireJson);
  api.use(express.json({ limit: '100kb' }));
  api.use(loadUser(db));
  api.use('/auth', authRouter(db));
  api.use('/books', booksRouter(db, opts));
  api.use('/logs', logsRouter(db));
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
  app.use('/api', api);

  // Production: serve the built frontend and let the client router handle deep links.
  const dist = join(import.meta.dirname, '..', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
