import { db } from '../../../db/db'
import type { Task, TaskCompletion } from '../../../types/task'
import type { Goal, SubStep, GoalCycleCompletion, SubStepCycleCompletion } from '../../../types/goal'
import type { Category } from '../../../types/category'
import { compareBy } from '../canonical'

/**
 * Ein vollständiger, kanonisch sortierter Abzug der Datenbank.
 *
 * Die Renderer arbeiten ausschließlich hierauf: keine Dexie-Zugriffe, keine Uhr, keine
 * Zeitzone. Alles, was den gerenderten Bytes eine Reihenfolge gibt, wird genau hier
 * festgelegt - `toArray()` liefert nach Primärschlüssel sortiert, und die Primärschlüssel
 * sind zufällige UUIDs.
 */
export interface VaultSnapshot {
  today: string
  tasks: readonly Task[]
  taskCompletions: readonly TaskCompletion[]
  goals: readonly Goal[]
  subSteps: readonly SubStep[]
  goalCycleCompletions: readonly GoalCycleCompletion[]
  subStepCycleCompletions: readonly SubStepCycleCompletion[]
  categories: readonly Category[]
}

function sorted<T>(items: readonly T[], key: (item: T) => string[]): T[] {
  return [...items].sort((a, b) => compareBy(key(a), key(b)))
}

/**
 * Legt die kanonische Reihenfolge fest. Die Renderer rufen das selbst auf, statt sich darauf
 * zu verlassen, dass der Snapshot schon sortiert ankommt - so kann die Garantie nicht durch
 * einen neuen Aufrufer verloren gehen.
 */
export function canonicalizeSnapshot(snapshot: VaultSnapshot): VaultSnapshot {
  return {
    today: snapshot.today,
    tasks: sorted(snapshot.tasks, (t) => [t.title, t.id]),
    taskCompletions: sorted(snapshot.taskCompletions, (c) => [c.completedDate, c.taskId, c.id]),
    goals: sorted(snapshot.goals, (g) => [g.title, g.id]),
    subSteps: sorted(snapshot.subSteps, (s) => [s.goalId, String(s.order).padStart(6, '0'), s.id]),
    goalCycleCompletions: sorted(snapshot.goalCycleCompletions, (c) => [
      c.cycleDueDate,
      c.goalId,
      c.id,
    ]),
    subStepCycleCompletions: sorted(snapshot.subStepCycleCompletions, (c) => [
      c.cycleDueDate,
      c.goalId,
      c.subStepId,
      c.id,
    ]),
    categories: sorted(snapshot.categories, (c) => [c.name, c.id]),
  }
}

export async function loadSnapshot(today: string): Promise<VaultSnapshot> {
  const [
    tasks,
    taskCompletions,
    goals,
    subSteps,
    goalCycleCompletions,
    subStepCycleCompletions,
    categories,
  ] = await Promise.all([
    db.tasks.toArray(),
    db.taskCompletions.toArray(),
    db.goals.toArray(),
    db.subSteps.toArray(),
    db.goalCycleCompletions.toArray(),
    db.subStepCycleCompletions.toArray(),
    db.categories.toArray(),
  ])

  return canonicalizeSnapshot({
    today,
    tasks,
    taskCompletions,
    goals,
    subSteps,
    goalCycleCompletions,
    subStepCycleCompletions,
    categories,
  })
}

/** Index-Hilfen, die praktisch jeder Renderer und Importer braucht. */
export function subStepsOfGoal(snapshot: VaultSnapshot, goalId: string): SubStep[] {
  return snapshot.subSteps.filter((s) => s.goalId === goalId)
}

export function taskById(snapshot: VaultSnapshot): Map<string, Task> {
  return new Map(snapshot.tasks.map((t) => [t.id, t]))
}

export function goalById(snapshot: VaultSnapshot): Map<string, Goal> {
  return new Map(snapshot.goals.map((g) => [g.id, g]))
}

/** Kategoriename für die Anzeige in einer Markdown-Zeile; `null` = keine Kategorie. */
export function categoryNameOf(snapshot: VaultSnapshot, categoryId: string | null): string | null {
  if (!categoryId) return null
  return snapshot.categories.find((c) => c.id === categoryId)?.name ?? null
}
