import type { GoalRecurrence, RecurrenceFrequency } from '../../types/goal'
import type { RecurringTask } from '../../types/task'

/**
 * Wiederholungen als ein einziges, lesbares Token:
 *
 *     keine | täglich | wöchentlich:1,3,5 | monatlich:15 | alle-3-tage
 *
 * (0 = Sonntag ... 6 = Samstag - dieselbe Zählung wie im Rest der App. Mehrere Wochentage
 * werden aufsteigend und dedupliziert geschrieben, damit das Token deterministisch bleibt.)
 *
 * Bewusst ein Token statt mehrerer Frontmatter-Felder: so kann eine Wiederholung nicht in
 * einen halb ausgefüllten Zustand geraten, wenn jemand in Obsidian nur eines der Felder ändert.
 */

export interface ParsedRecurrence {
  frequency: RecurrenceFrequency
  weekdays: number[]
  dayOfMonth: number | null
  intervalDays: number | null
}

export const RECURRENCE_NONE = 'keine'

function normalizeWeekdays(weekdays: readonly number[]): number[] {
  return [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
}

export function renderRecurrenceToken(
  recurrence: Pick<ParsedRecurrence, 'frequency' | 'weekdays' | 'dayOfMonth' | 'intervalDays'> | null,
): string {
  if (!recurrence) return RECURRENCE_NONE
  switch (recurrence.frequency) {
    case 'daily':
      return 'täglich'
    case 'weekly': {
      const days = normalizeWeekdays(recurrence.weekdays)
      return `wöchentlich:${days.length > 0 ? days.join(',') : '1'}`
    }
    case 'monthly':
      return `monatlich:${recurrence.dayOfMonth ?? 1}`
    case 'custom':
      return `alle-${recurrence.intervalDays ?? 1}-tage`
  }
}

export function renderGoalRecurrenceToken(recurrence: GoalRecurrence | null): string {
  return renderRecurrenceToken(recurrence)
}

export function renderTaskRecurrenceToken(task: RecurringTask): string {
  if (task.frequency === 'daily') return 'täglich'
  const days = normalizeWeekdays(task.weekdays)
  return `wöchentlich:${days.length > 0 ? days.join(',') : '1'}`
}

/**
 * `undefined` = unlesbares Token (das Parse-Gate schlägt an), `null` = ausdrücklich "keine".
 */
export function parseRecurrenceToken(raw: string): ParsedRecurrence | null | undefined {
  const token = raw.trim().toLowerCase()
  if (!token || token === RECURRENCE_NONE || token === 'null' || token === 'nein') return null
  if (token === 'täglich') {
    return { frequency: 'daily', weekdays: [], dayOfMonth: null, intervalDays: null }
  }

  const weekly = /^wöchentlich:([0-6](?:\s*,\s*[0-6])*)$/.exec(token)
  if (weekly) {
    const weekdays = normalizeWeekdays(weekly[1].split(',').map((part) => Number(part.trim())))
    if (weekdays.length === 0) return undefined
    return { frequency: 'weekly', weekdays, dayOfMonth: null, intervalDays: null }
  }

  const monthly = /^monatlich:([1-9]|[12]\d|3[01])$/.exec(token)
  if (monthly) {
    return {
      frequency: 'monthly',
      weekdays: [],
      dayOfMonth: Number(monthly[1]),
      intervalDays: null,
    }
  }

  const custom = /^alle-(\d+)-tage$/.exec(token)
  if (custom) {
    const intervalDays = Number(custom[1])
    if (intervalDays < 1) return undefined
    return { frequency: 'custom', weekdays: [], dayOfMonth: null, intervalDays }
  }

  return undefined
}

/** Für `Aufgaben.md`: dort sind nur `täglich` und `wöchentlich:N,…` gültig. */
export function parseTaskRecurrenceToken(
  raw: string,
): { frequency: 'daily' | 'weekly'; weekdays: number[] } | undefined {
  const parsed = parseRecurrenceToken(raw)
  if (!parsed) return undefined
  if (parsed.frequency === 'daily') return { frequency: 'daily', weekdays: [] }
  if (parsed.frequency === 'weekly') return { frequency: 'weekly', weekdays: parsed.weekdays }
  return undefined
}
