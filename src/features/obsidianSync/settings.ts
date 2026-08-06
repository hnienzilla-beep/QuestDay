export interface ObsidianSyncSettings {
  username: string
  repo: string
  branch: string
  token: string
}

const STORAGE_KEY = 'obsidian-sync-settings'

export const DEFAULT_BRANCH = 'main'

export function getSyncSettings(): ObsidianSyncSettings | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ObsidianSyncSettings>
    if (!parsed.username || !parsed.repo || !parsed.token) return null
    return {
      username: parsed.username,
      repo: parsed.repo,
      // Vor dem Umbau gab es kein Branch-Feld - bestehende Einstellungen bleiben gültig.
      branch: parsed.branch || DEFAULT_BRANCH,
      token: parsed.token,
    }
  } catch {
    return null
  }
}

export function saveSyncSettings(settings: ObsidianSyncSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function clearSyncSettings(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Identifiziert das Ziel-Repo; wechselt es, ist der gemerkte Sync-Zustand wertlos. */
export function repoKeyOf(settings: ObsidianSyncSettings): string {
  return `${settings.username}/${settings.repo}@${settings.branch}`
}
