import { db } from '../../db/db'
import type { Goal, SubStep } from '../../types/goal'
import { isoDateOf } from '../../utils/dateUtils'
import { xpForSubStep } from '../gamification/xp'
import { awardXp } from '../gamification/awardXp'
import { mostRecentDueDateOnOrBefore } from '../goals/goalCycles'
import type { ParsedGoal, ParsedStep } from './goalParse'
import { diffById, vaultWins } from './vaultDiff'
import { EMPTY_SUMMARY, type ImportSummary } from './importTodos'

function sameGoal(a: ParsedGoal, b: ParsedGoal): boolean {
  return a.title === b.title && a.category === b.category && a.target === b.target && a.targetDate === b.targetDate
}

function sameStep(a: ParsedStep, b: ParsedStep): boolean {
  return a.done === b.done && a.title === b.title
}

/** Teilschritt eines einmaligen Ziels abhaken bzw. wieder öffnen. */
async function setOneOffStepDone(step: SubStep, done: boolean, stamp: string): Promise<void> {
  if (step.completed === done) return
  await db.subSteps.update(step.id, {
    completed: done,
    completedAt: done ? stamp : null,
    updatedAt: stamp,
  })

  const siblings = await db.subSteps.where('goalId').equals(step.goalId).toArray()
  const others = siblings.filter((s) => s.id !== step.id)
  const othersDone = others.filter((s) => s.completed).length
  // Der Bonus für den letzten Schritt gilt symmetrisch: er wird beim Abhaken
  // vergeben und beim Zurücknehmen genau dann wieder abgezogen.
  const xp = xpForSubStep(othersDone === others.length)
  await awardXp(done ? xp : -xp)

  const allDone = done && othersDone === others.length
  await db.goals.update(step.goalId, {
    completedAt: allDone ? stamp : null,
    updatedAt: stamp,
  })
}

/** Teilschritt eines wiederkehrenden Ziels für den aktuellen Zyklus abhaken bzw. öffnen. */
async function setCycleStepDone(step: SubStep, goal: Goal, done: boolean, at: Date, stamp: string): Promise<void> {
  const cycleDueDate = mostRecentDueDateOnOrBefore(goal.recurrence!, isoDateOf(at))
  if (!cycleDueDate) return

  const existing = await db.subStepCycleCompletions
    .where('[goalId+cycleDueDate]')
    .equals([goal.id, cycleDueDate])
    .and((c) => c.subStepId === step.id)
    .first()
  if (done === (existing !== undefined)) return

  const siblings = await db.subSteps.where('goalId').equals(goal.id).toArray()

  if (done) {
    await db.subStepCycleCompletions.add({
      id: crypto.randomUUID(),
      subStepId: step.id,
      goalId: goal.id,
      cycleDueDate,
      completedAt: stamp,
    })
    const doneCount = await db.subStepCycleCompletions
      .where('[goalId+cycleDueDate]')
      .equals([goal.id, cycleDueDate])
      .count()
    const isLast = doneCount === siblings.length
    if (isLast) {
      await db.goalCycleCompletions.add({
        id: crypto.randomUUID(),
        goalId: goal.id,
        category: goal.category,
        cycleDueDate,
        completedAt: stamp,
        xpAwarded: siblings.length * 5 + 20,
      })
    }
    await awardXp(xpForSubStep(isLast))
  } else {
    await db.subStepCycleCompletions.delete(existing!.id)
    const cycleCompletion = await db.goalCycleCompletions
      .where('[goalId+cycleDueDate]')
      .equals([goal.id, cycleDueDate])
      .first()
    const wasLast = cycleCompletion !== undefined
    if (wasLast) await db.goalCycleCompletions.delete(cycleCompletion.id)
    await awardXp(-xpForSubStep(wasLast))
  }
}

