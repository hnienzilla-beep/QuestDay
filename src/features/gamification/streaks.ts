import { addDays, isBefore, parseISO, startOfDay, format } from 'date-fns'
import { db } from '../../db/db'
import { isoDateOf } from '../../utils/dateUtils'
import { isGoalDueOnDate, isRecurrenceActiveOnDate } from '../goals/goalCycles'

/**
 * Ein Tag zählt als Streak-Tag, wenn alle an diesem Tag fälligen Aufgaben/Termine/
 * wiederholenden Ziel-Zyklen erledigt wurden. Gibt es an diesem Tag nichts Fälliges,
 * zählt er automatisch als erfüllt. Einmalige Ziele fließen bewusst nicht ein (kein
 * festes Tagesdatum) - nur wiederholende Ziel-Zyklen mit Fälligkeitsdatum zählen.
 */
export async function wasDayFullyComplete(date: Date): Promise<boolean> {
  const dateStr = isoDateOf(date)
  const weekday = date.getDay()

  const [oneOffDue, recurringDue, appointmentsDue, allGoals] = await Promise.all([
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
    db.goals.toArray(),
  ])

  const dueGoals = allGoals.filter(
    (g) => g.recurrence !== null && isRecurrenceActiveOnDate(g.recurrence, dateStr) && isGoalDueOnDate(g.recurrence, dateStr),
  )

  const dueTaskIds = [...oneOffDue, ...recurringDue, ...appointmentsDue].map((t) => t.id)
  const dueGoalIds = dueGoals.map((g) => g.id)
  if (dueTaskIds.length === 0 && dueGoalIds.length === 0) return true

  const [taskCompletions, goalCompletions] = await Promise.all([
    db.taskCompletions.where('completedDate').equals(dateStr).toArray(),
    db.goalCycleCompletions.where('cycleDueDate').equals(dateStr).toArray(),
  ])
  const completedTaskIds = new Set(taskCompletions.map((c) => c.taskId))
  const completedGoalIds = new Set(goalCompletions.map((c) => c.goalId))

  return (
    dueTaskIds.every((id) => completedTaskIds.has(id)) && dueGoalIds.every((id) => completedGoalIds.has(id))
  )
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
