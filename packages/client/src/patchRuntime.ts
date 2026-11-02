import type { Client } from './Client';

/** Invoke a method provided by the current runtime patch. */
export async function invokePatch<T>(client: Client, method: string, args: unknown[]): Promise<T> {
  const result = await client.evaluate(async ({ method, args }) => {
    const api = (globalThis as unknown as { WAPI?: Record<string, (...args: unknown[]) => unknown> }).WAPI;
    const action = api?.[method];
    if (typeof action !== 'function') {
      throw new Error(`WAPI.${method} is unavailable in the current runtime patch.`);
    }
    return await Reflect.apply(action, api, args);
  }, { method, args });
  if (typeof result === 'string' && result.startsWith('ERROR:')) throw new Error(result);
  return result as T;
}
