import { useCallback, useEffect, useRef, useState } from "react"
import { Copy, Check } from "lucide-react"
import type { ConnectionProfile } from "@/lib/connection-profiles"
import { useSocket } from "@/lib/hooks/use-socket"
import { getApiKey, getApiUrl, resetClient, setApiKey } from "@/lib/api-client"
import {
  authenticateApiKey,
  getGatewayAuthStatus,
  loginProfile,
  logoutProfile,
  registerProfile,
  rotateApiKey,
  type GatewayAuthStatus,
} from "@/lib/auth-client"
import {
  clearProfiles,
  deleteProfile,
  getActiveProfile,
  getProfiles,
  saveProfile,
  setActiveProfile,
} from "@/lib/connection-profiles"

type AuthMode = "login" | "register"

function reconnectWithoutReload() {
  resetClient()
  window.dispatchEvent(new Event("openwa:reconnect"))
}

export function ConnectionBadge() {
  const { connected, error } = useSocket()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const currentUrl = typeof window !== "undefined" ? getApiUrl() : ""
  const activeProfile =
    typeof window !== "undefined" ? getActiveProfile() : null

  const [profiles, setProfiles] =
    useState<Array<ConnectionProfile>>(getProfiles())
  const [profileId, setProfileId] = useState(activeProfile?.id ?? "")
  const [profileName, setProfileName] = useState(
    activeProfile?.name ?? "Default"
  )
  const [host, setHost] = useState(activeProfile?.host ?? "")
  const [port, setPort] = useState(activeProfile?.port ?? "")
  const [apiKey, setApiKeyInput] = useState(getApiKey())
  const [authStatus, setAuthStatus] = useState<
    GatewayAuthStatus | null | undefined
  >(undefined)
  const [authMode, setAuthMode] = useState<AuthMode>("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refreshAuthStatus = useCallback(async () => {
    setAuthStatus(await getGatewayAuthStatus())
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const storedProfiles = getProfiles()
    const active = getActiveProfile()
    setProfiles(storedProfiles)
    setProfileId(active?.id ?? "")
    setProfileName(active?.name ?? "Default")
    setHost(active?.host ?? "")
    setPort(active?.port ?? "")
    setApiKeyInput(getApiKey())
    setAuthError(null)
    setAuthStatus(undefined)
    void refreshAuthStatus()
  }, [open, refreshAuthStatus])

  const selectProfile = (id: string) => {
    const profile = profiles.find((candidate) => candidate.id === id)
    if (!profile) return
    setProfileId(profile.id)
    setProfileName(profile.name)
    setHost(profile.host)
    setPort(profile.port)
    setApiKeyInput("")
  }

  const generateLegacyApiKey = async () => {
    setBusy(true)
    setAuthError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api-key/generate`, { method: "POST" })
      if (!res.ok) throw new Error(`Key generation failed (HTTP ${res.status})`)
      const data = (await res.json()) as { apiKey?: string; key?: string }
      const key = data.apiKey || data.key
      if (!key) throw new Error("No API key returned")
      setApiKeyInput(key)
      setApiKey(key)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to generate key")
    } finally {
      setBusy(false)
    }
  }

  const newProfile = () => {
    setProfileId("")
    setProfileName("")
    setHost("")
    setPort("")
    setApiKeyInput("")
  }

  const applyServerSettings = () => {
    const profile = saveProfile(
      { name: profileName, host, port },
      profileId || undefined
    )
    setActiveProfile(profile.id)
    setApiKey(authStatus?.gateway ? "" : apiKey.trim())
    reconnectWithoutReload()
    setOpen(false)
  }

  const reset = () => {
    clearProfiles()
    setApiKey("")
    setHost("")
    setPort("")
    setApiKeyInput("")
    reconnectWithoutReload()
    setOpen(false)
  }

  const removeProfile = () => {
    if (!profileId) return
    deleteProfile(profileId)
    const remaining = getProfiles()
    const next = getActiveProfile()
    setProfiles(remaining)
    setProfileId(next?.id ?? "")
    setProfileName(next?.name ?? "Default")
    setHost(next?.host ?? "")
    setPort(next?.port ?? "")
  }

  const submitCredentials = async () => {
    setBusy(true)
    setAuthError(null)
    try {
      if (authMode === "register") {
        const result = await registerProfile(username, password)
        setIssuedKey(result.apiKey)
        setPassword("")
        await refreshAuthStatus()
      } else {
        await loginProfile(username, password)
        window.location.reload()
      }
    } catch (authFailure) {
      setAuthError(
        authFailure instanceof Error ? authFailure.message : "Authentication failed"
      )
    } finally {
      setBusy(false)
    }
  }

  const useExistingApiKey = async () => {
    setBusy(true)
    setAuthError(null)
    try {
      await authenticateApiKey(apiKey.trim())
      setApiKey("")
      window.location.reload()
    } catch (authFailure) {
      setAuthError(
        authFailure instanceof Error ? authFailure.message : "Invalid API key"
      )
    } finally {
      setBusy(false)
    }
  }

  const createNewApiKey = async () => {
    setBusy(true)
    setAuthError(null)
    try {
      const result = await rotateApiKey()
      setIssuedKey(result.apiKey)
      setCopied(false)
    } catch (authFailure) {
      setAuthError(
        authFailure instanceof Error ? authFailure.message : "Key rotation failed"
      )
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await logoutProfile()
      window.location.reload()
    } catch (authFailure) {
      setAuthError(
        authFailure instanceof Error ? authFailure.message : "Sign out failed"
      )
      setBusy(false)
    }
  }

  const copyIssuedKey = async () => {
    if (!issuedKey) return
    await navigator.clipboard.writeText(issuedKey)
    setCopied(true)
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
      >
        <span
          className={`size-2 rounded-full ${connected ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"}`}
        />
        <span
          className={
            connected
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }
        >
          {connected ? "Connected" : "Connect"}
        </span>
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 max-h-[calc(100vh-5rem)] w-96 overflow-y-auto rounded-xl border bg-popover p-4 shadow-lg">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">WhatsApp Session</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Each account has a private API key and isolated browser profile.
            </p>
          </div>

          {(authError || (!connected && error)) && (
            <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {authError || "Authentication or connection failed."}
            </div>
          )}

          <div className="mb-3 rounded-md bg-muted px-3 py-2">
            <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Server
            </div>
            <code className="mt-0.5 block truncate text-xs">{currentUrl}</code>
          </div>

          {authStatus === undefined && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Checking session access…
            </p>
          )}

          {authStatus?.authenticated && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    Signed in
                  </div>
                  <div className="text-sm font-semibold">
                    {authStatus.profile?.username}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={busy}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  Sign out
                </button>
              </div>
              {authStatus.profile?.kind === "registered" && (
                <button
                  type="button"
                  onClick={createNewApiKey}
                  disabled={busy}
                  className="w-full rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  Create new API key
                </button>
              )}
            </div>
          )}

          {authStatus && !authStatus.authenticated && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid grid-cols-2 rounded-md bg-muted p-1">
                {(["login", "register"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAuthMode(mode)
                      setAuthError(null)
                    }}
                    className={`rounded px-2 py-1.5 text-xs font-medium ${authMode === mode ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    {mode === "login" ? "Sign in" : "Register"}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Username"
                className="h-9 w-full rounded-md border bg-background px-3 text-xs"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  authMode === "register" ? "new-password" : "current-password"
                }
                placeholder={
                  authMode === "register"
                    ? "Password (12+ characters)"
                    : "Password"
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-xs"
              />
              <button
                type="button"
                onClick={submitCredentials}
                disabled={busy || !username.trim() || !password}
                className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {authMode === "register" ? "Create private session" : "Sign in"}
              </button>
              {authMode === "register" && (
                <p className="text-[11px] text-muted-foreground">
                  {authStatus.registration.enabled
                    ? `${authStatus.registration.remaining} registration slot${authStatus.registration.remaining === 1 ? "" : "s"} remaining on this Pi.`
                    : "Registration is disabled on this server."}
                </p>
              )}
              <div className="border-t pt-3">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Already have an API key?
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    autoComplete="off"
                    className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={useExistingApiKey}
                    disabled={busy || !apiKey.trim()}
                    className="rounded-md border px-3 text-xs font-medium disabled:opacity-50"
                  >
                    Use key
                  </button>
                </div>
              </div>
            </div>
          )}

          {issuedKey && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="text-xs font-semibold">Save this API key now</div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                It is shown once. Creating another key revokes this one.
              </p>
              <code className="mt-2 block break-all rounded bg-background p-2 text-[11px]">
                {issuedKey}
              </code>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  title={copied ? "Copied!" : "Copy key"}
                  aria-label="Copy API key"
                  onClick={copyIssuedKey}
                  className="rounded-md border p-1.5 text-xs font-medium hover:bg-muted"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {authStatus === null && (
            <LegacyConnectionSettings
              apiKey={apiKey}
              host={host}
              port={port}
              profileId={profileId}
              profileName={profileName}
              profiles={profiles}
              onApiKey={setApiKeyInput}
              onApply={applyServerSettings}
              onDelete={removeProfile}
              onGenerateApiKey={generateLegacyApiKey}
              onHost={setHost}
              onNew={newProfile}
              onPort={setPort}
              onProfileName={setProfileName}
              onReset={reset}
              onSelect={selectProfile}
            />
          )}
        </div>
      )}
    </div>
  )
}

function LegacyConnectionSettings({
  apiKey,
  host,
  port,
  profileId,
  profileName,
  profiles,
  onApiKey,
  onApply,
  onDelete,
  onGenerateApiKey,
  onHost,
  onNew,
  onPort,
  onProfileName,
  onReset,
  onSelect,
}: {
  apiKey: string
  host: string
  port: string
  profileId: string
  profileName: string
  profiles: ConnectionProfile[]
  onApiKey: (value: string) => void
  onApply: () => void
  onDelete: () => void
  onGenerateApiKey?: () => void
  onHost: (value: string) => void
  onNew: () => void
  onPort: (value: string) => void
  onProfileName: (value: string) => void
  onReset: () => void
  onSelect: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-muted-foreground">
          Server profile
        </label>
        <button type="button" onClick={onNew} className="text-[11px] text-primary">
          New profile
        </button>
      </div>
      {profiles.length > 0 && (
        <select
          value={profileId}
          onChange={(event) => onSelect(event.target.value)}
          className="h-8 w-full rounded-md border bg-background px-3 text-xs"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name}</option>
          ))}
        </select>
      )}
      <input type="text" value={profileName} onChange={(event) => onProfileName(event.target.value)} placeholder="Profile name" className="h-8 w-full rounded-md border bg-background px-3 text-xs" />
      <input type="text" value={host} onChange={(event) => onHost(event.target.value)} placeholder="Host" className="h-8 w-full rounded-md border bg-background px-3 font-mono text-xs" />
      <input type="text" value={port} onChange={(event) => onPort(event.target.value)} placeholder="Port" className="h-8 w-full rounded-md border bg-background px-3 font-mono text-xs" />
      <div className="flex gap-1.5">
        <input
          type="password"
          value={apiKey}
          onChange={(event) => onApiKey(event.target.value)}
          autoComplete="off"
          placeholder="API key (memory only)"
          className="h-8 flex-1 rounded-md border bg-background px-3 font-mono text-xs"
        />
        {onGenerateApiKey && (
          <button
            type="button"
            onClick={onGenerateApiKey}
            title="Generate fresh API key from OpenWA"
            className="h-8 rounded-md border bg-muted px-2.5 text-xs font-medium hover:bg-muted/80"
          >
            Generate
          </button>
        )}
      </div>
      <div className="flex items-center justify-between pt-2">
        <div>
          <button type="button" onClick={onReset} className="px-2 py-1.5 text-xs text-muted-foreground">Reset</button>
          {profileId && profiles.length > 1 && (
            <button type="button" onClick={onDelete} className="px-2 py-1.5 text-xs text-red-600">Delete</button>
          )}
        </div>
        <button type="button" onClick={onApply} disabled={!profileName.trim()} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          Save &amp; reconnect
        </button>
      </div>
    </div>
  )
}
