import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'node:crypto';

function normalizeKey(key: string): string {
  return key.trim().replace(/\\n$/, '').trim();
}

function apiKeysMatch(candidate: string, expected: string): boolean {
  const normCandidate = normalizeKey(candidate);
  const normExpected = normalizeKey(expected);
  const candidateBuffer = Buffer.from(normCandidate);
  const expectedBuffer = Buffer.from(normExpected);

  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function apiKeyMiddleware(apiKeyOrGetter: string | (() => string | undefined)) {
  return async (c: Context, next: Next) => {
    const expectedKey = typeof apiKeyOrGetter === 'function' ? apiKeyOrGetter() : apiKeyOrGetter;
    if (!expectedKey) {
      return await next();
    }
    const resolvedKey = c.req.header('X-API-Key');

    if (!resolvedKey || !apiKeysMatch(resolvedKey, expectedKey)) {
      return c.json({ error: 'Unauthorized', details: 'Invalid or missing API key' }, 401);
    }

    return await next();
  };
}
