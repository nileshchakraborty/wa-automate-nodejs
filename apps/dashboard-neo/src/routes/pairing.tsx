import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toDataURL } from "qrcode"
import { apiFetch, getApiUrl, setApiKey } from "@/lib/api-client"

export const Route = createFileRoute("/pairing")({ component: PairingPage })

type PairingStatus = {
  connected: boolean
  ready: boolean
  state: string
  qr: string | null
}

function PairingPage() {
  const [status, setStatus] = useState<PairingStatus | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")

  const refresh = useCallback(async () => {
    try {
      const base = getApiUrl()
      let healthResponse = await apiFetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })
      if (healthResponse.status === 401) {
        // Attempt to auto-retrieve key from /api-key if available on same host
        try {
          const keyRes = await fetch(`${base}/api-key`, { signal: AbortSignal.timeout(2000) })
          if (keyRes.ok) {
            const data = (await keyRes.json()) as { apiKey?: string; key?: string }
            const foundKey = data.apiKey || data.key
            if (foundKey) {
              setApiKey(foundKey)
              healthResponse = await apiFetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })
            }
          }
        } catch {
          // Fall through to manual key entry
        }
      }
      if (healthResponse.status === 401) throw new Error("API key required")
      if (!healthResponse.ok) throw new Error(`OpenWA returned HTTP ${healthResponse.status}`)
      const health = await healthResponse.json() as {
        connected?: boolean
        session?: { ready?: boolean; state?: string }
      }
      const ready = health.connected === true && health.session?.ready === true
      let qr: string | null = null
      if (!ready) {
        const qrResponse = await apiFetch(`${base}/qr`, { signal: AbortSignal.timeout(5000) })
        if (qrResponse.ok) qr = (await qrResponse.json() as { qr?: string }).qr ?? null
      }
      setStatus({ connected: health.connected === true, ready, state: health.session?.state ?? "UNKNOWN", qr })
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cannot reach OpenWA")
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    let active = true
    setQrImage(null)
    if (status?.qr) {
      void toDataURL(status.qr, { width: 360, margin: 2, errorCorrectionLevel: "M" })
        .then(image => { if (active) setQrImage(image) })
        .catch(() => { if (active) setError("Cannot render pairing QR") })
    }
    return () => { active = false }
  }, [status?.qr])

  const logout = async () => {
    if (!window.confirm("Unlink this OpenWA device from WhatsApp? You will need to scan a new QR code.")) return
    setLoggingOut(true)
    setError(null)
    try {
      const response = await apiFetch(`${getApiUrl()}/session/logout`, {
        method: "POST",
        headers: { "X-OpenWA-Confirm": "unlink" },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Logout failed (HTTP ${response.status})`)
      }
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Logout failed")
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 p-6">
      <h1 className="text-2xl font-semibold">OpenWA connection</h1>
      <div className="rounded-xl border bg-card p-6">
        {error === "API key required" && (
          <form
            className="mb-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              setApiKey(apiKeyInput.trim())
              setApiKeyInput("")
              void refresh()
            }}
          >
            <label htmlFor="pairing-api-key" className="block text-sm font-medium">OpenWA API key</label>
            <div className="flex gap-2">
              <input
                id="pairing-api-key"
                type="password"
                autoComplete="off"
                placeholder="Enter or auto-fetch API key"
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(`${getApiUrl()}/api-key`)
                    if (res.ok) {
                      const data = (await res.json()) as { apiKey?: string; key?: string }
                      const key = data.apiKey || data.key
                      if (key) {
                        setApiKeyInput(key)
                        setApiKey(key)
                        void refresh()
                      }
                    }
                  } catch {
                    setError("Could not auto-fetch API key from server")
                  }
                }}
                className="rounded-md border bg-muted px-3 py-2 text-xs font-medium hover:bg-muted/80"
              >
                Auto-fill
              </button>
            </div>
            <button type="submit" disabled={!apiKeyInput.trim()} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Connect
            </button>
          </form>
        )}
        <p className="text-lg font-medium">
          {status?.ready ? "Connected and ready" : status ? "Not connected" : error === "API key required" ? "Sign in to view connection" : "Checking connection…"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Session: {status?.state ?? "checking"}</p>
        {status?.ready ? (
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="mt-6 rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {loggingOut ? "Logging out…" : "Log out and unlink phone"}
          </button>
        ) : qrImage ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm">WhatsApp on your phone → Linked devices → Link a device</p>
            <img src={qrImage} alt="Current OpenWA pairing QR" className="w-full max-w-sm rounded-md bg-white p-3" />
            <p className="text-xs text-muted-foreground">The code refreshes automatically when WhatsApp changes it.</p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Waiting for a pairing code…</p>
        )}
      </div>
      {error && error !== "API key required" && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
