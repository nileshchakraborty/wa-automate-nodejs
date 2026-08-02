import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiFetch, setApiKey } from "./api-client"

describe("apiFetch", () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))
    )
  })

  it("adds the tab-scoped API key without changing existing headers", async () => {
    setApiKey("tab-only-secret")
    await apiFetch("http://rpi.local/meta/swagger.json", {
      headers: { Accept: "application/json" },
    })

    const fetchMock = vi.mocked(fetch)
    const [, init] = fetchMock.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)
    expect(headers.get("X-API-Key")).toBe("tab-only-secret")
    expect(headers.get("Accept")).toBe("application/json")
  })
})
