import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileRegistry } from '../registry';

const temporaryDirectories: string[] = [];

async function createRegistry() {
  const directory = await mkdtemp(resolve(tmpdir(), 'openwa-registry-'));
  temporaryDirectories.push(directory);
  const path = resolve(directory, 'profiles.json');
  const registry = new ProfileRegistry(path);
  await registry.initialize();
  return { path, registry };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe('ProfileRegistry', () => {
  it('stores password and API key verifiers without plaintext secrets', async () => {
    const { path, registry } = await createRegistry();
    const password = 'correct horse battery staple';
    const result = await registry.register('Alice', password);

    expect(result.apiKey).toMatch(/^owa_[A-Za-z0-9_-]{43}$/);
    expect(registry.findByApiKey(result.apiKey)?.username).toBe('alice');
    expect((await registry.verifyPassword('alice', password))?.id).toBe(result.profile.id);
    expect(await registry.verifyPassword('alice', 'incorrect password value')).toBeNull();

    const persisted = await readFile(path, 'utf8');
    expect(persisted).not.toContain(password);
    expect(persisted).not.toContain(result.apiKey);
  });

  it('rejects duplicate usernames and revokes a rotated API key', async () => {
    const { registry } = await createRegistry();
    const original = await registry.register('alice', 'correct horse battery staple');

    await expect(
      registry.register('ALICE', 'another secure password'),
    ).rejects.toThrow('already registered');

    const replacement = await registry.rotateApiKey(original.profile.id);
    expect(registry.findByApiKey(original.apiKey)).toBeNull();
    expect(registry.findByApiKey(replacement)?.id).toBe(original.profile.id);
  });
});
