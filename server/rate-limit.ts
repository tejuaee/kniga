import { HttpError } from './http.ts';

/** Small fixed-window limiter, in memory. Enough for a single server process. */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string) {
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
    reset(key: string) {
      hits.delete(key);
    },
  };
}
