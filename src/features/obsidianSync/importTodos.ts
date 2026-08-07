import { db } from '../../db/db'
import type { Task, OneOffTask, RecurringTask, Appointment } from '../../types/task'
import { isoDateOf } from '../../utils/dateUtils'
import { xpForOneOff, xpForRecurring, xpForAppointment } from '../gamification/xp'
import { awardXp } from '../gamification/awardXp'
import type { ParsedTodo } from './todoParse'
import { diffById, vaultWins, type VaultDiff } from './vaultDiff'

export interface ImportSummary {
  created: number
  updated: number
  deleted: number
}

export const EMPTY_SUMMARY: ImportSummary = { created: 0, updated: 0, deleted: 0 }

export function summaryTotal(summary: ImportSummary): number {
  return summary.created + summary.updated + summary.deleted
}

function sameTodo(a: ParsedTodo, b: ParsedTodo): boolean {
  return (
    a.done === b.done &&
    a.title === b.title &&
    a.category === b.category &&
    a.dueDate === b.dueDate &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.location === b.location &&
    a.frequency === b.frequency &&
    a.weekday === b.weekday
  )
}

function xpFor(task: Task, at: Date): number {
  if (task.type === 'oneoff') return xpForOneOff(task, at)
  if (task.type === 'recurring') return xpForRecurring(task, at)
  return xpForAppointment(task, at)
}

/** Setzt eine Aufgabe auf erledigt – gleiche Buchführung wie beim Abhaken in der App. */
async function markDone(task: Task, at: Date, stamp: string): Promise<void> {
  const dateStr = isoDateOf(at)
  const existing = await db.taskCompletions
    .where('taskId')
    .equals(task.id)
    .and((c) => c.completedDate === dateStr)
    .first()
  if (existing) return

  const xp = xpFor(task, at)
  await db.taskCompletions.add({
    id: crypto.randomUUID(),
    taskId: task.id,
    taskType: task.type,
    category: task.category,
    completedDate: dateStr,
    completedAt: at.toISOString(),
    xpAwarded: xp,
  })
  if (task.type !== 'recurring') {
    await db.tasks.update(task.id, { completed: true, completedAt: at.toISOString(), updatedAt: stamp })
  } else {
    await db.tasks.update(task.id, { updatedAt: stamp })
  }
  await awardXp(xp)
}

/** Nimmt ein Erledigt zurück und bucht die dafür vergebenen XP wieder ab. */
async function markOpen(task: Task, at: Date, stamp: string): Promise<void> {
  const completions =
    task.type === 'recurring'
      ? await db.taskCompletions
          .where('taskId')
          .equals(task.id)
          .and((c) => c.completedDate === isoDateOf(at))
          .toArray()
      : await db.taskCompletions.where('taskId').equals(task.id).toArray()

  for (const completion of completions) {
    await db.taskCompletions.delete(completion.id)
    await awardXp(-completion.xpAwarded)
  }
  if (task.type !== 'recurring') {
    await db.tasks.update(task.id, { completed: false, completedAt: null, updatedAt: stamp })
  } else if (completions.length > 0) {
    await db.tasks.update(task.id, { updatedAt: stamp })
  }
}

function fieldPatch(task: Task, parsed: ParsedTodo, stamp: string): Partial<Task> {
  const patch: Record<string, unknown> = { title: parsed.title, category: parsed.category, updatedAt: stamp }
  if (task.type === 'oneoff') {
    patch.dueDate = parsed.dueDate
  } else if (task.type === 'appointment') {
    if (parsed.dueDate) patch.date = parsed.dueDate
    if (parsed.startTime) patch.startTime = parsed.startTime
    patch.endTime = parsed.endTime
    patch.location = parsed.location
  } else if (parsed.frequency) {
    patch.frequency = parsed.frequency
    patch.weekday = parsed.frequency === 'weekly' ? parsed.weekday : null
  }
  return patch as Partial<Task>
}

async function createFromVault(parsed: ParsedTodo, stamp: string): Promise<void> {
  const base = {
    id: crypto.randomUUID(),
    title: parsed.title,
    category: parsed.category,
    createdAt: stamp,
    updatedAt: stamp,
    completed: false,
    completedAt: null,
    reminderTime: null,
    reminderFired: false,
  }

  let task: Task
  if (parsed.startTime) {
    task = {
      ...base,
      type: 'appointment',
      date: parsed.dueDate ?? isoDateOf(new Date(stamp)),
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      location: parsed.location,
    } satisfies Appointment
  } else if (parsed.frequency) {
    task = {
      ...base,
      type: 'recurring',
      frequency: parsed.frequency,
      weekday: parsed.frequency === 'weekly' ? parsed.weekday : null,
    } satisfies RecurringTask
  } else {
    task = { ...base, type: 'oneoff', dueDate: parsed.dueDate } satisfies OneOffTask
  }

  await db.tasks.add(task)
  if (parsed.done) await markDone(task, new Date(stamp), stamp)
}

/**
 * Überträgt die im Vault vorgenommenen Änderungen in die App-Datenbank.
 * Einträge, die die App seit dem letzten Sync selbst neuer geändert hat, bleiben unangetastet –
 * sie überschreiben den Vault beim anschließenden Export.
 */
export async function importTodoChanges(
  baseline: ParsedTodo[],
  current: ParsedTodo[],
  vaultModifiedAt: string | null,
  lastSyncAt: string | null,
): Promise<ImportSummary> {
  const diff: VaultDiff<ParsedTodo> = diffById(baseline, current, sameTodo)
  const summary = { ...EMPTY_SUMMARY }
  const stamp = vaultModifiedAt ?? new Date().toISOString()
  const at = new Date(stamp)

  for (const parsed of diff.added) {
    await createFromVault(parsed, stamp)
    summary.created++
  }

  for (const { id, after } of diff.changed) {
    const task = await db.tasks.get(id)
    // In der App gelöscht: die Löschung gewinnt, der Eintrag verschwindet beim Export.
    if (!task) continue
    if (!vaultWins(task.updatedAt, vaultModifiedAt, lastSyncAt)) continue

    await db.tasks.update(id, fieldPatch(task, after, stamp))
    const updated = await db.tasks.get(id)
    if (updated) {
      const isDone =
        updated.type === 'recurring'
          ? (await db.taskCompletions
              .where('taskId')
              .equals(id)
              .and((c) => c.completedDate === isoDateOf(at))
              .count()) > 0
          : updated.completed
      if (after.done && !isDone) await markDone(updated, at, stamp)
      if (!after.done && isDone) await markOpen(updated, at, stamp)
    }
    summary.updated++
  }

  for (const id of diff.removedIds) {
    const task = await db.tasks.get(id)
    if (!task) continue
    if (!vaultWins(task.updatedAt, vaultModifiedAt, lastSyncAt)) continue
    await db.tasks.delete(id)
    await db.taskCompletions.where('taskId').equals(id).delete()
    summary.deleted++
  }

  return summary
}
