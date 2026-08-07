import { useEffect } from 'react'
import { getSyncSettings, getLastSyncAt } from './settings'
import { runSyncQuiet } from './runSync'

/** Wie oft geprüft wird, ob das eingestellte Sync-Intervall abgelaufen ist. */
const CHECK_INTERVAL_MS = 60_000

/** Startet einen Sync, wenn Sync eingerichtet, online und das Intervall abgelaufen ist. */
export function syncIfDue(): void {
  const settings = getSyncSettings()
  if (!settings || settings.intervalMinutes <= 0) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const lastSyncAt = getLastSyncAt()
  if (lastSyncAt) {
    const elapsedMs = Date.now() - new Date(lastSyncAt).getTime()
    if (elapsedMs < settings.intervalMinutes * 60_000) return
  }
  runSyncQuiet()
}

/**
 * Regelmäßiger Sync ins Vault-Repo: beim App-Start, jede Minute geprüft während die App
 * offen ist, beim Zurückkehren in den Vordergrund und sobald wieder Netz da ist.
 * Wie bei den Erinnerungen läuft nichts, während die App vollständig geschlossen ist –
 * ein fälliger Sync wird dann beim nächsten Öffnen nachgeholt.
 */
export function useSyncScheduler(): void {
  useEffect(() => {
    syncIfDue()

    const intervalId = window.setInterval(syncIfDue, CHECK_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncIfDue()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', syncIfDue)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', syncIfDue)
    }
  }, [])
}
