import { db } from '../../db/db'
import type { Goal, SubStep, GoalRecurrence, RecurrenceFrequency } from '../../types/goal'
import type { Category } from '../../types/task'
import { isGoalDueOnDate, mostRecentDueDateOnOrBefore, isRecurrenceActiveOnDate } from './goalCycles'
import { todayISODate } from '../../utils/dateUtils'

function newId(): string {
  return crypto.randomUUID()
}

export interface RecurrenceInput {
  frequency: RecurrenceFrequency
  weekday: number | null
  dayOfMonth: number | null
  intervalDays: number | null
  reminderTime: string | null
}

function buildRecurrence(input: RecurrenceInput | null, anchorDate: string): GoalRecurrence | null {
  if (!input) return null
  return {
    frequency: input.frequency,
    weekday: input.frequency === 'weekly' ? input.weekday : null,
    dayOfMonth: input.frequency === 'monthly' ? input.dayOfMonth : null,
    intervalDays: input.frequency === 'custom' ? input.intervalDays : null,
    anchorDate,
    reminderTime: input.reminderTime,
    lastReminderFiredDate: null,
    stoppedAt: null,
  }
}

export async function addGoal(input: {
  title: string
  target: string
  category: Category
  targetDate: string | null
  subStepTitles: string[]
  recurrence: RecurrenceInput | null
}): Promise<Goal> {
  const goal: Goal = {
    id: newId(),
    title: input.title,
    target: input.target,
    category: input.category,
    createdAt: new Date().toISOString(),
    targetDate: input.targetDate,
    completedAt: null,
    recurrence: buildRecurrence(input.recurrence, todayISODate()),
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

export interface GoalUpdateInput {
  title: string
  target: string
  category: Category
  targetDate: string | null
  recurrence: RecurrenceInput | null
}

export interface SubStepChanges {
  updated: { id: string; title: string }[]
  added: string[]
  removedIds: string[]
}

export async function updateGoal(id: string, patch: GoalUpdateInput, subStepChanges: SubStepChanges): Promise<void> {
  const existing = await db.goals.get(id)
  if (!existing) return

  const anchorDate = existing.recurrence?.anchorDate ?? todayISODate()
  const recurrence = buildRecurrence(patch.recurrence, anchorDate)
  // Bereits gesammelte Erinnerungs-/Stopp-Historie beim Wechsel innerhalb "wiederkehrend" bewahren.
  if (recurrence && existing.recurrence) {
    recurrence.lastReminderFiredDate = existing.recurrence.lastReminderFiredDate
    recurrence.stoppedAt = existing.recurrence.stoppedAt
  }

  await db.goals.update(id, {
    title: patch.title,
    target: patch.target,
    category: patch.category,
    targetDate: patch.targetDate,
    recurrence,
  })

  await Promise.all(subStepChanges.updated.map((s) => db.subSteps.update(s.id, { title: s.title })))

  if (subStepChanges.added.length > 0) {
    const currentSteps = await db.subSteps.where('goalId').equals(id).toArray()
    const nextOrder = currentSteps.reduce((max, s) => Math.max(max, s.order), -1) + 1
    const newSteps: SubStep[] = subStepChanges.added.map((title, i) => ({
      id: newId(),
      goalId: id,
      title,
      completed: false,
      completedAt: null,
      order: nextOrder + i,
    }))
    await db.subSteps.bulkAdd(newSteps)
  }

  if (subStepChanges.removedIds.length > 0) {
    await db.subSteps.bulkDelete(subStepChanges.removedIds)
    await db.subStepCycleCompletions.where('subStepId').anyOf(subStepChanges.removedIds).delete()
  }

  if (recurrence === null) {
    const remainingSteps = await db.subSteps.where('goalId').equals(id).toArray()
    const allDone = remainingSteps.length > 0 && remainingSteps.every((s) => s.completed)
    await db.goals.update(id, {
      completedAt: allDone ? (existing.completedAt ?? new Date().toISOString()) : null,
    })
  }
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
  await db.subSteps.where('goalId').equals(id).delete()
  await db.goalCycleCompletions.where('goalId').equals(id).delete()
  await db.subStepCycleCompletions.where('goalId').equals(id).delete()
}

export async function allGoals(): Promise<Goal[]> {
  return db.goals.toArray()
}

export async function subStepsForGoal(goalId: string): Promise<SubStep[]> {
  const steps = await db.subSteps.where('goalId').equals(goalId).toArray()
  return steps.sort((a, b) => a.order - b.order)
}

export async function goalsDueOnDate(dateStr: string): Promise<Goal[]> {
  const all = await db.goals.toArray()
  return all.filter(
    (g) => g.recurrence !== null && isRecurrenceActiveOnDate(g.recurrence, dateStr) && isGoalDueOnDate(g.recurrence, dateStr),
  )
}

export async function isGoalCycleDoneOnDate(goalId: string, dateStr: string): Promise<boolean> {
  const entry = await db.goalCycleCompletions.where('[goalId+cycleDueDate]').equals([goalId, dateStr]).first()
  return entry !== undefined
}

export interface CycleStatus {
  cycleDueDate: string | null
  isComplete: boolean
  isMissed: boolean
  completionCount: number
}

/** Zentrale "Status des aktuellen Zyklus"-Abfrage, genutzt von GoalCard. Vollständig
 * abgeleitet - kein gespeicherter Zyklus-Zeiger, siehe Plan-Dokumentation. */
export async function currentCycleStatus(goal: Goal): Promise<CycleStatus | null> {
  if (!goal.recurrence) return null
  const today = todayISODate()
  const cycleDueDate = mostRecentDueDateOnOrBefore(goal.recurrence, today)
  if (!cycleDueDate) return { cycleDueDate: null, isComplete: false, isMissed: false, completionCount: 0 }

  const [completion, completionCount] = await Promise.all([
    db.goalCycleCompletions.where('[goalId+cycleDueDate]').equals([goal.id, cycleDueDate]).first(),
    db.goalCycleCompletions.where('goalId').equals(goal.id).count(),
  ])
  const isComplete = completion !== undefined
  const isMissed = cycleDueDate < today && !isComplete
  return { cycleDueDate, isComplete, isMissed, completionCount }
}

export async function stopGoalRecurrence(goalId: string): Promise<void> {
  const goal = await db.goals.get(goalId)
  if (!goal?.recurrence || goal.recurrence.stoppedAt) return
  await db.goals.update(goalId, { recurrence: { ...goal.recurrence, stoppedAt: new Date().toISOString() } })
}
