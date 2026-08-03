import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  authenticateApiKey,
  getGatewayAuthStatus,
  registerProfile,
} from "./auth-client"

describe("gateway auth client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  it("keeps credentials on the dashboard origin", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          gateway: true,
          authenticated: false,
          profile: null,
          registration: { enabled: true, remaining: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    await getGatewayAuthStatus()

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      `${window.location.origin}/auth/status`
    )
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.credentials).toBe("same-origin")
  })

  it("sends registration and API keys only to same-origin auth routes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ apiKey: "owa_generated", note: "save" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    )

    await registerProfile("alice", "correct horse battery staple")
    await authenticateApiKey("owa_existing")

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      `${window.location.origin}/auth/register`,
      `${window.location.origin}/auth/api-key`,
    ])
  })
})
