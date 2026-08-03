export type GatewayAuthStatus = {
  gateway: true
  authenticated: boolean
  profile: { username: string; kind: "legacy" | "registered" } | null
  registration: { enabled: boolean; remaining: number }
}

type ApiKeyResult = {
  apiKey: string
  note: string
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${window.location.origin}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  const result = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
  return result
}

export async function getGatewayAuthStatus(): Promise<GatewayAuthStatus | null> {
  try {
    const result = await authRequest<GatewayAuthStatus>("/auth/status")
    return result.gateway === true ? result : null
  } catch {
    return null
  }
}

export function registerProfile(username: string, password: string) {
  return authRequest<ApiKeyResult>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function loginProfile(username: string, password: string) {
  return authRequest<{ profile: { username: string } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function authenticateApiKey(apiKey: string) {
  return authRequest<{ profile: { username: string } }>("/auth/api-key", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  })
}

export function rotateApiKey() {
  return authRequest<ApiKeyResult>("/auth/api-key/rotate", {
    method: "POST",
    body: "{}",
  })
}

export function logoutProfile() {
  return authRequest<{ success: true }>("/auth/logout", {
    method: "POST",
    body: "{}",
  })
}
