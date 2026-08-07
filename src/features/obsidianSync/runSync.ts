import { getSyncSettings, saveLastSyncAt } from './settings'
import { setSyncStatus } from './syncStatus'
import { ObsidianSyncError } from './githubApi'
import { syncQuestsHeute } from './questExport'
import { syncTodos } from './todoExport'
import { syncGoals } from './goalExport'

/** Läuft ein Sync gerade, wird dieselbe Promise zurückgegeben statt parallel zu schreiben. */
let inFlight: Promise<void> | null = null

/**
 * Schreibt Quests, To-dos und Ziele nacheinander ins Vault-Repo. Sequentiell, damit
 * die GitHub-Contents-API pro Datei mit einem aktuellen SHA arbeitet.
 */
export function runSync(): Promise<void> {
  if (inFlight) return inFlight

  if (!getSyncSettings()) {
    return Promise.reject(
      new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.'),
    )
  }

  setSyncStatus({ phase: 'running', message: 'Synchronisiere…' })

  inFlight = (async () => {
    try {
      await syncQuestsHeute()
      await syncTodos()
      await syncGoals()
      const now = new Date().toISOString()
      saveLastSyncAt(now)
      setSyncStatus({ phase: 'success', message: 'Quests, To-dos und Ziele synchronisiert ✅', lastSyncAt: now })
    } catch (err) {
      setSyncStatus({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Unbekannter Fehler beim Sync.',
      })
      throw err
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Wie `runSync`, aber ohne unbehandelte Rejection – für automatische Syncs im Hintergrund. */
export function runSyncQuiet(): Promise<void> {
  return runSync().catch((err) => {
    console.warn('Obsidian-Sync (automatisch) fehlgeschlagen:', err)
  })
}
