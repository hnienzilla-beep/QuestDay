import { useCallback } from 'react'
import { db } from '../../db/db'
import type { Task } from '../../types/task'
import type { SubStep } from '../../types/goal'
import { todayISODate } from '../../utils/dateUtils'
import { triggerAutoSync } from '../obsidianSync/autoSync'

export function useCompleteTask() {
  const completeTask = useCallback(async (task: Task): Promise<void> => {
    const now = new Date()

    await db.taskCompletions.add({
      id: crypto.randomUUID(),
      taskId: task.id,
      taskType: task.type,
      categoryId: task.categoryId,
      completedDate: todayISODate(),
      completedAt: now.toISOString(),
    })

    if (task.type !== 'recurring') {
      await db.tasks.update(task.id, { completed: true, completedAt: now.toISOString() })
    }

    triggerAutoSync()
  }, [])

  const uncompleteTask = useCallback(async (task: Task): Promise<void> => {
    const todayStr = todayISODate()
    const entry = await db.taskCompletions
      .where('taskId')
      .equals(task.id)
      .and((c) => c.completedDate === todayStr)
      .first()
    if (!entry) return

    await db.taskCompletions.delete(entry.id)
    if (task.type !== 'recurring') {
      await db.tasks.update(task.id, { completed: false, completedAt: null })
    }
    triggerAutoSync()
  }, [])

  const completeSubStep = useCallback(async (subStep: SubStep, isLastStep: boolean): Promise<void> => {
    await db.subSteps.update(subStep.id, {
      completed: true,
      completedAt: new Date().toISOString(),
    })
    if (isLastStep) {
      await db.goals.update(subStep.goalId, { completedAt: new Date().toISOString() })
    }
    triggerAutoSync()
  }, [])

  const uncompleteSubStep = useCallback(async (subStep: SubStep): Promise<void> => {
    await db.subSteps.update(subStep.id, { completed: false, completedAt: null })
    // Ziel ist nicht mehr abgeschlossen, wenn ein Teilschritt wieder offen ist.
    await db.goals.update(subStep.goalId, { completedAt: null })
    triggerAutoSync()
  }, [])

  return { completeTask, uncompleteTask, completeSubStep, uncompleteSubStep }
}
