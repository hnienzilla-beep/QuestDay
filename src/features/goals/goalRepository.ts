import { db } from '../../db/db'
import type { Goal, SubStep } from '../../types/goal'
import type { Category } from '../../types/task'

function newId(): string {
  return crypto.randomUUID()
}

export async function addGoal(input: {
  title: string
  target: string
  category: Category
  targetDate: string | null
  subStepTitles: string[]
}): Promise<Goal> {
  const goal: Goal = {
    id: newId(),
    title: input.title,
    target: input.target,
    category: input.category,
    createdAt: new Date().toISOString(),
    targetDate: input.targetDate,
    completedAt: null,
  }
  await db.goals.add(goal)

  const subSteps: SubStep[] = input.subStepTitles.map((title, index) => ({
    id: newId(),
    goalId: goal.id,
    title,
    completed: false,
    completedAt: null,
    order: index,
  }))
  if (subSteps.length > 0) {
    await db.subSteps.bulkAdd(subSteps)
  }
  return goal
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
  await db.subSteps.where('goalId').equals(id).delete()
}

export async function allGoals(): Promise<Goal[]> {
  return db.goals.toArray()
}

export async function subStepsForGoal(goalId: string): Promise<SubStep[]> {
  const steps = await db.subSteps.where('goalId').equals(goalId).toArray()
  return steps.sort((a, b) => a.order - b.order)
}
