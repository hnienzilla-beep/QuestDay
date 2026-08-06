import type { GoalRecurrence } from '../../../types/goal'
import { compareBy } from '../canonical'
import type { VaultSnapshot } from './snapshot'

/**
 * Welche Tagesdateien es gibt und was in ihnen steht.
 *
 * Bewusst *nicht* über `tasksDueOnDate`/`isTaskDoneOnDate` aus dem taskRepository: dort gilt
 * eine einmalige Aufgabe ohne Fälligkeitsdatum an *jedem* Tag als fällig, und der Haken hängt
 * nicht am Datum. Fürs Rendern wäre das fatal - undatierte Aufgaben lägen abgehakt in jeder
 * einzelnen Tagesdatei.
 *
 * Zwei Regeln halten die Dateimenge endlich und die Vergangenheit ruhig:
 *
 * - Eine Tagesdatei existiert nur für *verankerte* Tage (datierte Aufgabe, Termin oder eine
 *   Erledigung an diesem Tag) plus das rollende Fenster ab heute.
 * - Tage vor heute sind **eingefroren**: sie zeigen nur Verankertes, keine Wiederholungspläne.
 *   Sonst würde eine einzige neue tägliche Aufgabe jede vergangene Tagesdatei umschreiben.
 */

export const HORIZON_DAYS = 13

/** Wochentag (0 = Sonntag) rein aus dem Datumsstring - ohne lokale Zeitzone. */
export function weekdayOf(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function dayOfMonthOf(dateStr: string): number {
  return Number(dateStr.slice(8, 10))
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

export function daysBetween(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number)
  const [ty, tm, td] = toDateStr.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86_400_000)
}

function lastDayOfMonth(dateStr: string): number {
  const year = Number(dateStr.slice(0, 4))
  const month = Number(dateStr.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Wie `goalCycles.isGoalDueOnDate`, aber ohne `Date`-Parsing in lokaler Zeitzone.
 * Die App-Variante ist für Datumsstrings zwar zufällig auch korrekt; hier wird es explizit,
 * weil ein Zeitzonenunterschied zwischen zwei Geräten sonst zu unterschiedlichen Bytes führt.
 */
export function isGoalDueOn(recurrence: GoalRecurrence, dateStr: string): boolean {
  if (dateStr < recurrence.anchorDate) return false
  switch (recurrence.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return recurrence.weekdays.includes(weekdayOf(dateStr))
    case 'monthly': {
      const target = Math.min(recurrence.dayOfMonth ?? 1, lastDayOfMonth(dateStr))
      return dayOfMonthOf(dateStr) === target
    }
    case 'custom': {
      const interval = recurrence.intervalDays ?? 1
      if (interval < 1) return false
      return daysBetween(recurrence.anchorDate, dateStr) % interval === 0
    }
  }
}

/**
 * `goalCycles.isRecurrenceActiveOnDate` wandelt `stoppedAt` in ein *lokales* Kalenderdatum.
 * Zwei Geräte in verschiedenen Zeitzonen kämen damit auf verschiedene Antworten und würden
 * sich gegenseitig überschreiben. Hier zählt konsequent das UTC-Datum des Zeitstempels.
 */
export function isRecurrenceActiveOn(recurrence: GoalRecurrence, dateStr: string): boolean {
  if (!recurrence.stoppedAt) return true
  return recurrence.stoppedAt.slice(0, 10) >= dateStr
}

export type DayItemKind = 'task' | 'appointment' | 'goalCycle'

export interface DayItem {
  kind: DayItemKind
  id: string
  title: string
  categoryId: string | null
  checked: boolean
  /** Termine: Startzeit; einmalige/wiederkehrende Aufgaben: die optionale `time`. */
  startTime: string | null
  endTime: string | null
  location: string | null
  /** true, wenn ein Löschen der Zeile im Repo die Entität löschen darf (siehe README). */
  deletable: boolean
}

/** Tage, für die eine Datei existiert: verankerte Tage plus das Fenster ab heute. */
export function dayFileDates(snapshot: VaultSnapshot): string[] {
  const dates = new Set<string>()

  for (const task of snapshot.tasks) {
    if (task.type === 'oneoff' && task.dueDate) dates.add(task.dueDate)
    if (task.type === 'appointment') dates.add(task.date)
  }
  for (const completion of snapshot.taskCompletions) dates.add(completion.completedDate)
  for (const completion of snapshot.goalCycleCompletions) dates.add(completion.cycleDueDate)
  for (const completion of snapshot.subStepCycleCompletions) dates.add(completion.cycleDueDate)

  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    dates.add(addDaysToDateStr(snapshot.today, offset))
  }

  return [...dates].sort()
}

/**
 * Die Einträge einer Tagesdatei.
 *
 * `dateStr < today` liefert die eingefrorene Sicht (nur Verankertes), sonst die aus dem
 * aktuellen Plan abgeleitete.
 */
export function dayItems(snapshot: VaultSnapshot, dateStr: string): DayItem[] {
  const frozen = dateStr < snapshot.today
  const completedTaskIds = new Set(
    snapshot.taskCompletions.filter((c) => c.completedDate === dateStr).map((c) => c.taskId),
  )
  const completedGoalIds = new Set(
    snapshot.goalCycleCompletions.filter((c) => c.cycleDueDate === dateStr).map((c) => c.goalId),
  )

  const items: DayItem[] = []

  for (const task of snapshot.tasks) {
    const belongsToThisDay =
      (task.type === 'oneoff' && task.dueDate === dateStr) ||
      (task.type === 'appointment' && task.date === dateStr)

    let include = belongsToThisDay
    if (!include) {
      if (frozen) {
        // Eingefroren: nur was an diesem Tag tatsächlich passiert ist.
        include = completedTaskIds.has(task.id)
      } else if (task.type === 'recurring') {
        include =
          task.frequency === 'daily' || task.weekdays.includes(weekdayOf(dateStr))
      }
      // Einmalige Aufgaben ohne Datum tauchen in keiner Tagesdatei auf - sie gehören
      // zu keinem Tag. Sie stehen in questday-data.json.
    }
    if (!include) continue

    items.push({
      kind: task.type === 'appointment' ? 'appointment' : 'task',
      id: task.id,
      title: task.title,
      categoryId: task.categoryId,
      checked: completedTaskIds.has(task.id),
      // Termine tragen die Startzeit, alle anderen die optionale Uhrzeit `time`.
      startTime: task.type === 'appointment' ? task.startTime : task.time,
      endTime: task.type === 'appointment' ? task.endTime : null,
      location: task.type === 'appointment' ? task.location : null,
      // Nur was ausschließlich zu diesem Tag gehört, darf über das Repo gelöscht werden.
      // Wiederkehrende Aufgaben sind Stammdaten - Erledigungen verweisen auf sie.
      deletable: belongsToThisDay,
    })
  }

  for (const goal of snapshot.goals) {
    if (!goal.recurrence) continue
    const include = frozen
      ? completedGoalIds.has(goal.id)
      : isRecurrenceActiveOn(goal.recurrence, dateStr) && isGoalDueOn(goal.recurrence, dateStr)
    if (!include) continue

    items.push({
      kind: 'goalCycle',
      id: goal.id,
      title: goal.title,
      categoryId: goal.categoryId,
      checked: completedGoalIds.has(goal.id),
      startTime: null,
      endTime: null,
      location: null,
      deletable: false,
    })
  }

  return items.sort((a, b) =>
    compareBy(
      [a.startTime ?? '99:99', a.title, a.id],
      [b.startTime ?? '99:99', b.title, b.id],
    ),
  )
}
