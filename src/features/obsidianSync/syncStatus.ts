import { getLastSyncAt } from './settings'

export type SyncPhase = 'idle' | 'running' | 'success' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  message: string
  /** ISO-Zeitstempel des letzten erfolgreichen Syncs, oder null. */
  lastSyncAt: string | null
}

let status: SyncStatus = { phase: 'idle', message: '', lastSyncAt: getLastSyncAt() }
const listeners = new Set<() => void>()

/** Für `useSyncExternalStore`: Snapshot bleibt referenzgleich, solange sich nichts ändert. */
export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSyncStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}
