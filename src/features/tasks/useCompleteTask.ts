import { useCallback } from 'react'
import { db } from '../../db/db'
import type { Task } from '../../types/task'
import type { SubStep } from '../../types/goal'
import { todayISODate } from '../../utils/dateUtils'
import { triggerAutoSync } from '../obsidianSync/syncScheduler'
import { completeTaskOnDate, uncompleteTaskOnDate } from './taskCompletion'

export function useCompleteTask() {
  /** Für einen beliebigen Tag - trägt Vergangenes nach und hakt Künftiges vorab ab. */
  const completeTaskOn = useCallback(async (task: Task, dateStr: string): Promise<void> => {
    await completeTaskOnDate(task, dateStr)
    triggerAutoSync()
  }, [])

  const uncompleteTaskOn = useCallback(async (task: Task, dateStr: string): Promise<void> => {
    await uncompleteTaskOnDate(task, dateStr)
    triggerAutoSync()
  }, [])

  const completeTask = useCallback(
    (task: Task) => completeTaskOn(task, todayISODate()),
    [completeTaskOn],
  )

  const uncompleteTask = useCallback(
    (task: Task) => uncompleteTaskOn(task, todayISODate()),
    [uncompleteTaskOn],
  )

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

  return { completeTask, uncompleteTask, completeTaskOn, uncompleteTaskOn, completeSubStep, uncompleteSubStep }
}
