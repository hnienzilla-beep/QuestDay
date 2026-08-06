import type { Task, TaskCompletion } from '../../../types/task'
import type { Goal, SubStep, GoalCycleCompletion, SubStepCycleCompletion } from '../../../types/goal'
import type { Category } from '../../../types/category'
import { canonicalJson, type CanonicalValue } from '../canonical'
import type { VaultSnapshot } from '../model/snapshot'

/**
 * Der vollständige Datenbestand als eine JSON-Datei - gedacht für ein neues Gerät.
 *
 * Jede Entität wird über ein explizites DTO serialisiert, nie über `JSON.stringify` auf der
 * Dexie-Zeile: deren Schlüsselreihenfolge ist Einfügereihenfolge, und `Table.update()` hängt
 * neue Schlüssel hinten an. Zwei Geräte kämen sonst für dieselben Daten auf verschiedene
 * Bytes.
 *
 * Nicht enthalten sind gerätelokale Felder: `reminderFired` und `lastReminderFiredDate` sind
 * Benachrichtigungs-Buchhaltung *dieses* Geräts - mitsynchronisiert würden sie Erinnerungen
 * auf dem zweiten Gerät unterdrücken und täglich Commits erzeugen.
 */

export const SCHEMA_VERSION = 2

function taskDto(task: Task): CanonicalValue {
  const base = {
    id: task.id,
    type: task.type,
    title: task.title,
    categoryId: task.categoryId,
    createdAt: task.createdAt,
    completed: task.completed,
    completedAt: task.completedAt,
    reminderTime: task.reminderTime,
  }
  if (task.type === 'oneoff') return { ...base, dueDate: task.dueDate, time: task.time }
  if (task.type === 'recurring') {
    return { ...base, frequency: task.frequency, weekdays: [...task.weekdays], time: task.time }
  }
  return {
    ...base,
    date: task.date,
    startTime: task.startTime,
    endTime: task.endTime,
    location: task.location,
  }
}

function taskCompletionDto(completion: TaskCompletion): CanonicalValue {
  return {
    id: completion.id,
    taskId: completion.taskId,
    taskType: completion.taskType,
    categoryId: completion.categoryId,
    completedDate: completion.completedDate,
    completedAt: completion.completedAt,
  }
}

function goalDto(goal: Goal): CanonicalValue {
  return {
    id: goal.id,
    title: goal.title,
    target: goal.target,
    categoryId: goal.categoryId,
    createdAt: goal.createdAt,
    targetDate: goal.targetDate,
    completedAt: goal.completedAt,
    recurrence: goal.recurrence
      ? {
          frequency: goal.recurrence.frequency,
          weekdays: [...goal.recurrence.weekdays],
          dayOfMonth: goal.recurrence.dayOfMonth,
          intervalDays: goal.recurrence.intervalDays,
          anchorDate: goal.recurrence.anchorDate,
          reminderTime: goal.recurrence.reminderTime,
          stoppedAt: goal.recurrence.stoppedAt,
        }
      : null,
  }
}

function subStepDto(step: SubStep): CanonicalValue {
  return {
    id: step.id,
    goalId: step.goalId,
    title: step.title,
    completed: step.completed,
    completedAt: step.completedAt,
    order: step.order,
  }
}

function goalCycleDto(completion: GoalCycleCompletion): CanonicalValue {
  return {
    id: completion.id,
    goalId: completion.goalId,
    categoryId: completion.categoryId,
    cycleDueDate: completion.cycleDueDate,
    completedAt: completion.completedAt,
  }
}

function subStepCycleDto(completion: SubStepCycleCompletion): CanonicalValue {
  return {
    id: completion.id,
    subStepId: completion.subStepId,
    goalId: completion.goalId,
    cycleDueDate: completion.cycleDueDate,
    completedAt: completion.completedAt,
  }
}

function categoryDto(category: Category): CanonicalValue {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    createdAt: category.createdAt,
  }
}

export function buildDataDto(snapshot: VaultSnapshot): CanonicalValue {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: snapshot.categories.map(categoryDto),
    tasks: snapshot.tasks.map(taskDto),
    taskCompletions: snapshot.taskCompletions.map(taskCompletionDto),
    goals: snapshot.goals.map(goalDto),
    subSteps: snapshot.subSteps.map(subStepDto),
    goalCycleCompletions: snapshot.goalCycleCompletions.map(goalCycleDto),
    subStepCycleCompletions: snapshot.subStepCycleCompletions.map(subStepCycleDto),
  }
}

export function renderDataJson(snapshot: VaultSnapshot): string {
  return canonicalJson(buildDataDto(snapshot))
}
