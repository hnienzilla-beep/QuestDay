import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/db'
import { countDuplicateSubSteps, mergeDuplicateSubSteps } from './goalRepository'
import { CATEGORIES, goal, subStep } from '../../test/fixtures'

async function reset() {
  await Promise.all([
    db.goals.clear(),
    db.subSteps.clear(),
    db.subStepCycleCompletions.clear(),
    db.goalCycleCompletions.clear(),
    db.categories.clear(),
  ])
  await db.categories.bulkPut(CATEGORIES)
  await db.goals.put(goal({ id: 'g1', title: 'Einkauf' }))
  await db.goals.put(goal({ id: 'g2', title: 'Anderes Ziel' }))
}

describe('Doppelte Teilschritte zusammenführen', () => {
  beforeEach(reset)

  it('zählt und entfernt gleichnamige Schritte eines Ziels', async () => {
    await db.subSteps.bulkPut([
      subStep({ id: 'a', goalId: 'g1', title: 'Hähnchenbrustfilet 250 g', order: 0 }),
      subStep({ id: 'b', goalId: 'g1', title: 'Hähnchenbrustfilet 250 g', order: 1 }),
      subStep({ id: 'c', goalId: 'g1', title: 'hähnchenbrustfilet 250 G', order: 2 }),
      subStep({ id: 'd', goalId: 'g1', title: 'Champignons 200 g', order: 3 }),
    ])

    expect(await countDuplicateSubSteps()).toBe(2)
    expect(await mergeDuplicateSubSteps()).toBe(2)

    const übrig = await db.subSteps.where('goalId').equals('g1').toArray()
    expect(übrig.map((s) => s.title).sort()).toEqual(['Champignons 200 g', 'Hähnchenbrustfilet 250 g'])
    // Behalten wird der vorderste Schritt.
    expect(übrig.find((s) => s.title.startsWith('Hähnchen'))?.id).toBe('a')
  })

  it('rührt gleichnamige Schritte verschiedener Ziele nicht an', async () => {
    await db.subSteps.bulkPut([
      subStep({ id: 'a', goalId: 'g1', title: 'Socken', order: 0 }),
      subStep({ id: 'b', goalId: 'g2', title: 'Socken', order: 0 }),
    ])

    expect(await countDuplicateSubSteps()).toBe(0)
    expect(await mergeDuplicateSubSteps()).toBe(0)
    expect(await db.subSteps.count()).toBe(2)
  })

  it('verliert kein Häkchen: erledigt gewinnt', async () => {
    await db.subSteps.bulkPut([
      subStep({ id: 'a', goalId: 'g1', title: 'Zahnbürste', order: 0 }),
      subStep({ id: 'b', goalId: 'g1', title: 'Zahnbürste', order: 1, completed: true, completedAt: '2026-08-18T12:00:00.000Z' }),
    ])

    await mergeDuplicateSubSteps()

    const übrig = await db.subSteps.toArray()
    expect(übrig).toHaveLength(1)
    expect(übrig[0]).toMatchObject({ id: 'a', completed: true, completedAt: '2026-08-18T12:00:00.000Z' })
  })

  it('übernimmt Zyklus-Erledigungen der Dubletten', async () => {
    await db.subSteps.bulkPut([
      subStep({ id: 'a', goalId: 'g1', title: 'Lesen', order: 0 }),
      subStep({ id: 'b', goalId: 'g1', title: 'Lesen', order: 1 }),
    ])
    await db.subStepCycleCompletions.put({
      id: 'alt', subStepId: 'b', goalId: 'g1', cycleDueDate: '2026-08-18', completedAt: '2026-08-18T12:00:00.000Z',
    })

    await mergeDuplicateSubSteps()

    const zyklen = await db.subStepCycleCompletions.toArray()
    expect(zyklen).toHaveLength(1)
    expect(zyklen[0].subStepId).toBe('a')
  })

  it('ist folgenlos, wenn es nichts zu tun gibt', async () => {
    await db.subSteps.put(subStep({ id: 'a', goalId: 'g1', title: 'Einzeln', order: 0 }))
    expect(await mergeDuplicateSubSteps()).toBe(0)
    expect(await db.subSteps.count()).toBe(1)
  })
})
