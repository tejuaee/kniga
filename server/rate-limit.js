import { HttpError } from './http.js';

/** Small fixed-window limiter, in memory. Enough for a single server process. */
export function createLimiter(max, windowMs) {
  const hits = new Map();
  return {
    check(key) {
      const now = Date.now();
      const hit = hits.get(key);
      if (!hit || hit.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }
      hit.count += 1;
      if (hit.count > max) {
        const minutes = Math.ceil((hit.resetAt - now) / 60000);
        throw new HttpError(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
      }
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
