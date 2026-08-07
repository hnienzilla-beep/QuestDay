export interface ObsidianSyncSettings {
  username: string
  repo: string
  token: string
  /** Minuten zwischen zwei automatischen Syncs. 0 = nur manuell synchronisieren. */
  intervalMinutes: number
}

const STORAGE_KEY = 'obsidian-sync-settings'
const LAST_SYNC_KEY = 'obsidian-sync-last-at'

export const DEFAULT_INTERVAL_MINUTES = 30

/** Auswahlmöglichkeiten für das Sync-Intervall (Minuten, 0 = aus). */
export const INTERVAL_OPTIONS = [0, 15, 30, 60, 180, 360, 720] as const

export function getSyncSettings(): ObsidianSyncSettings | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ObsidianSyncSettings>
    if (!parsed.username || !parsed.repo || !parsed.token) return null
    return {
      username: parsed.username,
      repo: parsed.repo,
      token: parsed.token,
      // Ältere gespeicherte Einstellungen kennen das Feld noch nicht.
      intervalMinutes:
        typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes >= 0
          ? parsed.intervalMinutes
          : DEFAULT_INTERVAL_MINUTES,
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
  localStorage.removeItem(LAST_SYNC_KEY)
}

/** ISO-Zeitstempel des letzten erfolgreichen Syncs, oder null. */
export function getLastSyncAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY)
}

export function saveLastSyncAt(iso: string): void {
  localStorage.setItem(LAST_SYNC_KEY, iso)
}
