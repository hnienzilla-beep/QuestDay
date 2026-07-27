import { useCallback } from 'react'
import { db } from '../../db/db'
import type { Goal, SubStep } from '../../types/goal'
import { triggerAutoSync } from '../obsidianSync/autoSync'

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

      await db.subStepCycleCompletions.add({
        id: crypto.randomUUID(),
        subStepId: subStep.id,
        goalId: goal.id,
        cycleDueDate,
        completedAt: now,
      })

      if (isLastStepOfCycle) {
        await db.goalCycleCompletions.add({
          id: crypto.randomUUID(),
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

  return { completeCycleSubStep }
}