async function applyStepChanges(
  goal: Goal,
  baselineSteps: ParsedStep[],
  currentSteps: ParsedStep[],
  vaultModifiedAt: string | null,
  lastSyncAt: string | null,
  summary: ImportSummary,
): Promise<void> {
  const stamp = vaultModifiedAt ?? new Date().toISOString()
  const at = new Date(stamp)
  const diff = diffById(baselineSteps, currentSteps, sameStep)

  if (diff.added.length > 0) {
    const existing = await db.subSteps.where('goalId').equals(goal.id).toArray()
    let order = existing.reduce((max, s) => Math.max(max, s.order), -1) + 1
    for (const parsed of diff.added) {
      const step: SubStep = {
        id: crypto.randomUUID(),
        goalId: goal.id,
        title: parsed.title,
        completed: false,
        completedAt: null,
        order: order++,
        updatedAt: stamp,
      }
      await db.subSteps.add(step)
      if (parsed.done) {
        if (goal.recurrence) await setCycleStepDone(step, goal, true, at, stamp)
        else await setOneOffStepDone(step, true, stamp)
      }
      summary.created++
    }
  }

  for (const { id, after } of diff.changed) {
    const step = await db.subSteps.get(id)
    if (!step) continue
    if (!vaultWins(step.updatedAt, vaultModifiedAt, lastSyncAt)) continue

    if (step.title !== after.title) {
      await db.subSteps.update(id, { title: after.title, updatedAt: stamp })
    }
    const fresh = await db.subSteps.get(id)
    if (fresh) {
      if (goal.recurrence) await setCycleStepDone(fresh, goal, after.done, at, stamp)
      else await setOneOffStepDone(fresh, after.done, stamp)
    }
    summary.updated++
  }

  for (const id of diff.removedIds) {
    const step = await db.subSteps.get(id)
    if (!step) continue
    if (!vaultWins(step.updatedAt, vaultModifiedAt, lastSyncAt)) continue
    await db.subSteps.delete(id)
    await db.subStepCycleCompletions.where('subStepId').equals(id).delete()
    summary.deleted++
  }
}

async function createGoalFromVault(parsed: ParsedGoal, stamp: string, summary: ImportSummary): Promise<void> {
  const goal: Goal = {
    id: crypto.randomUUID(),
    title: parsed.title,
    target: parsed.target,
    category: parsed.category,
    createdAt: stamp,
    updatedAt: stamp,
    targetDate: parsed.targetDate,
    completedAt: null,
    // Wiederholungen werden im Vault nur angezeigt, nicht zurückgelesen –
    // ein dort neu angelegtes Ziel ist deshalb immer ein einmaliges Ziel.
    recurrence: null,
  }
  await db.goals.add(goal)
  summary.created++

  const steps: SubStep[] = parsed.steps.map((step, index) => ({
    id: crypto.randomUUID(),
    goalId: goal.id,
    title: step.title,
    completed: false,
    completedAt: null,
    order: index,
    updatedAt: stamp,
  }))
  if (steps.length > 0) await db.subSteps.bulkAdd(steps)

  for (let i = 0; i < steps.length; i++) {
    if (parsed.steps[i].done) await setOneOffStepDone(steps[i], true, stamp)
  }
}

/** Überträgt die im Vault vorgenommenen Ziel-Änderungen in die App-Datenbank. */
export async function importGoalChanges(
  baseline: ParsedGoal[],
  current: ParsedGoal[],
  vaultModifiedAt: string | null,
  lastSyncAt: string | null,
): Promise<ImportSummary> {
  const diff = diffById(baseline, current, sameGoal)
  const summary = { ...EMPTY_SUMMARY }
  const stamp = vaultModifiedAt ?? new Date().toISOString()

  for (const parsed of diff.added) {
    await createGoalFromVault(parsed, stamp, summary)
  }

  const baselineById = new Map(baseline.filter((g) => g.id).map((g) => [g.id!, g]))
  for (const parsed of current) {
    if (!parsed.id) continue
    const before = baselineById.get(parsed.id)
    if (!before) continue

    const goal = await db.goals.get(parsed.id)
    // In der App gelöscht: die Löschung gewinnt.
    if (!goal) continue

    if (!sameGoal(before, parsed) && vaultWins(goal.updatedAt, vaultModifiedAt, lastSyncAt)) {
      await db.goals.update(goal.id, {
        title: parsed.title,
        category: parsed.category,
        target: parsed.target,
        targetDate: parsed.targetDate,
        updatedAt: stamp,
      })
      summary.updated++
    }

    const fresh = await db.goals.get(parsed.id)
    if (fresh) {
      await applyStepChanges(fresh, before.steps, parsed.steps, vaultModifiedAt, lastSyncAt, summary)
    }
  }

  for (const id of diff.removedIds) {
    const goal = await db.goals.get(id)
    if (!goal) continue
    if (!vaultWins(goal.updatedAt, vaultModifiedAt, lastSyncAt)) continue
    await db.goals.delete(id)
    await db.subSteps.where('goalId').equals(id).delete()
    await db.goalCycleCompletions.where('goalId').equals(id).delete()
    await db.subStepCycleCompletions.where('goalId').equals(id).delete()
    summary.deleted++
  }

  return summary
}
