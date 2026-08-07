import { getSyncSettings, saveLastSyncAt, getLastSyncAt } from './settings'
import { setSyncStatus } from './syncStatus'
import { ObsidianSyncError, fetchFile, upsertFile } from './githubApi'
import { getBaseline, saveBaseline } from './baseline'
import { renderQuestFile } from './questExport'
import { renderTodoFile, TODO_FILE_PATH } from './todoExport'
import { renderGoalFile, GOAL_FILE_PATH } from './goalExport'
import { parseTodoFile } from './todoParse'
import { parseGoalFile } from './goalParse'
import { importTodoChanges, EMPTY_SUMMARY, summaryTotal, type ImportSummary } from './importTodos'
import { importGoalChanges } from './importGoals'
import { evaluateBadges } from '../gamification/badges'

/** Läuft ein Sync gerade, wird dieselbe Promise zurückgegeben statt parallel zu schreiben. */
let inFlight: Promise<void> | null = null

interface DocumentSync<T> {
  path: string
  commitMessage: string
  parse: (content: string) => T[] | null
  applyVaultChanges: (
    baseline: T[],
    current: T[],
    vaultModifiedAt: string | null,
    lastSyncAt: string | null,
  ) => Promise<ImportSummary>
  render: () => Promise<string>
}

/**
 * Zwei-Wege-Sync einer Datei: erst die im Vault gemachten Änderungen übernehmen,
 * dann den zusammengeführten Stand zurückschreiben und als neue Baseline sichern.
 *
 * Ohne Baseline (erster Sync nach dem Einrichten) wird bewusst nur exportiert – ein
 * bestehender Vault-Inhalt wäre sonst nicht von einer Änderung zu unterscheiden.
 */
async function syncDocument<T extends { id: string | null }>(doc: DocumentSync<T>): Promise<ImportSummary> {
  const [remote, baseline] = await Promise.all([fetchFile(doc.path), getBaseline(doc.path)])

  let summary = EMPTY_SUMMARY
  if (remote && baseline && remote.content !== baseline.content) {
    const currentItems = doc.parse(remote.content)
    const baselineItems = doc.parse(baseline.content)
    // Nicht auswertbar (Datei umgebaut oder Überschrift entfernt): lieber nur
    // exportieren als auf Basis eines kaputten Parses Daten zu löschen.
    if (currentItems && baselineItems) {
      summary = await doc.applyVaultChanges(baselineItems, currentItems, remote.lastModified, getLastSyncAt())
    }
  }

  const content = await doc.render()
  if (content !== remote?.content) {
    await upsertFile(doc.path, content, doc.commitMessage, remote?.sha ?? null)
  }
  await saveBaseline(doc.path, content)
  return summary
}

function describe(todos: ImportSummary, goals: ImportSummary): string {
  const total = summaryTotal(todos) + summaryTotal(goals)
  if (total === 0) return 'Synchronisiert ✅'
  const parts: string[] = []
  const created = todos.created + goals.created
  const updated = todos.updated + goals.updated
  const deleted = todos.deleted + goals.deleted
  if (created > 0) parts.push(`${created} neu`)
  if (updated > 0) parts.push(`${updated} geändert`)
  if (deleted > 0) parts.push(`${deleted} gelöscht`)
  return `Synchronisiert ✅ · aus dem Vault übernommen: ${parts.join(', ')}`
}

/**
 * Synchronisiert Quests (nur Export), To-dos und Ziele (beide Richtungen).
 * Sequentiell, damit die GitHub-Contents-API pro Datei mit einem aktuellen SHA arbeitet.
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
      const todos = await syncDocument({
        path: TODO_FILE_PATH,
        commitMessage: 'QuestDay-Sync: To-dos',
        parse: parseTodoFile,
        applyVaultChanges: importTodoChanges,
        render: renderTodoFile,
      })

      const goals = await syncDocument({
        path: GOAL_FILE_PATH,
        commitMessage: 'QuestDay-Sync: Ziele',
        parse: parseGoalFile,
        applyVaultChanges: importGoalChanges,
        render: renderGoalFile,
      })

      if (summaryTotal(todos) + summaryTotal(goals) > 0) {
        await evaluateBadges()
      }

      // Der Tagesbericht wird zuletzt geschrieben, damit er den Stand nach dem Import zeigt.
      const quests = await renderQuestFile()
      await upsertFile(quests.path, quests.content, 'QuestDay-Sync: Quests')

      const now = new Date().toISOString()
      saveLastSyncAt(now)
      setSyncStatus({ phase: 'success', message: describe(todos, goals), lastSyncAt: now })
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
