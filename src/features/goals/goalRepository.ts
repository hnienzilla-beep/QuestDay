import { db } from '../../db/db'
import type { Goal, SubStep, GoalRecurrence, RecurrenceFrequency } from '../../types/goal'
import { isGoalDueOnDate, mostRecentDueDateOnOrBefore, isRecurrenceActiveOnDate } from './goalCycles'
import { todayISODate } from '../../utils/dateUtils'
import { triggerAutoSync } from '../obsidianSync/syncScheduler'
import { goalCycleIdFor, subStepCycleIdFor } from '../obsidianSync/import/ids'

function newId(): string {
  return crypto.randomUUID()
}

export interface RecurrenceInput {
  frequency: RecurrenceFrequency
  weekdays: number[]
  dayOfMonth: number | null
  intervalDays: number | null
  reminderTime: string | null
}

function buildRecurrence(input: RecurrenceInput | null, anchorDate: string): GoalRecurrence | null {
  if (!input) return null
  return {
    frequency: input.frequency,
    weekdays: input.frequency === 'weekly' ? input.weekdays : [],
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
  categoryId: string | null
  targetDate: string | null
  subStepTitles: string[]
  recurrence: RecurrenceInput | null
}): Promise<Goal> {
  const goal: Goal = {
    id: newId(),
    title: input.title,
    target: input.target,
    categoryId: input.categoryId,
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
  triggerAutoSync()
  return goal
}

export interface GoalUpdateInput {
  title: string
  target: string
  categoryId: string | null
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
    categoryId: patch.categoryId,
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

  triggerAutoSync()
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
  await db.subSteps.where('goalId').equals(id).delete()
  await db.goalCycleCompletions.where('goalId').equals(id).delete()
  await db.subStepCycleCompletions.where('goalId').equals(id).delete()
  triggerAutoSync()
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
  triggerAutoSync()
}

/**
 * Hakt einen kompletten Ziel-Zyklus für einen beliebigen Tag ab oder nimmt das zurück.
 *
 * Anders als in der Ziel-Karte, wo einzelne Teilschritte angetippt werden, geht es im
 * Tagesplan um den Zyklus als Ganzes: Alle Teilschritte dieses Tages wandern mit, sonst
 * stünde ein "erledigt" neben halb offenen Schritten.
 */
export async function setGoalCycleDone(goal: Goal, cycleDueDate: string, done: boolean): Promise<void> {
  if (!goal.recurrence) return

  if (!done) {
    await db.goalCycleCompletions.where('[goalId+cycleDueDate]').equals([goal.id, cycleDueDate]).delete()
    await db.subStepCycleCompletions.where('[goalId+cycleDueDate]').equals([goal.id, cycleDueDate]).delete()
    triggerAutoSync()
    return
  }

  const steps = await db.subSteps.where('goalId').equals(goal.id).toArray()
  // Mittag des Zyklustages statt "jetzt": beim Nachtragen wäre die aktuelle Uhrzeit
  // irreführend, und der Zeitstempel muss auf jedem Gerät gleich ausfallen.
  const completedAt = `${cycleDueDate}T12:00:00.000Z`

  await db.subStepCycleCompletions.bulkPut(
    steps.map((step) => ({
      id: subStepCycleIdFor(step.id, cycleDueDate),
      subStepId: step.id,
      goalId: goal.id,
      cycleDueDate,
      completedAt,
    })),
  )
  await db.goalCycleCompletions.put({
    id: goalCycleIdFor(goal.id, cycleDueDate),
    goalId: goal.id,
    categoryId: goal.categoryId,
    cycleDueDate,
    completedAt,
  })
  triggerAutoSync()
}

/**
 * Ein Ziel gilt als abgeschlossen, wenn es nichts mehr zu tun gibt: bei einmaligen Zielen
 * mit dem letzten Teilschritt, bei wiederkehrenden mit dem Stoppen der Wiederholung.
 * Solche Ziele wandern in der Zielübersicht ins Archiv, statt die Liste zu füllen.
 */
export function isGoalArchived(goal: Goal): boolean {
  return goal.recurrence ? goal.recurrence.stoppedAt !== null : goal.completedAt !== null
}

/** Normalisierter Titel als Schlüssel für die Dubletten-Suche. */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Findet Teilschritte, die innerhalb eines Ziels denselben Titel tragen.
 *
 * Sie entstanden, als jedes Gerät einer ihm unbekannten Zeile eine eigene Zufalls-ID gab.
 * Neue Dubletten kann es nicht mehr geben; die vorhandenen verschwinden nicht von selbst,
 * weil sie in der Datenbank vollwertige Einträge sind.
 */
export async function countDuplicateSubSteps(): Promise<number> {
  const steps = await db.subSteps.toArray()
  const gesehen = new Set<string>()
  let doppelt = 0
  for (const step of steps) {
    const key = `${step.goalId}|${titleKey(step.title)}`
    if (gesehen.has(key)) doppelt += 1
    else gesehen.add(key)
  }
  return doppelt
}

/**
 * Führt gleichnamige Teilschritte eines Ziels zusammen.
 *
 * Behalten wird der vorderste (niedrigste `order`, bei Gleichstand die kleinste ID - auf
 * jedem Gerät dieselbe Wahl). Erledigt-Zustand und Zyklus-Erledigungen der Dubletten wandern
 * auf den behaltenen Schritt, damit kein Häkchen verloren geht.
 *
 * Bewusst nur auf Knopfdruck: Zwei gleichnamige Schritte können in einer Packliste auch
 * gewollt sein.
 */
export async function mergeDuplicateSubSteps(): Promise<number> {
  const steps = await db.subSteps.toArray()
  const gruppen = new Map<string, SubStep[]>()
  for (const step of steps) {
    const key = `${step.goalId}|${titleKey(step.title)}`
    const liste = gruppen.get(key) ?? []
    liste.push(step)
    gruppen.set(key, liste)
  }

  let entfernt = 0
  for (const liste of gruppen.values()) {
    if (liste.length < 2) continue
    liste.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
    const [behalten, ...dubletten] = liste

    const erledigt = liste.some((s) => s.completed)
    const erledigtAm = liste.map((s) => s.completedAt).filter((v): v is string => v !== null).sort()[0] ?? null
    if (behalten.completed !== erledigt || behalten.completedAt !== erledigtAm) {
      await db.subSteps.update(behalten.id, { completed: erledigt, completedAt: erledigtAm })
    }

    for (const dublette of dubletten) {
      const zyklen = await db.subStepCycleCompletions.where('subStepId').equals(dublette.id).toArray()
      for (const zyklus of zyklen) {
        await db.subStepCycleCompletions.put({
          ...zyklus,
          id: subStepCycleIdFor(behalten.id, zyklus.cycleDueDate),
          subStepId: behalten.id,
        })
        await db.subStepCycleCompletions.delete(zyklus.id)
      }
      await db.subSteps.delete(dublette.id)
      entfernt += 1
    }
  }

  if (entfernt > 0) triggerAutoSync()
  return entfernt
}
