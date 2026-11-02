import { useState, useEffect } from "react"
import { KeyRound, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@open-wa/ui-components/popover"
import { getApiKey, resetClient, setApiKey } from "@/lib/api-client"

export function ApiKeyBadge() {
  const [key, setKey] = useState(getApiKey())
  const [inputVal, setInputVal] = useState(getApiKey())
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const current = getApiKey()
    setKey(current)
    setInputVal(current)
  }, [open])

  const copyKey = async () => {
    if (!key) return
    await navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = () => {
    const trimmed = inputVal.trim()
    setApiKey(trimmed)
    setKey(trimmed)
    setNotice(trimmed ? "Key saved & connected!" : "Key cleared!")
    resetClient()
    window.dispatchEvent(new Event("openwa:reconnect"))
    setTimeout(() => setOpen(false), 800)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="OpenWA API Key Settings"
          className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <KeyRound size={13} className="text-amber-500" />
          <span className="font-mono">{key ? `${key.slice(0, 6)}…` : "API Key"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 space-y-3 rounded-xl border bg-popover p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <KeyRound size={15} className="text-amber-500" />
            <h4 className="text-xs font-semibold text-foreground">OpenWA API Key</h4>
          </div>
          {key && (
            <button
              type="button"
              title={copied ? "Copied!" : "Copy key"}
              aria-label="Copy API key"
              onClick={() => void copyKey()}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Authenticate requests and pair with your OpenWA session.
        </p>

        <div className="space-y-1.5">
          <Input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Enter API key"
            className="h-8 font-mono text-xs"
          />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          className="w-full text-xs"
        >
          Apply &amp; Reconnect
        </Button>

        {notice && (
          <p className="text-center text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            {notice}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
