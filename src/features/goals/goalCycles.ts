import { getDay, getDate, differenceInCalendarDays, lastDayOfMonth, subDays, isBefore } from 'date-fns'
import type { GoalRecurrence } from '../../types/goal'
import { parseISO, isoDateOf } from '../../utils/dateUtils'

function effectiveMonthlyDay(dateStr: string, dayOfMonth: number): number {
  const lastDay = getDate(lastDayOfMonth(parseISO(dateStr)))
  return Math.min(dayOfMonth, lastDay)
}

export function isGoalDueOnDate(recurrence: GoalRecurrence, dateStr: string): boolean {
  if (dateStr < recurrence.anchorDate) return false
  switch (recurrence.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return getDay(parseISO(dateStr)) === recurrence.weekday
    case 'monthly':
      return getDate(parseISO(dateStr)) === effectiveMonthlyDay(dateStr, recurrence.dayOfMonth!)
    case 'custom': {
      const diff = differenceInCalendarDays(parseISO(dateStr), parseISO(recurrence.anchorDate))
      return diff % recurrence.intervalDays! === 0
    }
  }
}

/**
 * Letztes fälliges Datum <= referenceDateStr, oder null wenn die Wiederholung noch
 * nicht begonnen hat. Begrenzter Rückwärts-Scan (max. 31 Tage bzw. intervalDays).
 */
export function mostRecentDueDateOnOrBefore(
  recurrence: GoalRecurrence,
  referenceDateStr: string,
): string | null {
  if (referenceDateStr < recurrence.anchorDate) return null
  let cursor = parseISO(referenceDateStr)
  const anchor = parseISO(recurrence.anchorDate)
  const maxScan = recurrence.frequency === 'custom' ? recurrence.intervalDays! : 31

  for (let i = 0; i <= maxScan; i++) {
    const dateStr = isoDateOf(cursor)
    if (isGoalDueOnDate(recurrence, dateStr)) return dateStr
    if (!isBefore(anchor, cursor)) break
    cursor = subDays(cursor, 1)
  }
  return null
}

export function isRecurrenceActiveOnDate(recurrence: GoalRecurrence, dateStr: string): boolean {
  if (!recurrence.stoppedAt) return true
  return isoDateOf(parseISO(recurrence.stoppedAt)) >= dateStr
}
