import { describe, expect, it } from "vitest"
import { getLaunchPhase } from "./launch-phase"

describe("getLaunchPhase", () => {
  it("distinguishes API connectivity from WhatsApp readiness", () => {
    expect(getLaunchPhase(false, { ready: false, state: "STARTING" })).toBe(
      "connecting"
    )
    expect(getLaunchPhase(true, { ready: false, state: "STARTING" })).toBe(
      "launching"
    )
  })

  it("maps authentication and ready states", () => {
    expect(
      getLaunchPhase(true, { ready: false, state: "WAITING_FOR_SCAN" })
    ).toBe("qr")
    expect(getLaunchPhase(true, { ready: true, state: "STARTING" })).toBe(
      "ready"
    )
  })
})
