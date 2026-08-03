export function getLaunchPhase(
  apiConnected: boolean,
  session: Record<string, unknown> | null
) {
  if (!apiConnected || !session) return "connecting"
  if (session.ready === true) return "ready"

  const state = typeof session.state === "string" ? session.state : undefined
  if (state === "READY" || state === "CONNECTED") return "ready"
  if (state === "AUTHENTICATING" || state === "WAITING_FOR_SCAN") return "qr"
  return "launching"
}
