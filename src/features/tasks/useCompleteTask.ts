import { useCallback } from 'react'
import { db } from '../../db/db'
import type { Task } from '../../types/task'
import type { SubStep } from '../../types/goal'
import type { UnlockedBadge } from '../../types/gamification'
import { xpForOneOff, xpForRecurring, xpForAppointment, xpForSubStep } from '../gamification/xp'
import { levelFromTotalXp } from '../gamification/level'
import { evaluateBadges } from '../gamification/badges'
import { todayISODate } from '../../utils/dateUtils'

export interface CompletionResult {
  xpAwarded: number
  newlyUnlockedBadges: UnlockedBadge[]
}

async function awardXp(delta: number) {
  const stats = await db.userStats.get('singleton')
  if (!stats) return
  const xpTotal = Math.max(0, stats.xpTotal + delta)
  const { level } = levelFromTotalXp(xpTotal)
  await db.userStats.put({ ...stats, xpTotal, level })
}

export function useCompleteTask() {
  const completeTask = useCallback(async (task: Task): Promise<CompletionResult> => {
    const now = new Date()
    let xp = 0
    if (task.type === 'oneoff') xp = xpForOneOff(task, now)
    else if (task.type === 'recurring') xp = xpForRecurring(task, now)
    else xp = xpForAppointment(task, now)

    await db.taskCompletions.add({
      id: crypto.randomUUID(),
      taskId: task.id,
      taskType: task.type,
      category: task.category,
      completedDate: todayISODate(),
      completedAt: now.toISOString(),
      xpAwarded: xp,
    })

    if (task.type !== 'recurring') {
      await db.tasks.update(task.id, { completed: true, completedAt: now.toISOString() })
    }

    await awardXp(xp)
    const newlyUnlockedBadges = await evaluateBadges()
    return { xpAwarded: xp, newlyUnlockedBadges }
  }, [])

  const uncompleteTask = useCallback(async (task: Task) => {
    const todayStr = todayISODate()
    const entry = await db.taskCompletions
      .where('taskId')
      .equals(task.id)
      .and((c) => c.completedDate === todayStr)
      .first()
    if (!entry) return

    await db.taskCompletions.delete(entry.id)
    await awardXp(-entry.xpAwarded)
    if (task.type !== 'recurring') {
      await db.tasks.update(task.id, { completed: false, completedAt: null })
    }
  }, [])

  const completeSubStep = useCallback(
    async (subStep: SubStep, isLastStep: boolean): Promise<CompletionResult> => {
      const xp = xpForSubStep(isLastStep)
      await db.subSteps.update(subStep.id, {
        completed: true,
        completedAt: new Date().toISOString(),
      })
      if (isLastStep) {
        await db.goals.update(subStep.goalId, { completedAt: new Date().toISOString() })
      }
      await awardXp(xp)
      const newlyUnlockedBadges = await evaluateBadges()
      return { xpAwarded: xp, newlyUnlockedBadges }
    },
    [],
  )

  return { completeTask, uncompleteTask, completeSubStep }
}
