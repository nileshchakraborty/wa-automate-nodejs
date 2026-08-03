import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
const REGISTRY_VERSION = 1;
const API_KEY_PREFIX = 'owa_';

export interface RegisteredProfile {
  id: string;
  username: string;
  createdAt: string;
}

interface StoredProfile extends RegisteredProfile {
  passwordSalt: string;
  passwordHash: string;
  apiKeyHash: string;
}

interface RegistryDocument {
  version: number;
  profiles: StoredProfile[];
}

export interface RegistrationResult {
  profile: RegisteredProfile;
  apiKey: string;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function hashApiKey(apiKey: string): Buffer {
  return createHash('sha256').update(apiKey, 'utf8').digest();
}

function storedHashMatches(candidate: Buffer, stored: string): boolean {
  const expected = Buffer.from(stored, 'base64url');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

async function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return await scrypt(password, salt, 64) as Buffer;
}

function publicProfile(profile: StoredProfile): RegisteredProfile {
  return {
    id: profile.id,
    username: profile.username,
    createdAt: profile.createdAt,
  };
}

export function validateCredentials(username: string, password: string): string | null {
  const normalizedUsername = normalizeUsername(username);
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalizedUsername)) {
    return 'Username must be 3-32 characters using letters, numbers, dot, dash, or underscore';
  }

  const passwordBytes = Buffer.byteLength(password, 'utf8');
  if (passwordBytes < 12 || passwordBytes > 128) {
    return 'Password must be 12-128 bytes';
  }

  return null;
}

export class ProfileRegistry {
  private document: RegistryDocument = {
    version: REGISTRY_VERSION,
    profiles: [],
  };
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly registryPath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.registryPath), { recursive: true, mode: 0o700 });

    try {
      const parsed = JSON.parse(await readFile(this.registryPath, 'utf8')) as RegistryDocument;
      if (parsed.version !== REGISTRY_VERSION || !Array.isArray(parsed.profiles)) {
        throw new Error('Unsupported multi-session registry format');
      }
      this.document = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  list(): RegisteredProfile[] {
    return this.document.profiles.map(publicProfile);
  }

  count(): number {
    return this.document.profiles.length;
  }

  async register(
    username: string,
    password: string,
    maxProfiles = Number.POSITIVE_INFINITY,
  ): Promise<RegistrationResult> {
    const credentialError = validateCredentials(username, password);
    if (credentialError) throw new Error(credentialError);

    return await this.mutate(async () => {
      const normalizedUsername = normalizeUsername(username);
      if (this.document.profiles.length >= maxProfiles) {
        throw new Error('This server has reached its session limit');
      }
      if (this.document.profiles.some((profile) => profile.username === normalizedUsername)) {
        throw new Error('Username is already registered');
      }

      const salt = randomBytes(16);
      const apiKey = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
      const stored: StoredProfile = {
        id: randomUUID(),
        username: normalizedUsername,
        createdAt: new Date().toISOString(),
        passwordSalt: salt.toString('base64url'),
        passwordHash: (await derivePassword(password, salt)).toString('base64url'),
        apiKeyHash: hashApiKey(apiKey).toString('base64url'),
      };

      this.document.profiles.push(stored);
      return { profile: publicProfile(stored), apiKey };
    });
  }

  async verifyPassword(username: string, password: string): Promise<RegisteredProfile | null> {
    const normalizedUsername = normalizeUsername(username);
    const stored = this.document.profiles.find((profile) => profile.username === normalizedUsername);
    if (!stored) {
      // Keep unknown-user and bad-password work comparable.
      await derivePassword(password, randomBytes(16));
      return null;
    }

    const candidate = await derivePassword(password, Buffer.from(stored.passwordSalt, 'base64url'));
    const expected = Buffer.from(stored.passwordHash, 'base64url');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
      ? publicProfile(stored)
      : null;
  }

  findByApiKey(apiKey: string): RegisteredProfile | null {
    if (!apiKey.startsWith(API_KEY_PREFIX)) return null;
    const candidate = hashApiKey(apiKey);
    const stored = this.document.profiles.find((profile) =>
      storedHashMatches(candidate, profile.apiKeyHash),
    );
    return stored ? publicProfile(stored) : null;
  }

  async rotateApiKey(profileId: string): Promise<string> {
    return await this.mutate(async () => {
      const stored = this.document.profiles.find((profile) => profile.id === profileId);
      if (!stored) throw new Error('Profile not found');

      const apiKey = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
      stored.apiKeyHash = hashApiKey(apiKey).toString('base64url');
      return apiKey;
    });
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    let resolveTurn!: () => void;
    const previousTurn = this.mutationQueue;
    this.mutationQueue = new Promise<void>((resolve) => {
      resolveTurn = resolve;
    });

    await previousTurn;
    try {
      const result = await operation();
      await this.persist();
      return result;
    } finally {
      resolveTurn();
    }
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.registryPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.registryPath);
    await chmod(this.registryPath, 0o600);
  }
}
