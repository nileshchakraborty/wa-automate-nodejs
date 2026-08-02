import { beforeEach, describe, expect, it } from "vitest"
import {
  clearProfiles,
  deleteProfile,
  getActiveProfile,
  getProfiles,
  getStoredConnection,
  saveProfile,
  setActiveProfile,
} from "./connection-profiles"

describe("connection profiles", () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  it("saves named profiles without credentials", () => {
    saveProfile({ name: "Home Pi", host: "192.168.1.229", port: "8081" })

    expect(getActiveProfile()).toEqual({
      id: "home pi",
      name: "Home Pi",
      host: "192.168.1.229",
      port: "8081",
    })
    expect(
      localStorage.getItem("wa-dashboard-connection-profiles")
    ).not.toContain("apiKey")
  })

  it("switches and deletes profiles", () => {
    const home = saveProfile({ name: "Home", host: "rpi.local", port: "8081" })
    const lab = saveProfile({ name: "Lab", host: "lab.local", port: "8082" })

    setActiveProfile(home.id)
    expect(getStoredConnection()).toEqual({ host: "rpi.local", port: "8081" })

    deleteProfile(home.id)
    expect(getActiveProfile()?.id).toBe(lab.id)
  })

  it("renames a profile without leaving a duplicate", () => {
    const profile = saveProfile({
      name: "Home",
      host: "rpi.local",
      port: "8081",
    })
    saveProfile(
      { name: "Home Pi", host: "rpi.local", port: "8081" },
      profile.id
    )

    expect(getProfiles().map(({ name }) => name)).toEqual(["Home Pi"])
  })

  it("migrates the previous single connection", () => {
    localStorage.setItem(
      "wa-dashboard-connection",
      JSON.stringify({ host: "rpi.local", port: "8081" })
    )

    expect(getProfiles()).toEqual([
      { id: "default", name: "Default", host: "rpi.local", port: "8081" },
    ])
    expect(localStorage.getItem("wa-dashboard-connection")).toBeNull()
  })

  it("clears profile settings", () => {
    saveProfile({ name: "Home", host: "rpi.local", port: "8081" })
    clearProfiles()
    expect(getProfiles()).toEqual([])
  })
})
