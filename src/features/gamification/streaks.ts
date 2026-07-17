import { addDays, isBefore, parseISO, startOfDay, format } from 'date-fns'
import { db } from '../../db/db'
import { isoDateOf } from '../../utils/dateUtils'

/**
 * Ein Tag zählt als Streak-Tag, wenn alle an diesem Tag fälligen Aufgaben/Termine
 * erledigt wurden. Gibt es an diesem Tag nichts Fälliges, zählt er automatisch als erfüllt.
 * Goals fließen bewusst nicht ein (kein festes Tagesdatum).
 */
export async function wasDayFullyComplete(date: Date): Promise<boolean> {
  const dateStr = isoDateOf(date)
  const weekday = date.getDay()

  const [oneOffDue, recurringDue, appointmentsDue] = await Promise.all([
    db.tasks.where('type').equals('oneoff').and((t) => 'dueDate' in t && t.dueDate === dateStr).toArray(),
    db.tasks
      .where('type')
      .equals('recurring')
      .and(
        (t) =>
          'frequency' in t &&
          (t.frequency === 'daily' || ('weekday' in t && t.weekday === weekday)),
      )
      .toArray(),
    db.tasks.where('type').equals('appointment').and((t) => 'date' in t && t.date === dateStr).toArray(),
  ])

  const dueTaskIds = [...oneOffDue, ...recurringDue, ...appointmentsDue].map((t) => t.id)
  if (dueTaskIds.length === 0) return true

  const completions = await db.taskCompletions.where('completedDate').equals(dateStr).toArray()
  const completedTaskIds = new Set(completions.map((c) => c.taskId))

  return dueTaskIds.every((id) => completedTaskIds.has(id))
}

export async function evaluateStreakOnAppOpen(): Promise<void> {
  const stats = await db.userStats.get('singleton')
  if (!stats) return

  const lastChecked = startOfDay(parseISO(stats.lastStreakCheckDate))
  const today = startOfDay(new Date())

  let cursor = addDays(lastChecked, 1)
  let currentStreak = stats.currentStreak
  let longestStreak = stats.longestStreak

  while (isBefore(cursor, today)) {
    const dayComplete = await wasDayFullyComplete(cursor)
    if (dayComplete) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
    cursor = addDays(cursor, 1)
  }

  await db.userStats.put({
    ...stats,
    currentStreak,
    longestStreak,
    lastStreakCheckDate: format(today, 'yyyy-MM-dd'),
  })
}
