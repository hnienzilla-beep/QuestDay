import type { Goal } from '../../../types/goal'
import { cleanText, cleanTableCell, compareBy, normalizeFileContent } from '../canonical'
import { renderFrontmatter, frontmatterValue } from '../frontmatter'
import { renderItemLine } from '../lineFormat'
import { dayItems, type DayItem } from '../model/dayScope'
import { categoryNameOf, subStepsOfGoal, type VaultSnapshot } from '../model/snapshot'
import { renderGoalRecurrenceToken, renderTaskRecurrenceToken } from '../recurrenceFormat'

/**
 * Alle Renderer sind reine Funktionen über den Snapshot: keine Dexie-Zugriffe, keine Uhr,
 * kein `localeCompare`. Die Bytes einer Tagesdatei sind eine Funktion ausschließlich der
 * Daten dieses Tages - sonst würde jede beliebige Änderung sämtliche Tagesdateien umschreiben.
 */

export const DAY_SECTIONS = ['Aufgaben', 'Termine', 'Ziele'] as const
export const SUBSTEPS_HEADING = 'Teilschritte'

export const TYPE_DAY = 'questday-tag'
export const TYPE_GOAL = 'questday-ziel'
export const TYPE_TASKS = 'questday-aufgaben'
export const TYPE_CATEGORIES = 'questday-kategorien'

/** Abschnitte werden ohne Schluss-Newline gebaut; die Leerzeilen setzt der Aufrufer. */
function section(heading: string, lines: readonly string[]): string {
  return lines.length > 0 ? `## ${heading}\n\n${lines.join('\n')}` : `## ${heading}`
}

export function renderDayFile(snapshot: VaultSnapshot, dateStr: string): string {
  const items = dayItems(snapshot, dateStr)
  const lineFor = (item: DayItem) =>
    renderItemLine({
      id: item.id,
      checked: item.checked,
      title: item.title,
      categoryName: categoryNameOf(snapshot, item.categoryId),
      startTime: item.startTime,
      endTime: item.endTime,
      location: item.location,
    })

  const parts = [
    renderFrontmatter([
      ['typ', TYPE_DAY],
      ['datum', dateStr],
    ]),
    '',
    section(
      'Aufgaben',
      items.filter((i) => i.kind === 'task').map(lineFor),
    ),
    '',
    section(
      'Termine',
      items.filter((i) => i.kind === 'appointment').map(lineFor),
    ),
    '',
    section(
      'Ziele',
      items.filter((i) => i.kind === 'goalCycle').map(lineFor),
    ),
  ]
  return normalizeFileContent(parts.join('\n'))
}

export function renderGoalFile(snapshot: VaultSnapshot, goal: Goal): string {
  const steps = subStepsOfGoal(snapshot, goal.id)
  const stepLines = steps.map((step) =>
    renderItemLine({
      id: step.id,
      checked: goal.recurrence === null && step.completed,
      title: step.title,
      categoryName: null,
    }),
  )

  const parts = [
    renderFrontmatter([
      ['typ', TYPE_GOAL],
      ['id', goal.id],
      ['kategorie', frontmatterValue(categoryNameOf(snapshot, goal.categoryId))],
      ['erstellt', goal.createdAt.slice(0, 10)],
      ['zieldatum', frontmatterValue(goal.targetDate)],
      ['wiederholung', renderGoalRecurrenceToken(goal.recurrence)],
      ['ankerdatum', frontmatterValue(goal.recurrence?.anchorDate ?? null)],
      ['erinnerung', frontmatterValue(goal.recurrence?.reminderTime ?? null)],
      ['gestoppt', frontmatterValue(goal.recurrence?.stoppedAt?.slice(0, 10) ?? null)],
      ['erledigt', frontmatterValue(goal.completedAt?.slice(0, 10) ?? null)],
    ]),
    '',
    `# ${cleanText(goal.title) || '(ohne Titel)'}`,
    '',
    cleanText(goal.target) || '_kein Zieltext_',
    '',
    section(SUBSTEPS_HEADING, stepLines),
  ]
  return normalizeFileContent(parts.join('\n'))
}

export function renderTasksFile(snapshot: VaultSnapshot): string {
  const recurring = snapshot.tasks
    .filter((task) => task.type === 'recurring')
    .sort((a, b) => compareBy([a.title, a.id], [b.title, b.id]))

  const rows = recurring.map((task) =>
    [
      cleanTableCell(task.title),
      cleanTableCell(categoryNameOf(snapshot, task.categoryId) ?? ''),
      renderTaskRecurrenceToken(task),
      task.time ?? '',
      task.reminderTime ?? '',
      task.id,
    ].join(' | '),
  )

  const table = [
    '| Aufgabe | Kategorie | Rhythmus | Uhrzeit | Erinnerung | ID |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
  ].join('\n')

  const parts = [
    renderFrontmatter([['typ', TYPE_TASKS]]),
    '',
    '# Wiederkehrende Aufgaben',
    '',
    'Eine leere Zelle lässt den Wert unverändert, ein einzelnes `-` löscht ihn.',
    'Eine entfernte Zeile löscht nichts - wiederkehrende Aufgaben werden nur in der App gelöscht.',
    '',
    table,
  ]
  return normalizeFileContent(parts.join('\n'))
}

export function renderCategoriesFile(snapshot: VaultSnapshot): string {
  const rows = snapshot.categories.map((category) =>
    [cleanTableCell(category.name), category.color, category.id].join(' | '),
  )

  const table = [
    '| Kategorie | Farbe | ID |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
  ].join('\n')

  const parts = [
    renderFrontmatter([['typ', TYPE_CATEGORIES]]),
    '',
    '# Kategorien',
    '',
    'Umbenennen und Farbe ändern werden übernommen. Eine Zeile **ohne ID** legt eine neue',
    'Kategorie an. Eine entfernte Zeile löscht nichts - Aufgaben, Ziele und Erledigungen',
    'verweisen auf Kategorien, gelöscht werden sie nur in der App.',
    '',
    table,
  ]
  return normalizeFileContent(parts.join('\n'))
}
