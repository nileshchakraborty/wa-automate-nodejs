import type { Config } from '@open-wa/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionGateway } from '../gateway';
import { ProfileRegistry } from '../registry';
import { buildChildConfig, type SessionProfile } from '../supervisor';

const temporaryDirectories: string[] = [];

async function fixture(maxSessions = 3) {
  const directory = await mkdtemp(resolve(tmpdir(), 'openwa-gateway-'));
  temporaryDirectories.push(directory);
  const registry = new ProfileRegistry(resolve(directory, 'profiles.json'));
  await registry.initialize();
  const started: SessionProfile[] = [];
  const supervisor = {
    ensureStarted: async (profile: SessionProfile) => {
      started.push(profile);
      return 18_081;
    },
  };
  const app = await createSessionGateway({
    baseConfig: {} as Config,
    registry,
    supervisor: supervisor as never,
    maxSessions,
    allowRegistration: true,
  });
  return { app, registry, started };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe('multi-session gateway authentication', () => {
  it('registers isolated profiles and resolves each API key to its owner', async () => {
    const { app } = await fixture();
    const aliceResponse = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'correct horse battery staple' }),
    });
    const bobResponse = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'another correct battery staple' }),
    });
    const alice = await aliceResponse.json() as { apiKey: string };
    const bob = await bobResponse.json() as { apiKey: string };

    const aliceStatus = await app.request('/auth/status', {
      headers: { 'X-API-Key': alice.apiKey },
    });
    const bobStatus = await app.request('/auth/status', {
      headers: { 'X-API-Key': bob.apiKey },
    });

    expect((await aliceStatus.json() as any).profile.username).toBe('alice');
    expect((await bobStatus.json() as any).profile.username).toBe('bob');
    expect(alice.apiKey).not.toBe(bob.apiKey);
  });

  it('uses an HttpOnly cookie and only reveals a rotated key once', async () => {
    const { app } = await fixture();
    const registered = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'correct horse battery staple' }),
    });
    const original = await registered.json() as { apiKey: string };
    const cookie = registered.headers.get('set-cookie')?.split(';', 1)[0];

    expect(registered.headers.get('set-cookie')).toContain('HttpOnly');
    expect(registered.headers.get('set-cookie')).toContain('SameSite=Strict');

    const rotated = await app.request('/auth/api-key/rotate', {
      method: 'POST',
      headers: { Cookie: cookie ?? '' },
    });
    const replacement = await rotated.json() as { apiKey: string };
    expect(replacement.apiKey).toMatch(/^owa_/);
    expect(replacement.apiKey).not.toBe(original.apiKey);

    expect((await app.request('/auth/status', {
      headers: { 'X-API-Key': original.apiKey },
    }).then((response) => response.json()) as any).authenticated).toBe(false);
    expect((await app.request('/auth/status', {
      headers: { 'X-API-Key': replacement.apiKey },
    }).then((response) => response.json()) as any).authenticated).toBe(true);
  });

  it('enforces the configured profile limit', async () => {
    const { app } = await fixture(1);
    expect((await app.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice', password: 'correct horse battery staple' }),
    })).status).toBe(201);
    expect((await app.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'bob', password: 'another correct battery staple' }),
    })).status).toBe(409);
  });
});

describe('child session configuration', () => {
  it('binds children to loopback and removes external integrations and shared keys', () => {
    const child = buildChildConfig({
      apiKey: 'shared-secret',
      host: '0.0.0.0',
      port: 8081,
      dashboard: true,
      webhook: 'https://example.test/hook',
      elasticUrl: 'https://example.test/elastic',
      plugins: ['external-plugin'],
      integrations: { webhook: { enabled: true } },
    } as Config, { id: 'user-id', username: 'alice' }, 18_081, '/sessions/profiles');

    expect(child.host).toBe('127.0.0.1');
    expect(child.port).toBe(18_081);
    expect(child.apiKey).toBeUndefined();
    expect(child.webhook).toBeUndefined();
    expect(child.elasticUrl).toBeUndefined();
    expect(child.plugins).toEqual([]);
    expect(child.integrations).toEqual({});
    expect(child.userDataDir).toBe('/sessions/profiles/user-id');
  });
});
