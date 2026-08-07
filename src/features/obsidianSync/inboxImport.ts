import { todayISODate } from '../../utils/dateUtils'
import { addAppointment, addOneOffTask, addRecurringTask } from '../tasks/taskRepository'
import { addGoal } from '../goals/goalRepository'
import { readFile, upsertFile, ObsidianSyncError } from './githubApi'
import { getSyncSettings, DEFAULT_INBOX_PATH } from './settings'
import { parseInboxLines, rewriteInbox, type ParsedEntry } from './inboxParser'

export interface InboxImportResult {
  importedTasks: number
  importedGoals: number
  /** Inbox-Datei existiert (noch) nicht im Vault. */
  fileMissing: boolean
  /** Importierte Zeilen konnten in der Inbox als erledigt markiert werden. */
  inboxUpdated: boolean
  warnings: string[]
}

async function createEntry(entry: ParsedEntry): Promise<void> {
  if (entry.kind === 'goal') {
    await addGoal({
      title: entry.title,
      target: '',
      category: entry.category,
      targetDate: entry.targetDate,
      subStepTitles: entry.subStepTitles,
      recurrence: entry.recurrence,
    })
    return
  }

  if (entry.taskType === 'appointment') {
    await addAppointment({
      title: entry.title,
      category: entry.category,
      date: entry.date!,
      startTime: entry.startTime!,
      endTime: entry.endTime,
      location: entry.location,
      reminderTime: entry.reminderTime,
    })
    return
  }

  if (entry.taskType === 'recurring') {
    await addRecurringTask({
      title: entry.title,
      category: entry.category,
      frequency: entry.frequency!,
      weekday: entry.weekday,
      reminderTime: entry.reminderTime,
    })
    return
  }

  await addOneOffTask({
    title: entry.title,
    category: entry.category,
    dueDate: entry.dueDate,
    reminderTime: entry.reminderTime,
  })
}

/**
 * Liest neue Aufgaben und Ziele aus der Inbox-Datei des Vaults und legt sie lokal an.
 *
 * Reihenfolge bewusst: erst anlegen, dann die Inbox aufräumen. Scheitert das
 * Aufräumen (z.B. weil die Datei zwischenzeitlich geändert wurde), sind die
 * Einträge trotzdem in der App - der Nutzer wird gewarnt, dass die Zeilen sonst
 * beim nächsten Import ein zweites Mal ankommen.
 */
export async function importInbox(): Promise<InboxImportResult> {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }
  const path = settings.inboxPath || DEFAULT_INBOX_PATH
  const today = todayISODate()

  const file = await readFile(path)
  if (!file) {
    return { importedTasks: 0, importedGoals: 0, fileMissing: true, inboxUpdated: false, warnings: [] }
  }

  const lines = file.content.split('\n')
  const { entries, warnings } = parseInboxLines(lines, today)
  const result: InboxImportResult = {
    importedTasks: 0,
    importedGoals: 0,
    fileMissing: false,
    inboxUpdated: false,
    warnings: warnings.map((w) => `${w.reason}: ${w.line.trim()}`),
  }
  if (entries.length === 0) return result

  const importedIndexes: number[] = []
  for (const entry of entries) {
    await createEntry(entry)
    importedIndexes.push(entry.lineIndex)
    if (entry.kind === 'goal') result.importedGoals++
    else result.importedTasks++
  }

  try {
    await upsertFile(
      path,
      rewriteInbox(lines, importedIndexes, today),
      `QuestDay: ${importedIndexes.length} Einträge importiert`,
      file.sha,
    )
    result.inboxUpdated = true
  } catch (err) {
    result.warnings.push(
      `Inbox konnte nicht aufgeräumt werden (${err instanceof Error ? err.message : 'unbekannter Fehler'}). ` +
        'Bitte die importierten Zeilen im Vault entfernen, sonst kommen sie beim nächsten Import doppelt an.',
    )
  }

  return result
}
