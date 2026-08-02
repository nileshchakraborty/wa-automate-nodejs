const PROFILES_STORAGE_KEY = "wa-dashboard-connection-profiles"
const ACTIVE_PROFILE_STORAGE_KEY = "wa-dashboard-active-profile"
const LEGACY_CONNECTION_STORAGE_KEY = "wa-dashboard-connection"

export type ConnectionProfile = {
  id: string
  name: string
  host: string
  port: string
}

export type ConnectionConfig = Pick<ConnectionProfile, "host" | "port">

function normalizeName(name: string) {
  return name.trim()
}

function profileId(name: string) {
  return normalizeName(name).toLowerCase()
}

function readProfiles(): Array<ConnectionProfile> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PROFILES_STORAGE_KEY) || "[]"
    )
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((value): Array<ConnectionProfile> => {
      if (!value || typeof value !== "object") return []
      const candidate = value as Partial<ConnectionProfile>
      if (
        typeof candidate.name !== "string" ||
        typeof candidate.host !== "string" ||
        typeof candidate.port !== "string"
      )
        return []

      const name = normalizeName(candidate.name)
      if (!name) return []
      return [
        {
          id: profileId(name),
          name,
          host: candidate.host.trim(),
          port: candidate.port.trim(),
        },
      ]
    })
  } catch {
    return []
  }
}

function migrateLegacyConnection(): Array<ConnectionProfile> {
  try {
    const raw = localStorage.getItem(LEGACY_CONNECTION_STORAGE_KEY)
    if (!raw) return []
    const legacy = JSON.parse(raw) as Partial<ConnectionConfig>
    const profile = saveProfile({
      name: "Default",
      host: typeof legacy.host === "string" ? legacy.host : "",
      port: typeof legacy.port === "string" ? legacy.port : "",
    })
    localStorage.removeItem(LEGACY_CONNECTION_STORAGE_KEY)
    return [profile]
  } catch {
    return []
  }
}

export function getProfiles(): Array<ConnectionProfile> {
  const profiles = readProfiles()
  return profiles.length > 0 ? profiles : migrateLegacyConnection()
}

export function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
}

export function getActiveProfile(): ConnectionProfile | null {
  const profiles = getProfiles()
  const activeId = getActiveProfileId()
  return (
    profiles.find((profile) => profile.id === activeId) ??
    profiles.at(0) ??
    null
  )
}

export function getStoredConnection(): ConnectionConfig | null {
  const profile = getActiveProfile()
  return profile ? { host: profile.host, port: profile.port } : null
}

export function saveProfile(
  input: Omit<ConnectionProfile, "id">,
  previousId?: string
): ConnectionProfile {
  const name = normalizeName(input.name)
  if (!name) throw new Error("Profile name is required")

  const profile = {
    id: profileId(name),
    name,
    host: input.host.trim(),
    port: input.port.trim(),
  }
  const profiles = readProfiles().filter(
    (candidate) => candidate.id !== profile.id && candidate.id !== previousId
  )
  localStorage.setItem(
    PROFILES_STORAGE_KEY,
    JSON.stringify([...profiles, profile])
  )
  localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profile.id)
  return profile
}

export function deleteProfile(id: string): void {
  const profiles = readProfiles().filter((profile) => profile.id !== id)
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles))

  if (getActiveProfileId() === id) {
    const nextId = profiles[0]?.id
    if (nextId) localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, nextId)
    else localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY)
  }
}

export function setActiveProfile(id: string): void {
  if (getProfiles().some((profile) => profile.id === id)) {
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id)
  }
}

export function clearProfiles(): void {
  localStorage.removeItem(PROFILES_STORAGE_KEY)
  localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY)
  localStorage.removeItem(LEGACY_CONNECTION_STORAGE_KEY)
}
