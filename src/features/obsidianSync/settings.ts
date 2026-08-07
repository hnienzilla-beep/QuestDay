export interface ObsidianSyncSettings {
  username: string
  repo: string
  token: string
  /** Datei im Vault, aus der neue Aufgaben/Ziele importiert werden. */
  inboxPath: string
}

export const DEFAULT_INBOX_PATH = '00-Inbox.md'

const STORAGE_KEY = 'obsidian-sync-settings'

export function getSyncSettings(): ObsidianSyncSettings | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ObsidianSyncSettings>
    if (!parsed.username || !parsed.repo || !parsed.token) return null
    // Ältere Einstellungen kennen inboxPath noch nicht.
    return { ...parsed, inboxPath: parsed.inboxPath || DEFAULT_INBOX_PATH } as ObsidianSyncSettings
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
