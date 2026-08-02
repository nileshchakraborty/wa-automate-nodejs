import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ApiReferenceReact } from "@scalar/api-reference-react"
import { useSocket } from "@/lib/hooks/use-socket"
import { apiFetch, getApiUrl } from "@/lib/api-client"
import "@scalar/api-reference-react/style.css"
import "@/styles.css"

export const Route = createFileRoute("/api-docs")({ component: ApiDocsPage })

const SCALAR_HIDDEN_CLIENTS = {
  csharp: ["restsharp"],
  java: ["asynchttp", "okhttp", "unirest"],
  js: ["axios", "ofetch", "jquery", "xhr"],
  node: ["axios", "fetch", "ofetch"],
  php: ["curl"],
  powershell: ["webrequest"],
  python: ["requests", "httpx_sync", "httpx_async"],
  shell: ["httpie", "wget"],
} as const

/**
 * API Documentation page using Scalar API Reference.
 *
 * Renders the OpenAPI spec from the Easy API's /meta/swagger.json endpoint.
 * Scalar styles are mapped to shadcn theme tokens via CSS variable overrides
 * in styles.css, and CSS layer ordering prevents Tailwind v4 conflicts.
 *
 * Configuration disables:
 * - AI agent (agent.disabled)
 * - MCP integration (mcp.disabled)
 * - Dark mode toggle (handled by our ThemeToggle)
 * - Search (uses dashboard nav instead)
 * - Default fonts (uses our Geist font)
 */
function ApiDocsPage() {
  useSocket()
  const [apiUrl, setApiUrl] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    setApiUrl(getApiUrl())
  }, [])

  if (!apiUrl) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading API documentation...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="scalar-container">
      <ApiReferenceReact
        configuration={
          {
            url: `${apiUrl}/meta/swagger.json`,
            fetch: apiFetch,
            theme: "none",
            layout: "classic",
            hideModels: false,
            hideClientButton: false,
            hideDarkModeToggle: true,
            withDefaultFonts: false,
            darkMode: document.documentElement.classList.contains("dark"),
            telemetry: false,
            // Scalar's overview still filters through this compatibility field.
            // Keep one client per language because installation examples are
            // keyed by language rather than individual HTTP library.
            hiddenClients: SCALAR_HIDDEN_CLIENTS,
            // Disable AI agent features
            agent: {
              disabled: true,
            },
            // Disable MCP integration
            mcp: {
              disabled: true,
            },
            // Apply our own CSS on top of Scalar's base
            customCss: `
            /* Hide Scalar branding / powered-by links */
            .scalar-card-footer-powered-by,
            a[href*="scalar.com"],
            .powered-by,
            [class*="powered-by"],
            [class*="PoweredBy"],
            .scalar-api-reference__footer,
            footer[class*="scalar"] {
              display: none !important;
            }
            /* Use our font */
            .scalar-api-reference, .scalar-app {
              font-family: var(--font-sans) !important;
            }
          `,
          } as any
        }
      />
    </div>
  )
}
