import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Goal } from '../../types/goal'
import { currentCycleStatus } from './goalRepository'

export interface GoalProgress {
  total: number
  done: number
  percent: number
  isRecurring: boolean
  isMissed: boolean
}

/** Berechnet den Fortschritt eines Ziels (einmalig oder aktueller Zyklus). */
export function useGoalProgress(goal: Goal): GoalProgress | undefined {
  return useLiveQuery(async () => {
    const steps = await db.subSteps.where('goalId').equals(goal.id).toArray()
    const total = steps.length

    if (goal.recurrence === null) {
      const done = steps.filter((s) => s.completed).length
      return { total, done, percent: total ? (done / total) * 100 : 0, isRecurring: false, isMissed: false }
    }

    const status = await currentCycleStatus(goal)
    let done = 0
    if (status?.cycleDueDate) {
      const rows = await db.subStepCycleCompletions
        .where('[goalId+cycleDueDate]')
        .equals([goal.id, status.cycleDueDate])
        .toArray()
      const doneIds = new Set(rows.map((r) => r.subStepId))
      done = steps.filter((s) => doneIds.has(s.id)).length
    }
    return {
      total,
      done,
      percent: total ? (done / total) * 100 : 0,
      isRecurring: true,
      isMissed: status?.isMissed ?? false,
    }
  }, [goal.id, JSON.stringify(goal.recurrence)])
}
