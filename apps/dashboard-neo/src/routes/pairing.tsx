import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toDataURL } from "qrcode"
import { Copy, Check } from "lucide-react"
import { apiFetch, getApiKey, getApiUrl, setApiKey } from "@/lib/api-client"

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
  const [activeKey, setActiveKey] = useState(getApiKey())
  const [copiedKey, setCopiedKey] = useState(false)
  const [keyNotice, setKeyNotice] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)

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
              setActiveKey(foundKey)
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
      setActiveKey(getApiKey())
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

  const handleGenerateKey = async () => {
    try {
      setGeneratingKey(true)
      const res = await fetch(`${getApiUrl()}/api-key/generate`, { method: "POST" })
      if (!res.ok) throw new Error(`Failed to generate key (HTTP ${res.status})`)
      const data = (await res.json()) as { apiKey?: string; key?: string }
      const newKey = data.apiKey || data.key
      if (!newKey) throw new Error("No API key returned")
      setApiKey(newKey)
      setActiveKey(newKey)
      setApiKeyInput(newKey)
      setKeyNotice("New API key generated and connected!")
      setTimeout(() => setKeyNotice(null), 4000)
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate key")
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleAutoFillKey = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api-key`)
      if (res.ok) {
        const data = (await res.json()) as { apiKey?: string; key?: string }
        const key = data.apiKey || data.key
        if (key) {
          setApiKey(key)
          setActiveKey(key)
          setApiKeyInput(key)
          setKeyNotice("API key auto-filled from server!")
          setTimeout(() => setKeyNotice(null), 4000)
          void refresh()
          return
        }
      }
      setError("Could not auto-fetch API key from server")
    } catch {
      setError("Could not auto-fetch API key from server")
    }
  }

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
              if (apiKeyInput.trim()) {
                setApiKey(apiKeyInput.trim())
                setActiveKey(apiKeyInput.trim())
                setApiKeyInput("")
                void refresh()
              }
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
                onClick={() => void handleAutoFillKey()}
                className="rounded-md border bg-muted px-3 py-2 text-xs font-medium hover:bg-muted/80"
              >
                Auto-fill
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateKey()}
                disabled={generatingKey}
                className="rounded-md border bg-secondary px-3 py-2 text-xs font-medium hover:bg-secondary/80 disabled:opacity-50"
              >
                {generatingKey ? "Generating..." : "Generate"}
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

        {/* API Key management section */}
        <div className="mt-6 border-t pt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>API Key</span>
            {activeKey ? (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-foreground">
                  {activeKey.slice(0, 8)}...{activeKey.slice(-6)}
                </span>
                <button
                  type="button"
                  title={copiedKey ? "Copied!" : "Copy API key"}
                  aria-label="Copy API key"
                  onClick={() => {
                    void navigator.clipboard.writeText(activeKey)
                    setCopiedKey(true)
                    setTimeout(() => setCopiedKey(false), 2000)
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {copiedKey ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            ) : (
              <span className="italic text-muted-foreground">Not set</span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void handleGenerateKey()}
              disabled={generatingKey}
              className="w-full rounded-md border bg-muted/60 px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {generatingKey ? "Generating…" : "Generate New Key"}
            </button>
          </div>
          {keyNotice && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">{keyNotice}</p>
          )}
        </div>
      </div>
      {error && error !== "API key required" && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
