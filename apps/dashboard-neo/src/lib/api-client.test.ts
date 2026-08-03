import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiFetch, setApiKey } from "./api-client"

describe("apiFetch", () => {
  beforeEach(() => {
    setApiKey("")
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))
    )
  })

  it("adds an in-memory API key without changing existing headers", async () => {
    setApiKey("memory-only-secret")
    await apiFetch("http://rpi.local/meta/swagger.json", {
      headers: { Accept: "application/json" },
    })

    const fetchMock = vi.mocked(fetch)
    const [, init] = fetchMock.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)
    expect(headers.get("X-API-Key")).toBe("memory-only-secret")
    expect(headers.get("Accept")).toBe("application/json")
    expect(sessionStorage.setItem).not.toHaveBeenCalled()
  })
})
