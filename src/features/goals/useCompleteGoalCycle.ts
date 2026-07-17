import { useCallback } from 'react'
import { db } from '../../db/db'
import type { Goal, SubStep } from '../../types/goal'
import type { UnlockedBadge } from '../../types/gamification'
import { xpForSubStep } from '../gamification/xp'
import { awardXp } from '../gamification/awardXp'
import { evaluateBadges } from '../gamification/badges'
import type { CompletionResult } from '../tasks/useCompleteTask'

export function useCompleteGoalCycle() {
  const completeCycleSubStep = useCallback(
    async (
      subStep: SubStep,
      goal: Goal,
      cycleDueDate: string,
      subStepCount: number,
      isLastStepOfCycle: boolean,
    ): Promise<CompletionResult> => {
      const now = new Date().toISOString()
      const xp = xpForSubStep(isLastStepOfCycle)

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
          category: goal.category,
          cycleDueDate,
          completedAt: now,
          xpAwarded: subStepCount * 5 + 20,
        })
      }

      await awardXp(xp)
      const newlyUnlockedBadges: UnlockedBadge[] = await evaluateBadges()
      return { xpAwarded: xp, newlyUnlockedBadges }
    },
    [],
  )

  return { completeCycleSubStep }
}
