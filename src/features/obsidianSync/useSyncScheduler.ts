import { useEffect, useState } from 'react'
import { ensureSyncSchedulerStarted, getSyncStatus, subscribeSyncStatus, type SyncStatus } from './syncScheduler'

/**
 * Dünne Anbindung an den Scheduler. Der eigentliche Zustand liegt im Modul, deshalb ist der
 * Hook auch ohne Cleanup StrictMode-fest: `ensureSyncSchedulerStarted` ist idempotent.
 *
 * `enabled` verhindert, dass der erste Lauf startet, bevor `ensureSeedData` durch ist -
 * sonst würde ein Profil mit Nullwerten geschrieben und gleich darauf noch einmal korrigiert.
 */
export function useSyncScheduler(enabled = true): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)

  useEffect(() => {
    if (enabled) ensureSyncSchedulerStarted()
    return subscribeSyncStatus(setStatus)
  }, [enabled])

  return status
}
