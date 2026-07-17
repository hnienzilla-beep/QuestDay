import { db } from '../../db/db'
import type { AggregatedStats } from '../../types/gamification'

export async function computeAggregatedStats(): Promise<AggregatedStats> {
  const [completions, goals, stats] = await Promise.all([
    db.taskCompletions.toArray(),
    db.goals.toArray(),
    db.userStats.get('singleton'),
  ])

  const tasksCompleted = completions.filter((c) => c.taskType !== 'appointment').length
  const appointmentsAttended = completions.filter((c) => c.taskType === 'appointment').length
  const goalsCompleted = goals.filter((g) => g.completedAt !== null).length

  return {
    tasksCompleted,
    appointmentsAttended,
    goalsCompleted,
    currentStreak: stats?.currentStreak ?? 0,
    longestStreak: stats?.longestStreak ?? 0,
    level: stats?.level ?? 1,
    xpTotal: stats?.xpTotal ?? 0,
  }
}
