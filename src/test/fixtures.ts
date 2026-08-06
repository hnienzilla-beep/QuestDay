import type { Task, TaskCompletion } from '../types/task'
import type { Goal, SubStep, GoalCycleCompletion, SubStepCycleCompletion } from '../types/goal'
import type { Category } from '../types/category'
import type { VaultSnapshot } from '../features/obsidianSync/model/snapshot'

export const TODAY = '2026-08-06'
/** 2026-08-06 ist ein Donnerstag. */
export const TODAY_WEEKDAY = 4

export const CAT_ARBEIT: Category = {
  id: 'cat-arbeit',
  name: 'Arbeit',
  color: '#2a78d6',
  createdAt: '2026-07-01T08:00:00.000Z',
}

export const CAT_HAUSHALT: Category = {
  id: 'cat-haushalt',
  name: 'Haushalt',
  color: '#eda100',
  createdAt: '2026-07-01T08:00:00.000Z',
}

export const CATEGORIES = [CAT_ARBEIT, CAT_HAUSHALT]

export function oneOff(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    type: 'oneoff',
    categoryId: CAT_HAUSHALT.id,
    createdAt: '2026-08-01T09:00:00.000Z',
    completed: false,
    completedAt: null,
    reminderTime: null,
    reminderFired: false,
    dueDate: TODAY,
    time: null,
    ...overrides,
  } as Task
}

export function recurring(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    type: 'recurring',
    categoryId: CAT_ARBEIT.id,
    createdAt: '2026-08-01T09:00:00.000Z',
    completed: false,
    completedAt: null,
    reminderTime: null,
    reminderFired: false,
    frequency: 'daily',
    weekdays: [],
    time: null,
    ...overrides,
  } as Task
}

export function appointment(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    type: 'appointment',
    categoryId: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    completed: false,
    completedAt: null,
    reminderTime: null,
    reminderFired: false,
    date: TODAY,
    startTime: '14:00',
    endTime: '15:00',
    location: null,
    ...overrides,
  } as Task
}

export function goal(overrides: Partial<Goal> & { id: string; title: string }): Goal {
  return {
    target: 'Zieltext',
    categoryId: null,
    createdAt: '2026-07-01T08:00:00.000Z',
    targetDate: null,
    completedAt: null,
    recurrence: null,
    ...overrides,
  } as Goal
}

export function subStep(
  overrides: Partial<SubStep> & { id: string; goalId: string; title: string },
): SubStep {
  return { completed: false, completedAt: null, order: 0, ...overrides }
}

export function completion(
  overrides: Partial<TaskCompletion> & { id: string; taskId: string; completedDate: string },
): TaskCompletion {
  return {
    taskType: 'oneoff',
    categoryId: CAT_HAUSHALT.id,
    completedAt: `${overrides.completedDate}T12:00:00.000Z`,
    ...overrides,
  }
}

export interface SnapshotParts {
  today?: string
  tasks?: Task[]
  taskCompletions?: TaskCompletion[]
  goals?: Goal[]
  subSteps?: SubStep[]
  goalCycleCompletions?: GoalCycleCompletion[]
  subStepCycleCompletions?: SubStepCycleCompletion[]
  categories?: Category[]
}

/**
 * Baut einen Snapshot *ohne* die Sortierung aus `loadSnapshot` - die Tests reichen absichtlich
 * unsortierte Listen herein, um zu zeigen, dass die Renderer selbst sortieren.
 */
export function snapshotOf(parts: SnapshotParts): VaultSnapshot {
  return {
    today: parts.today ?? TODAY,
    tasks: parts.tasks ?? [],
    taskCompletions: parts.taskCompletions ?? [],
    goals: parts.goals ?? [],
    subSteps: parts.subSteps ?? [],
    goalCycleCompletions: parts.goalCycleCompletions ?? [],
    subStepCycleCompletions: parts.subStepCycleCompletions ?? [],
    categories: parts.categories ?? CATEGORIES,
  }
}
