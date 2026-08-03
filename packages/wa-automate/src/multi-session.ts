import { getRequestListener } from '@hono/node-server';
import { resolveConfig } from '@open-wa/config';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from './cli-runtime';
import { createSessionGateway } from './multi-session/gateway';
import { ProfileRegistry } from './multi-session/registry';
import { SessionSupervisor, type SessionProfile } from './multi-session/supervisor';

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export async function startMultiSessionGateway(argv: string[] = process.argv.slice(2)) {
  const parsed = parseCliArgs(argv);
  const { config } = await resolveConfig({
    configPath: parsed.configPath,
    cliOverrides: parsed.cliOverrides,
  });

  const gatewayDir = process.env.OPENWA_GATEWAY_DIR || '/sessions/.gateway';
  const profileRoot = process.env.OPENWA_PROFILE_ROOT || '/sessions/profiles';
  const registry = new ProfileRegistry(
    process.env.OPENWA_REGISTRY_PATH || resolve(gatewayDir, 'profiles.json'),
  );
  await registry.initialize();

  const cliPath = fileURLToPath(new URL('./cli.cjs', import.meta.url));
  const supervisor = new SessionSupervisor({
    baseConfig: config,
    cliPath,
    dataDir: resolve(gatewayDir, 'runtime'),
    profileRoot,
    internalPortStart: positiveInteger('OPENWA_INTERNAL_PORT_START', 18_081),
    startupTimeoutMs: positiveInteger('OPENWA_SESSION_STARTUP_TIMEOUT_MS', 60_000),
  });

  const legacyProfile: SessionProfile | undefined = config.apiKey
    ? {
        id: 'legacy',
        username: 'existing-session',
        sessionId: config.sessionId,
        userDataDir: config.userDataDir,
      }
    : undefined;
  const maxSessions = positiveInteger('OPENWA_MAX_SESSIONS', 3);
  const app = await createSessionGateway({
    baseConfig: config,
    registry,
    supervisor,
    maxSessions,
    allowRegistration: enabled('OPENWA_ALLOW_REGISTRATION', true),
    legacyProfile,
    legacyApiKey: config.apiKey,
  });

  const server = createServer(getRequestListener(app.fetch));
  server.listen(config.port, config.host, () => {
    console.log(`[multi-session] gateway listening on http://${config.host}:${config.port}`);
  });

  const bootstrapProfiles = async () => {
    if (legacyProfile) {
      await supervisor.ensureStarted(legacyProfile).catch((error) => {
        console.error('[multi-session] existing session failed to start:', error);
      });
    }
    for (const profile of registry.list()) {
      await supervisor.ensureStarted(profile).catch((error) => {
        console.error(`[multi-session] profile ${profile.id} failed to start:`, error);
      });
    }
  };
  void bootstrapProfiles();

  const shutdown = async () => {
    server.close();
    await supervisor.stopAll();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  return { app, server, registry, supervisor };
}

if (require.main === module) {
  startMultiSessionGateway().catch((error) => {
    console.error('[multi-session] fatal startup error:', error);
    process.exitCode = 1;
  });
}
