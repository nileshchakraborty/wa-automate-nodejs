import {
  mountDashboardProduction,
  rateLimitMiddleware,
} from '@open-wa/api';
import type { Config } from '@open-wa/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Hono, type Context, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { proxy } from 'hono/proxy';
import type { RegisteredProfile } from './registry';
import { ProfileRegistry } from './registry';
import { SessionSupervisor, type SessionProfile } from './supervisor';

const SESSION_COOKIE = 'owa_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_AUTH_BODY_BYTES = 4_096;

interface BrowserSession {
  expiresAt: number;
  kind: 'legacy' | 'registered';
  profile: RegisteredProfile;
}

interface AuthIdentity extends BrowserSession {
  source: 'api-key' | 'cookie';
}

export interface SessionGatewayOptions {
  baseConfig: Config;
  registry: ProfileRegistry;
  supervisor: SessionSupervisor;
  maxSessions: number;
  allowRegistration: boolean;
  legacyProfile?: SessionProfile;
  legacyApiKey?: string;
}

function apiKeysMatch(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

function isStateChanging(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function sameOriginRequest(c: Context): boolean {
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin;
}

async function readAuthBody(c: Context): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(c.req.header('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUTH_BODY_BYTES) return null;

  const body = await c.req.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_AUTH_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function securityHeaders(c: Context, next: Next) {
  c.header('Cache-Control', 'no-store');
  c.header('Content-Security-Policy', "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  c.header('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  return next();
}

export async function createSessionGateway(options: SessionGatewayOptions): Promise<Hono> {
  const app = new Hono();
  const browserSessions = new Map<string, BrowserSession>();
  const legacyPublicProfile: RegisteredProfile | undefined = options.legacyProfile
    ? {
        id: options.legacyProfile.id,
        username: options.legacyProfile.username,
        createdAt: new Date(0).toISOString(),
      }
    : undefined;

  const authenticateApiKey = (apiKey: string): Omit<AuthIdentity, 'source'> | null => {
    if (options.legacyApiKey && legacyPublicProfile && apiKeysMatch(apiKey, options.legacyApiKey)) {
      return {
        kind: 'legacy',
        profile: legacyPublicProfile,
        expiresAt: Number.POSITIVE_INFINITY,
      };
    }

    const profile = options.registry.findByApiKey(apiKey);
    return profile
      ? {
          kind: 'registered',
          profile,
          expiresAt: Number.POSITIVE_INFINITY,
        }
      : null;
  };

  const resolveIdentity = async (c: Context): Promise<AuthIdentity | null> => {
    const cookie = getCookie(c, SESSION_COOKIE);
    if (cookie) {
      const stored = browserSessions.get(hashSessionToken(cookie));
      if (stored && stored.expiresAt > Date.now()) {
        return { ...stored, source: 'cookie' };
      }
    }

    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) return null;
    const identity = authenticateApiKey(apiKey);
    return identity ? { ...identity, source: 'api-key' } : null;
  };

  const issueBrowserSession = (c: Context, identity: Omit<BrowserSession, 'expiresAt'>) => {
    const now = Date.now();
    for (const [tokenHash, session] of browserSessions) {
      if (session.expiresAt <= now) browserSessions.delete(tokenHash);
    }
    const token = randomBytes(32).toString('base64url');
    const session: BrowserSession = {
      ...identity,
      expiresAt: now + SESSION_TTL_SECONDS * 1_000,
    };
    browserSessions.set(hashSessionToken(token), session);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: '/',
      sameSite: 'Strict',
      secure: new URL(c.req.url).protocol === 'https:',
    });
  };

  const startIdentity = (kind: BrowserSession['kind'], profile: RegisteredProfile) => {
    const sessionProfile = kind === 'legacy' ? options.legacyProfile : profile;
    if (!sessionProfile) return;
    void options.supervisor.ensureStarted(sessionProfile).catch((error) => {
      console.error(`[multi-session] profile ${sessionProfile.id} failed to start:`, error);
    });
  };

  app.use('*', securityHeaders);
  app.get('/health/live', (c) => c.json({ status: 'ok', service: 'multi-session-gateway' }));
  app.get('/', (c) => c.redirect('/dashboard/', 302));
  app.get('/dashboard', (c) => c.redirect('/dashboard/', 302));
  await mountDashboardProduction(app);

  const authRateLimit = rateLimitMiddleware(30, 15 * 60_000);
  app.use('/auth/*', (c, next) =>
    c.req.method === 'POST' ? authRateLimit(c, next) : next(),
  );

  app.get('/auth/status', async (c) => {
    const identity = await resolveIdentity(c);
    const reservedLegacySlots = options.legacyProfile ? 1 : 0;
    return c.json({
      gateway: true,
      authenticated: Boolean(identity),
      profile: identity
        ? { username: identity.profile.username, kind: identity.kind }
        : null,
      registration: {
        enabled: options.allowRegistration,
        remaining: Math.max(
          0,
          options.maxSessions - reservedLegacySlots - options.registry.count(),
        ),
      },
    });
  });

  app.post('/auth/register', async (c) => {
    if (!sameOriginRequest(c)) return c.json({ error: 'Cross-origin registration is not allowed' }, 403);
    if (!options.allowRegistration) return c.json({ error: 'Registration is disabled' }, 403);
    const reservedLegacySlots = options.legacyProfile ? 1 : 0;
    if (reservedLegacySlots + options.registry.count() >= options.maxSessions) {
      return c.json({ error: 'This server has reached its session limit' }, 409);
    }

    const body = await readAuthBody(c);
    if (!body) return c.json({ error: 'Invalid request body' }, 400);
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';

    try {
      const result = await options.registry.register(
        username,
        password,
        options.maxSessions - reservedLegacySlots,
      );
      issueBrowserSession(c, { kind: 'registered', profile: result.profile });
      startIdentity('registered', result.profile);
      return c.json({
        profile: { username: result.profile.username },
        apiKey: result.apiKey,
        note: 'Save this API key now. The server stores only its hash and cannot show it again.',
      }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Registration failed' }, 400);
    }
  });

  app.post('/auth/login', async (c) => {
    if (!sameOriginRequest(c)) return c.json({ error: 'Cross-origin login is not allowed' }, 403);
    const body = await readAuthBody(c);
    if (!body) return c.json({ error: 'Invalid request body' }, 400);
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const profile = await options.registry.verifyPassword(username, password);
    if (!profile) return c.json({ error: 'Invalid username or password' }, 401);

    issueBrowserSession(c, { kind: 'registered', profile });
    startIdentity('registered', profile);
    return c.json({ profile: { username: profile.username } });
  });

  app.post('/auth/api-key', async (c) => {
    if (!sameOriginRequest(c)) return c.json({ error: 'Cross-origin authentication is not allowed' }, 403);
    const body = await readAuthBody(c);
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
    if (!apiKey) return c.json({ error: 'API key is required' }, 400);

    const identity = authenticateApiKey(apiKey);
    if (!identity) return c.json({ error: 'Invalid API key' }, 401);

    issueBrowserSession(c, { kind: identity.kind, profile: identity.profile });
    startIdentity(identity.kind, identity.profile);
    return c.json({ profile: { username: identity.profile.username, kind: identity.kind } });
  });

  app.post('/auth/logout', async (c) => {
    if (!sameOriginRequest(c)) return c.json({ error: 'Cross-origin logout is not allowed' }, 403);
    const cookie = getCookie(c, SESSION_COOKIE);
    if (cookie) browserSessions.delete(hashSessionToken(cookie));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ success: true });
  });

  app.post('/auth/api-key/rotate', async (c) => {
    if (!sameOriginRequest(c)) return c.json({ error: 'Cross-origin key rotation is not allowed' }, 403);
    const identity = await resolveIdentity(c);
    if (!identity || identity.source !== 'cookie') return c.json({ error: 'Sign in before rotating an API key' }, 401);
    if (identity.kind !== 'registered') return c.json({ error: 'The legacy key is managed by server configuration' }, 409);

    const apiKey = await options.registry.rotateApiKey(identity.profile.id);
    return c.json({
      apiKey,
      note: 'Save this API key now. The previous key has been revoked.',
    });
  });

  app.all('*', async (c) => {
    const identity = await resolveIdentity(c);
    if (!identity) return c.json({ error: 'Unauthorized', details: 'Sign in or provide a valid API key' }, 401);
    if (identity.source === 'cookie' && isStateChanging(c.req.method) && !sameOriginRequest(c)) {
      return c.json({ error: 'Cross-origin state change is not allowed' }, 403);
    }

    const sessionProfile = identity.kind === 'legacy'
      ? options.legacyProfile
      : identity.profile;
    if (!sessionProfile) return c.json({ error: 'Session is unavailable' }, 503);

    let port: number;
    try {
      port = await options.supervisor.ensureStarted(sessionProfile);
    } catch {
      c.header('Retry-After', '5');
      return c.json({ error: 'WhatsApp session is starting or unavailable' }, 503);
    }

    const incomingUrl = new URL(c.req.url);
    const target = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, `http://127.0.0.1:${port}`);
    const headers = new Headers(c.req.raw.headers);
    headers.delete('Authorization');
    headers.delete('Cookie');
    headers.delete('Host');
    headers.delete('X-API-Key');
    headers.delete('X-Forwarded-For');
    headers.delete('X-Forwarded-Host');
    headers.delete('X-Forwarded-Proto');

    const response = await proxy(target, { raw: c.req.raw, headers });
    response.headers.delete('Set-Cookie');
    return response;
  });

  return app;
}
