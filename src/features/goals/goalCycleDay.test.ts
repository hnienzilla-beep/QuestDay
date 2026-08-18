import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/db'
import { setGoalCycleDone, isGoalCycleDoneOnDate } from './goalRepository'
import { CATEGORIES, goal, subStep } from '../../test/fixtures'
import type { Goal, GoalRecurrence } from '../../types/goal'

const GESTERN = '2026-08-13'

const TAEGLICH: GoalRecurrence = {
  frequency: 'daily',
  weekdays: [],
  dayOfMonth: null,
  intervalDays: null,
  anchorDate: '2026-08-01',
  reminderTime: null,
  lastReminderFiredDate: null,
  stoppedAt: null,
}

async function reset() {
  await Promise.all([
    db.goals.clear(),
    db.subSteps.clear(),
    db.goalCycleCompletions.clear(),
    db.subStepCycleCompletions.clear(),
    db.categories.clear(),
  ])
  await db.categories.bulkPut(CATEGORIES)
  await db.goals.put(goal({ id: 'g1', title: 'Lesen', recurrence: TAEGLICH }))
  await db.subSteps.bulkPut([
    subStep({ id: 's1', goalId: 'g1', title: '10 Seiten', order: 0 }),
    subStep({ id: 's2', goalId: 'g1', title: 'Notiz schreiben', order: 1 }),
  ])
}

describe('Ziel-Zyklus für einen beliebigen Tag', () => {
  beforeEach(reset)

  it('hakt den ganzen Zyklus samt Teilschritten für einen vergangenen Tag ab', async () => {
    const g = (await db.goals.get('g1')) as Goal
    await setGoalCycleDone(g, GESTERN, true)

    expect(await isGoalCycleDoneOnDate('g1', GESTERN)).toBe(true)
    // Ein "erledigt" neben halb offenen Schritten wäre widersprüchlich.
    expect(await db.subStepCycleCompletions.count()).toBe(2)
  })

  it('nimmt den Zyklus vollständig zurück', async () => {
    const g = (await db.goals.get('g1')) as Goal
    await setGoalCycleDone(g, GESTERN, true)
    await setGoalCycleDone(g, GESTERN, false)

    expect(await isGoalCycleDoneOnDate('g1', GESTERN)).toBe(false)
    expect(await db.subStepCycleCompletions.count()).toBe(0)
  })

  it('bleibt beim zweimaligen Abhaken bei einem Datensatz je Schritt', async () => {
    const g = (await db.goals.get('g1')) as Goal
    await setGoalCycleDone(g, GESTERN, true)
    await setGoalCycleDone(g, GESTERN, true)

    expect(await db.goalCycleCompletions.count()).toBe(1)
    expect(await db.subStepCycleCompletions.count()).toBe(2)
  })

  it('rührt ein einmaliges Ziel nicht an', async () => {
    await db.goals.put(goal({ id: 'g2', title: 'Einmalig' }))
    const g2 = (await db.goals.get('g2')) as Goal
    await setGoalCycleDone(g2, GESTERN, true)

    expect(await db.goalCycleCompletions.count()).toBe(0)
  })
})
