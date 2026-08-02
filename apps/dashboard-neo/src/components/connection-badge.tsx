import { useEffect, useRef, useState } from "react"
import type { ConnectionProfile } from "@/lib/connection-profiles"
import { useSocket } from "@/lib/hooks/use-socket"
import { getApiKey, getApiUrl, resetClient, setApiKey } from "@/lib/api-client"
import {
  clearProfiles,
  deleteProfile,
  getActiveProfile,
  getProfiles,
  saveProfile,
  setActiveProfile,
} from "@/lib/connection-profiles"

/**
 * Clickable session status badge that opens a connection config popover.
 * Replaces the simple SessionStatusBadge.
 */
export function ConnectionBadge() {
  const { connected, error } = useSocket()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Derive current values
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

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Sync state when opening
  useEffect(() => {
    if (open) {
      const storedProfiles = getProfiles()
      const active = getActiveProfile()
      setProfiles(storedProfiles)
      setProfileId(active?.id ?? "")
      setProfileName(active?.name ?? "Default")
      setHost(active?.host ?? "")
      setPort(active?.port ?? "")
      setApiKeyInput(getApiKey())
    }
  }, [open])

  const selectProfile = (id: string) => {
    const profile = profiles.find((candidate) => candidate.id === id)
    if (!profile) return
    setProfileId(profile.id)
    setProfileName(profile.name)
    setHost(profile.host)
    setPort(profile.port)
    setApiKeyInput("")
  }

  const newProfile = () => {
    setProfileId("")
    setProfileName("")
    setHost("")
    setPort("")
    setApiKeyInput("")
  }

  const apply = () => {
    const profile = saveProfile(
      { name: profileName, host, port },
      profileId || undefined
    )
    setActiveProfile(profile.id)
    setApiKey(apiKey.trim())
    // Reset the cached client so next getClient() uses the new URL
    resetClient()
    setOpen(false)
    // Reload to reconnect everything
    window.location.reload()
  }

  const reset = () => {
    clearProfiles()
    setApiKey("")
    setHost("")
    setPort("")
    setApiKeyInput("")
    resetClient()
    setOpen(false)
    window.location.reload()
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

  return (
    <div className="relative" ref={popoverRef}>
      {/* Badge - clickable */}
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

      {/* Popover */}
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border bg-popover p-4 shadow-lg">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Connection Settings</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Use a saved server profile. API keys remain in this tab only.
            </p>
          </div>

          {!connected && error && (
            <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              Authentication or connection failed. Check the profile and API
              key.
            </div>
          )}

          {/* Current URL */}
          <div className="mb-3 rounded-md bg-muted px-3 py-2">
            <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Current URL
            </div>
            <code className="mt-0.5 block truncate text-xs">{currentUrl}</code>
          </div>

          {/* Fields */}
          <div className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-[11px] font-medium text-muted-foreground">
                  Profile
                </label>
                <button
                  type="button"
                  onClick={newProfile}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  New profile
                </button>
              </div>
              {profiles.length > 0 && (
                <select
                  value={profileId}
                  onChange={(event) => selectProfile(event.target.value)}
                  className="mb-2 h-8 w-full rounded-md border bg-background px-3 text-xs focus:ring-1 focus:ring-ring focus:outline-none"
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="Profile name"
                className="h-8 w-full rounded-md border bg-background px-3 text-xs placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Host
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={
                  typeof window !== "undefined"
                    ? window.location.hostname
                    : "localhost"
                }
                className="h-8 w-full rounded-md border bg-background px-3 font-mono text-xs placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                API key (kept only for this browser tab)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKeyInput(e.target.value)}
                autoComplete="off"
                className="h-8 w-full rounded-md border bg-background px-3 font-mono text-xs placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Port
              </label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="8002"
                className="h-8 w-full rounded-md border bg-background px-3 font-mono text-xs placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center">
              <button
                onClick={reset}
                className="rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Reset
              </button>
              {profileId && profiles.length > 1 && (
                <button
                  onClick={removeProfile}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10"
                >
                  Delete
                </button>
              )}
            </div>
            <button
              onClick={apply}
              disabled={!profileName.trim()}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Save & Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
