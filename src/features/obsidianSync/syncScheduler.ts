import { getSyncSettings, repoKeyOf } from './settings'
import { ObsidianSyncError } from './githubApi'
import { runSync, runFullRestoreFromJson, removeLegacyQuestFiles, type SyncResult } from './syncEngine'
import { backoffDelayMs, commitSyncState, loadSyncState } from './syncState'

/**
 * Wann abgeglichen wird.
 *
 * Beim App-Start, alle 15 Minuten, kurz nach jeder Änderung, beim Zurückkehren in die App
 * und wenn das Gerät wieder online geht. Schlägt ein Lauf fehl, wächst der Abstand.
 *
 * Läuft die App nicht, ruht der Abgleich von selbst - alle Timer hier hängen an der
 * geöffneten Seite. Ein echter Hintergrund-Sync bräuchte einen Service Worker mit eigenem
 * Code (das Projekt nutzt `generateSW`) und liefe dem "kein Server"-Prinzip zuwider.
 *
 * Der Zustand liegt bewusst im Modul, nicht in einem Hook: React 19 mountet Effects im
 * StrictMode doppelt, und ein `setInterval` im Effekt-Rumpf liefe dann zweimal.
 */

export type SyncPhase = 'idle' | 'running' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  lastSyncAt: number | null
  lastError: string | null
  lastResult: SyncResult | null
  nextAttemptAt: number | null
}

const INTERVAL_MS = 15 * 60 * 1000
const DEBOUNCE_MS = 3000

let started = false
let inFlight: Promise<SyncResult | null> | null = null
let pendingRerun = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let backoffTimer: ReturnType<typeof setTimeout> | null = null

let status: SyncStatus = {
  phase: 'idle',
  lastSyncAt: null,
  lastError: null,
  lastResult: null,
  nextAttemptAt: null,
}
const listeners = new Set<(status: SyncStatus) => void>()

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  for (const listener of listeners) listener(status)
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function canSync(): boolean {
  if (!getSyncSettings()) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  return true
}

/** Merkt den Fehlschlag im Zustand und plant den nächsten Versuch mit wachsendem Abstand. */
function scheduleBackoff(err: unknown): void {
  const settings = getSyncSettings()
  if (!settings) return

  const state = loadSyncState(repoKeyOf(settings))
  const failures = state.backoff.failures + 1
  const retryAfter = err instanceof ObsidianSyncError ? err.retryAfterMs : undefined
  const delay = Math.max(retryAfter ?? 0, backoffDelayMs(failures))
  const nextAttemptAt = Date.now() + delay

  commitSyncState({
    ...state,
    lastError: err instanceof Error ? err.message : 'Unbekannter Fehler beim Abgleich.',
    backoff: { failures, nextAttemptAt },
  })

  if (backoffTimer) clearTimeout(backoffTimer)
  backoffTimer = setTimeout(() => {
    backoffTimer = null
    void runNow()
  }, delay)

  setStatus({
    phase: 'error',
    lastError: err instanceof Error ? err.message : 'Unbekannter Fehler beim Abgleich.',
    nextAttemptAt,
  })
}

/**
 * Single-Flight: es läuft höchstens ein Abgleich. Ein Auslöser währenddessen merkt sich
 * einen weiteren Durchlauf, statt parallel zu laufen - GitHub mag gleichzeitige Schreib-
 * zugriffe auf dasselbe Repo ohnehin nicht.
 */
export function runNow(): Promise<SyncResult | null> {
  if (inFlight) {
    pendingRerun = true
    return inFlight
  }
  if (!canSync()) return Promise.resolve(null)

  if (backoffTimer) {
    clearTimeout(backoffTimer)
    backoffTimer = null
  }
  setStatus({ phase: 'running', nextAttemptAt: null })

  inFlight = (async () => {
    try {
      const result = await runSync()
      setStatus({
        phase: 'idle',
        lastSyncAt: Date.now(),
        lastError: null,
        lastResult: result,
        nextAttemptAt: null,
      })
      return result
    } catch (err) {
      scheduleBackoff(err)
      return null
    } finally {
      inFlight = null
      if (pendingRerun) {
        pendingRerun = false
        void runNow()
      }
    }
  })()

  return inFlight
}

/** Kurz nach einer Änderung - gebündelt, damit schnelles Abhaken einen Lauf ergibt. */
export function triggerAutoSync(): void {
  if (!canSync()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runNow()
  }, DEBOUNCE_MS)
}

export function ensureSyncSchedulerStarted(): void {
  if (started) return
  started = true

  const settings = getSyncSettings()
  if (settings) {
    const state = loadSyncState(repoKeyOf(settings))
    setStatus({ lastSyncAt: state.lastSyncAt, lastError: state.lastError })
  }

  setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void runNow()
  }, INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void runNow()
  })
  window.addEventListener('online', () => {
    void runNow()
  })

  void runNow()
}

/** Manuelle Aktionen aus dem Panel - laufen durch dasselbe Single-Flight. */
async function runExclusive(action: () => Promise<SyncResult>): Promise<SyncResult> {
  while (inFlight) await inFlight
  setStatus({ phase: 'running' })
  try {
    const result = await action()
    setStatus({ phase: 'idle', lastSyncAt: Date.now(), lastError: null, lastResult: result })
    return result
  } catch (err) {
    setStatus({
      phase: 'error',
      lastError: err instanceof Error ? err.message : 'Unbekannter Fehler.',
    })
    throw err
  }
}

export function restoreFromJson(): Promise<SyncResult> {
  return runExclusive(runFullRestoreFromJson)
}

export function cleanUpLegacyFiles(): Promise<SyncResult> {
  return runExclusive(removeLegacyQuestFiles)
}
