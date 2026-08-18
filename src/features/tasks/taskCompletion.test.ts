import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/db'
import { completeTaskOnDate, uncompleteTaskOnDate } from './taskCompletion'
import { isTaskDoneOnDate } from './taskRepository'
import { CATEGORIES, oneOff, recurring } from '../../test/fixtures'
import type { Task } from '../../types/task'

const GESTERN = '2026-08-13'
const MORGEN = '2026-08-15'

async function reset(tasks: Task[]) {
  await Promise.all([db.tasks.clear(), db.taskCompletions.clear(), db.categories.clear()])
  await db.categories.bulkPut(CATEGORIES)
  await db.tasks.bulkPut(tasks)
}

describe('Erledigen an einem beliebigen Tag', () => {
  beforeEach(() =>
    reset([
      recurring({ id: 'r1', title: 'Zähne putzen' }),
      oneOff({ id: 'o1', title: 'Müll rausbringen', dueDate: MORGEN }),
    ]),
  )

  it('trägt eine wiederkehrende Aufgabe für einen vergangenen Tag nach', async () => {
    const task = (await db.tasks.get('r1')) as Task
    await completeTaskOnDate(task, GESTERN)

    expect(await isTaskDoneOnDate(task, GESTERN)).toBe(true)
    // Nur der nachgetragene Tag zählt, nicht heute.
    expect(await isTaskDoneOnDate(task, '2026-08-14')).toBe(false)
  })

  it('setzt den Zeitstempel auf Mittag des betroffenen Tages statt auf jetzt', async () => {
    const task = (await db.tasks.get('r1')) as Task
    await completeTaskOnDate(task, GESTERN)

    const eintrag = (await db.taskCompletions.toArray())[0]
    expect(eintrag.completedDate).toBe(GESTERN)
    expect(eintrag.completedAt).toBe(`${GESTERN}T12:00:00.000Z`)
  })

  it('hakt eine künftige einmalige Aufgabe vorab ab', async () => {
    const task = (await db.tasks.get('o1')) as Task
    await completeTaskOnDate(task, MORGEN)

    expect((await db.tasks.get('o1'))?.completed).toBe(true)
    expect((await db.taskCompletions.toArray())[0].completedDate).toBe(MORGEN)
  })

  it('nimmt das Abhaken für denselben Tag wieder zurück', async () => {
    const task = (await db.tasks.get('r1')) as Task
    await completeTaskOnDate(task, GESTERN)
    await uncompleteTaskOnDate(task, GESTERN)

    expect(await isTaskDoneOnDate(task, GESTERN)).toBe(false)
    expect(await db.taskCompletions.count()).toBe(0)
  })

  it('öffnet eine einmalige Aufgabe auch von einem anderen Tag aus wieder', async () => {
    const task = (await db.tasks.get('o1')) as Task
    await completeTaskOnDate(task, MORGEN)
    // Der Nutzer tippt sie an einem anderen Tag wieder an - sie muss trotzdem aufgehen.
    await uncompleteTaskOnDate(task, GESTERN)

    expect((await db.tasks.get('o1'))?.completed).toBe(false)
    expect(await db.taskCompletions.count()).toBe(0)
  })

  it('legt beim zweimaligen Abhaken keinen zweiten Eintrag an', async () => {
    const task = (await db.tasks.get('r1')) as Task
    await completeTaskOnDate(task, GESTERN)
    await completeTaskOnDate(task, GESTERN)

    expect(await db.taskCompletions.count()).toBe(1)
  })
})
