import { useState } from "react"
import { Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@open-wa/ui-components/popover"
import { useLicense } from "@/lib/hooks/use-license"
import { useSession } from "@/lib/hooks/use-session"

export function SessionLicenseBadge() {
  const license = useLicense()
  const { session } = useSession()
  const [detailsOpen, setDetailsOpen] = useState(false)

  const label = "Community · Unlocked"

  return (
    <div className="flex items-center gap-1">
      <Popover open={detailsOpen} onOpenChange={setDetailsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ow-license-foil shadow-none"
            aria-expanded={detailsOpen}
            aria-label="Selected session licence status"
          >
            <Ticket size={14} />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-80 max-w-[calc(100vw-1rem)] rounded-2xl p-4 text-popover-foreground"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Selected session</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All features unlocked without license restrictions.
              </p>
            </div>
            <span className="ow-license-foil rounded-md px-2 py-1 text-xs font-medium">
              Unlocked
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-border/70 bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Licensed</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">License type</span>
              <span className="font-medium">Community Edition</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Session</span>
              <code className="max-w-44 truncate">
                {session.sessionId || "default"}
              </code>
            </div>
          </div>

          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-semibold">Features</p>
            <dl className="max-h-56 space-y-2 overflow-auto text-xs">
              {Object.entries(license.features).map(([feature, enabled]) => (
                <div key={feature} className="flex items-center justify-between gap-3">
                  <dt className="min-w-0 truncate" title={feature}>
                    {({ patch_calls_control: 'Call controls', patch_calls_audio: 'Call audio', patch_calls_video: 'Call video' } as Record<string, string>)[feature] ?? feature.replace(/^patch_/, '').replace(/_/g, ' ')}
                  </dt>
                  <dd className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">Enabled</dd>
                </div>
              ))}
            </dl>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
