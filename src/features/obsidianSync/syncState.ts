/**
 * Gemerkter Sync-Zustand (localStorage).
 *
 * Zwei Regeln, an denen die Sicherheit des Verfahrens hängt:
 *
 * 1. `agreedShas` ist der Stand, bei dem App und Repo zuletzt *nachweislich* übereinstimmten.
 *    Nur damit lässt sich unterscheiden, welche Seite sich geändert hat.
 * 2. Geschrieben wird ausschließlich am Ende eines vollständig erfolgreichen Laufs, in einer
 *    einzigen Operation. Schriebe man Teilerfolge weg, würde eine Divergenz unsichtbar und
 *    damit dauerhaft.
 */

export interface SyncBackoff {
  failures: number
  nextAttemptAt: number | null
}

export interface SyncState {
  version: 1
  repoKey: string
  treeEtag: string | null
  /** Pfad -> Blob-SHA, so wie das Repo beim letzten Lauf aussah (Cache für 304-Antworten). */
  remoteShas: Record<string, string>
  /** Pfad -> Blob-SHA, bei dem App und Repo übereinstimmten. */
  agreedShas: Record<string, string>
  /** Ziel-ID -> Pfad, damit ein in Obsidian umbenanntes Ziel keine Dublette erzeugt. */
  goalPaths: Record<string, string>
  /** Pfad -> Blob-SHA, der sich nicht parsen ließ; wird nicht erneut geladen. */
  quarantine: Record<string, string>
  bootstrappedFor: string | null
  lastSyncAt: number | null
  lastError: string | null
  backoff: SyncBackoff
}

const STORAGE_KEY = 'questday-sync-state'

export function emptySyncState(repoKey: string): SyncState {
  return {
    version: 1,
    repoKey,
    treeEtag: null,
    remoteShas: {},
    agreedShas: {},
    goalPaths: {},
    quarantine: {},
    bootstrappedFor: null,
    lastSyncAt: null,
    lastError: null,
    backoff: { failures: 0, nextAttemptAt: null },
  }
}

/**
 * Lädt den Zustand. Passt er nicht zum aktuellen Repo (oder ist kaputt), wird bei null
 * angefangen - das ist unbedenklich, weil der Drei-Wege-Vergleich in `syncEngine` ohne
 * `agreedShas` nichts importiert, was lokal bereits identisch gerendert wird.
 */
export function loadSyncState(repoKey: string): SyncState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return emptySyncState(repoKey)
  try {
    const parsed = JSON.parse(raw) as SyncState
    if (parsed.version !== 1 || parsed.repoKey !== repoKey) return emptySyncState(repoKey)
    return {
      ...emptySyncState(repoKey),
      ...parsed,
      backoff: { ...emptySyncState(repoKey).backoff, ...parsed.backoff },
    }
  } catch {
    return emptySyncState(repoKey)
  }
}

export function commitSyncState(next: SyncState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearSyncState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 900_000]

export function backoffDelayMs(failures: number): number {
  const index = Math.min(Math.max(failures, 1), BACKOFF_STEPS_MS.length) - 1
  return BACKOFF_STEPS_MS[index]
}
