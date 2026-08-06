import type { Table } from 'dexie'
import { db } from '../../../db/db'
import type { Task, TaskCompletion } from '../../../types/task'
import type { Goal, SubStep, GoalCycleCompletion, SubStepCycleCompletion } from '../../../types/goal'
import type { Category } from '../../../types/category'
import type { ParseResult } from '../parse/parseFiles'
import { emptyOutcome, type ImportOutcome } from './applyFiles'
import { SCHEMA_VERSION } from '../render/renderDataJson'

/**
 * `questday-data.json` ist für ein neues Gerät gedacht.
 *
 * Im laufenden Betrieb schreibt die App die Datei nur - importiert wird sie nie. Damit fällt
 * die ganze Konfliktklasse "JSON gegen Markdown" weg. Zwei Ausnahmen:
 *
 * - **Bootstrap** (lokale Datenbank leer): vollständiger Import, danach legt sich das
 *   Markdown desselben Laufs obendrauf - es ist die zuletzt von Hand editierte Ebene.
 * - **Additiv**: die JSON trägt Felder, die in keinem Markdown stehen (Erinnerungszeiten
 *   einmaliger Aufgaben, Endzeiten von Terminen, Zyklus-Teilschritte). Fehlt eine ID lokal,
 *   wird sie angelegt - nie geändert, nie gelöscht. Additiv ist konvergent und braucht
 *   keinen Konfliktpfad.
 */

export interface VaultData {
  categories: Category[]
  tasks: Task[]
  taskCompletions: TaskCompletion[]
  goals: Goal[]
  subSteps: SubStep[]
  goalCycleCompletions: GoalCycleCompletion[]
  subStepCycleCompletions: SubStepCycleCompletion[]
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function parseDataJson(content: string): ParseResult<VaultData> {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return { ok: false, reason: 'questday-data.json ist kein gültiges JSON' }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'questday-data.json enthält kein Objekt' }
  }
  const record = raw as Record<string, unknown>
  if (record.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: `unbekannte Schema-Version ${String(record.schemaVersion)}` }
  }

  return {
    ok: true,
    value: {
      categories: asArray<Category>(record.categories),
      tasks: asArray<Task>(record.tasks),
      taskCompletions: asArray<TaskCompletion>(record.taskCompletions),
      goals: asArray<Goal>(record.goals),
      subSteps: asArray<SubStep>(record.subSteps),
      goalCycleCompletions: asArray<GoalCycleCompletion>(record.goalCycleCompletions),
      subStepCycleCompletions: asArray<SubStepCycleCompletion>(record.subStepCycleCompletions),
    },
  }
}

/** Ist die Datenbank so leer, dass ein Vollimport sicher nichts überschreibt? */
export async function isDatabaseEmpty(): Promise<boolean> {
  const [tasks, goals, completions] = await Promise.all([
    db.tasks.count(),
    db.goals.count(),
    db.taskCompletions.count(),
  ])
  return tasks === 0 && goals === 0 && completions === 0
}

/** Gerätelokale Felder auffüllen - eine von Hand bearbeitete JSON darf nichts kaputt machen. */
function normalizeTask(task: Task): Task {
  return { ...task, reminderFired: false } as Task
}

function normalizeGoal(goal: Goal): Goal {
  if (!goal.recurrence) return { ...goal, recurrence: null }
  return { ...goal, recurrence: { ...goal.recurrence, lastReminderFiredDate: null } }
}

export async function bootstrapFromJson(data: VaultData): Promise<ImportOutcome> {
  const outcome = emptyOutcome()

  await db.categories.bulkPut(data.categories)
  await db.tasks.bulkPut(data.tasks.map(normalizeTask))
  await db.taskCompletions.bulkPut(data.taskCompletions)
  await db.goals.bulkPut(data.goals.map(normalizeGoal))
  await db.subSteps.bulkPut(data.subSteps)
  await db.goalCycleCompletions.bulkPut(data.goalCycleCompletions)
  await db.subStepCycleCompletions.bulkPut(data.subStepCycleCompletions)

  outcome.created =
    data.categories.length +
    data.tasks.length +
    data.goals.length +
    data.subSteps.length +
    data.taskCompletions.length
  return outcome
}

async function addMissing<T, K extends string>(
  table: Table<T, K>,
  items: readonly T[],
  keyOf: (item: T) => K,
): Promise<number> {
  let added = 0
  for (const item of items) {
    if (await table.get(keyOf(item))) continue
    await table.add(item)
    added += 1
  }
  return added
}

/**
 * Nur anlegen, nie ändern, nie löschen. Holt ein zweites Gerät ab, ohne mit dem Markdown
 * in Konflikt zu geraten.
 */
export async function mergeAdditiveFromJson(data: VaultData): Promise<ImportOutcome> {
  const outcome = emptyOutcome()

  outcome.created += await addMissing(db.categories, data.categories, (c) => c.id)
  outcome.created += await addMissing(db.tasks, data.tasks.map(normalizeTask), (t) => t.id)
  outcome.created += await addMissing(db.goals, data.goals.map(normalizeGoal), (g) => g.id)
  outcome.created += await addMissing(db.subSteps, data.subSteps, (s) => s.id)
  outcome.created += await addMissing(db.taskCompletions, data.taskCompletions, (c) => c.id)
  outcome.created += await addMissing(db.goalCycleCompletions, data.goalCycleCompletions, (c) => c.id)
  outcome.created += await addMissing(
    db.subStepCycleCompletions,
    data.subStepCycleCompletions,
    (c) => c.id,
  )

  return outcome
}
