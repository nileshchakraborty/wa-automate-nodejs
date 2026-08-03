import type { Config } from '@open-wa/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface SessionProfile {
  id: string;
  username: string;
  userDataDir?: string;
  sessionId?: string;
}

interface SessionRuntime {
  child?: ChildProcess;
  port: number;
  startPromise: Promise<number>;
}

export interface SessionSupervisorOptions {
  baseConfig: Config;
  cliPath: string;
  dataDir: string;
  profileRoot: string;
  internalPortStart?: number;
  startupTimeoutMs?: number;
}

export function buildChildConfig(
  baseConfig: Config,
  profile: SessionProfile,
  port: number,
  profileRoot: string,
): Record<string, unknown> {
  const childConfig: Record<string, unknown> = {
    ...baseConfig,
    host: '127.0.0.1',
    port,
    sessionId: profile.sessionId ?? `user-${profile.id}`,
    userDataDir: profile.userDataDir ?? resolve(profileRoot, profile.id),
    apiKey: undefined,
    dashboard: false,
    mcp: { enabled: false, exposeToolsMeta: false },
    plugins: [],
    integrations: {},
    webhook: undefined,
    elasticUrl: undefined,
    elasticUsername: undefined,
    elasticPassword: undefined,
    logConsole: false,
    logConsoleErrors: false,
    logFile: false,
    logInternalEvents: false,
    logLevel: 'silent',
    qrLogSkip: true,
  };

  return Object.fromEntries(
    Object.entries(childConfig).filter(([, value]) => value !== undefined),
  );
}

function sanitizedChildEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('WA_')),
  );
}

export class SessionSupervisor {
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly assignedPorts = new Map<string, number>();
  private nextPort: number;
  private stopping = false;

  constructor(private readonly options: SessionSupervisorOptions) {
    this.nextPort = options.internalPortStart ?? 18_081;
  }

  async ensureStarted(profile: SessionProfile): Promise<number> {
    if (this.stopping) throw new Error('Session supervisor is stopping');
    const existing = this.runtimes.get(profile.id);
    if (existing) return await existing.startPromise;

    const port = this.assignedPorts.get(profile.id) ?? this.nextPort++;
    this.assignedPorts.set(profile.id, port);
    const startPromise = this.start(profile, port);
    const runtime = this.runtimes.get(profile.id);
    if (!runtime) throw new Error('Failed to initialize session runtime');
    runtime.startPromise = startPromise;

    try {
      return await startPromise;
    } catch (error) {
      this.runtimes.delete(profile.id);
      throw error;
    }
  }

  async stopAll(): Promise<void> {
    this.stopping = true;
    const children = [...this.runtimes.values()].map((runtime) => runtime.child);
    this.runtimes.clear();
    for (const child of children) child?.kill('SIGTERM');
    await Promise.all(children.filter((child): child is ChildProcess => Boolean(child)).map((child) => this.waitForExit(child, 10_000)));
  }

  private start(profile: SessionProfile, port: number): Promise<number> {
    const placeholder = Promise.resolve(port);
    const runtime: SessionRuntime = {
      port,
      startPromise: placeholder,
    };
    this.runtimes.set(profile.id, runtime);

    const launch = async () => {
      await mkdir(this.options.dataDir, { recursive: true, mode: 0o700 });
      await mkdir(this.options.profileRoot, { recursive: true, mode: 0o700 });
      const configPath = resolve(this.options.dataDir, `${profile.id}.json`);
      const config = buildChildConfig(
        this.options.baseConfig,
        profile,
        port,
        this.options.profileRoot,
      );
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      if (this.stopping) throw new Error('Session supervisor is stopping');

      const child = spawn(process.execPath, [this.options.cliPath, '--config', configPath], {
        env: sanitizedChildEnvironment(),
        stdio: 'ignore',
      });
      runtime.child = child;
      child.once('exit', () => {
        if (this.runtimes.get(profile.id)?.child === child) {
          this.runtimes.delete(profile.id);
        }
      });
      child.once('error', () => {
        if (this.runtimes.get(profile.id)?.child === child) {
          this.runtimes.delete(profile.id);
        }
      });

      await this.waitForHealth(port, child);
      return port;
    };

    return launch();
  }

  private async waitForHealth(port: number, child: ChildProcess): Promise<void> {
    const timeoutMs = this.options.startupTimeoutMs ?? 60_000;
    const deadline = Date.now() + timeoutMs;
    const healthUrl = `http://127.0.0.1:${port}/health/live`;

    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`OpenWA session exited before becoming ready (${child.exitCode})`);
      }
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_500) });
        if (response.ok) return;
      } catch {
        // The child is still starting.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    }

    child.kill('SIGTERM');
    throw new Error('OpenWA session did not become ready before the startup timeout');
  }

  private async waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
    if (child.exitCode !== null) return;
    await Promise.race([
      new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs)),
    ]);
  }
}
