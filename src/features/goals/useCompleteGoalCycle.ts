import { useCallback } from 'react'
import { db } from '../../db/db'
import type { Goal, SubStep } from '../../types/goal'
import { triggerAutoSync } from '../obsidianSync/syncScheduler'
import { goalCycleIdFor, subStepCycleIdFor } from '../obsidianSync/import/ids'

export function useCompleteGoalCycle() {
  const completeCycleSubStep = useCallback(
    async (
      subStep: SubStep,
      goal: Goal,
      cycleDueDate: string,
      _subStepCount: number,
      isLastStepOfCycle: boolean,
    ): Promise<void> => {
      const now = new Date().toISOString()

      // Abgeleitete IDs: zwei Geräte erzeugen für denselben Zyklus denselben Datensatz.
      await db.subStepCycleCompletions.put({
        id: subStepCycleIdFor(subStep.id, cycleDueDate),
        subStepId: subStep.id,
        goalId: goal.id,
        cycleDueDate,
        completedAt: now,
      })

      if (isLastStepOfCycle) {
        await db.goalCycleCompletions.put({
          id: goalCycleIdFor(goal.id, cycleDueDate),
          goalId: goal.id,
          categoryId: goal.categoryId,
          cycleDueDate,
          completedAt: now,
        })
      }

      triggerAutoSync()
    },
    [],
  )

  const uncompleteCycleSubStep = useCallback(
    async (subStep: SubStep, goal: Goal, cycleDueDate: string): Promise<void> => {
      await db.subStepCycleCompletions
        .where('subStepId')
        .equals(subStep.id)
        .and((r) => r.cycleDueDate === cycleDueDate)
        .delete()
      // Falls der Zyklus als abgeschlossen markiert war, diese Markierung entfernen.
      await db.goalCycleCompletions.where('[goalId+cycleDueDate]').equals([goal.id, cycleDueDate]).delete()
      triggerAutoSync()
    },
    [],
  )

  return { completeCycleSubStep, uncompleteCycleSubStep }
}
