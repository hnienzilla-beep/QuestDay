import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../../db/db'
import { applyCategoriesFile, applyDayFile, applyGoalFile, applyTasksFile } from './applyFiles'
import { parseCategoriesFile, parseDayFile, parseGoalFile, parseTasksFile } from '../parse/parseFiles'
import {
  renderCategoriesFile,
  renderDayFile,
  renderGoalFile,
  renderTasksFile,
} from '../render/renderMarkdown'
import { loadSnapshot } from '../model/snapshot'
import {
  CAT_ARBEIT,
  CAT_HAUSHALT,
  CATEGORIES,
  TODAY,
  TODAY_WEEKDAY,
  appointment,
  goal,
  oneOff,
  recurring,
  subStep,
} from '../../../test/fixtures'
import type { Task } from '../../../types/task'
import type { Goal, SubStep } from '../../../types/goal'
import type { Category } from '../../../types/category'

async function reset(
  parts: { tasks?: Task[]; goals?: Goal[]; subSteps?: SubStep[]; categories?: Category[] } = {},
) {
  await Promise.all([
    db.tasks.clear(),
    db.taskCompletions.clear(),
    db.goals.clear(),
    db.subSteps.clear(),
    db.goalCycleCompletions.clear(),
    db.subStepCycleCompletions.clear(),
    db.categories.clear(),
  ])
  await db.categories.bulkPut(parts.categories ?? CATEGORIES)
  if (parts.tasks) await db.tasks.bulkPut(parts.tasks)
  if (parts.goals) await db.goals.bulkPut(parts.goals)
  if (parts.subSteps) await db.subSteps.bulkPut(parts.subSteps)
}

/** Rendert den aktuellen DB-Stand als Tagesdatei und wendet die bearbeitete Fassung an. */
async function roundTripDay(edit: (content: string) => string) {
  const snapshot = await loadSnapshot(TODAY)
  const names = new Set(snapshot.categories.map((c) => c.name))
  const parsed = parseDayFile(TODAY, edit(renderDayFile(snapshot, TODAY)), names)
  if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
  return applyDayFile(parsed.value)
}

describe('applyDayFile - Haken', () => {
  beforeEach(() => reset({ tasks: [oneOff({ id: 'o1', title: 'Müll rausbringen' })] }))

  it('legt beim Anhaken eine Erledigung für genau diesen Tag an', async () => {
    await roundTripDay((c) => c.replace('- [ ]', '- [x]'))
    const completions = await db.taskCompletions.toArray()
    expect(completions).toHaveLength(1)
    expect(completions[0].completedDate).toBe(TODAY)
    expect((await db.tasks.get('o1'))!.completed).toBe(true)
  })

  it('nimmt die Erledigung beim Abhaken zurück', async () => {
    await roundTripDay((c) => c.replace('- [ ]', '- [x]'))
    await roundTripDay((c) => c.replace('- [x]', '- [ ]'))
    expect(await db.taskCompletions.count()).toBe(0)
    expect((await db.tasks.get('o1'))!.completed).toBe(false)
  })

  it('ist idempotent: derselbe Inhalt zweimal ändert beim zweiten Mal nichts', async () => {
    await roundTripDay((c) => c.replace('- [ ]', '- [x]'))
    const second = await roundTripDay((c) => c.replace('- [ ]', '- [x]'))
    expect(second).toMatchObject({ created: 0, updated: 0, deleted: 0 })
    expect(await db.taskCompletions.count()).toBe(1)
  })

  it('übernimmt geänderten Titel, Kategorie und Uhrzeit', async () => {
    await roundTripDay((c) => c.replace('Müll rausbringen (Haushalt)', '07:00 Papiermüll (Arbeit)'))
    expect(await db.tasks.get('o1')).toMatchObject({
      title: 'Papiermüll',
      categoryId: CAT_ARBEIT.id,
      time: '07:00',
    })
  })
})

describe('applyDayFile - Kategorien', () => {
  it('behält die Kategorie, wenn in der Klammer ein unbekannter Name steht', async () => {
    // Ein unbekannter Name ist keine Kategorie, sondern Titeltext - die Kategorie der
    // Aufgabe bleibt davon unberührt.
    await reset({ tasks: [oneOff({ id: 'o1', title: 'Aufgabe' })] })
    await roundTripDay((c) => c.replace('(Haushalt)', '(Gibtsnicht)'))
    expect((await db.tasks.get('o1'))!.categoryId).toBe(CAT_HAUSHALT.id)
  })

  it('legt aus einer unbekannten Klammer keine neue Kategorie an', async () => {
    await reset()
    await roundTripDay((c) => c.replace('## Aufgaben', '## Aufgaben\n\n- [ ] Neu (Gibtsnicht)'))
    expect((await db.tasks.toArray())[0].categoryId).toBeNull()
    expect(await db.categories.count()).toBe(CATEGORIES.length)
  })
})

describe('applyDayFile - Löschregeln', () => {
  it('löscht eine einmalige Aufgabe, deren Zeile aus ihrer Tagesdatei entfernt wurde', async () => {
    await reset({ tasks: [oneOff({ id: 'o1', title: 'Weg damit' })] })
    await roundTripDay((c) => c.replace(/^- \[ \] Weg damit.*$/m, ''))
    expect(await db.tasks.get('o1')).toBeUndefined()
  })

  it('löscht einen Termin, dessen Zeile entfernt wurde', async () => {
    await reset({ tasks: [appointment({ id: 'a1', title: 'Zahnarzt' })] })
    await roundTripDay((c) => c.replace(/^- \[ \] .*Zahnarzt.*$/m, ''))
    expect(await db.tasks.get('a1')).toBeUndefined()
  })

  it('löscht eine wiederkehrende Aufgabe NICHT, wenn ihre Zeile entfernt wurde', async () => {
    await reset({ tasks: [recurring({ id: 'r1', title: 'Zähne putzen' })] })
    await roundTripDay((c) => c.replace(/^- \[ \] Zähne putzen.*$/m, ''))
    expect(await db.tasks.get('r1')).toBeDefined()
  })

  it('löscht ein Ziel NICHT, wenn seine Zyklus-Zeile entfernt wurde', async () => {
    await reset({
      goals: [
        goal({
          id: 'g1',
          title: 'Täglich lesen',
          recurrence: {
            frequency: 'daily',
            weekdays: [],
            dayOfMonth: null,
            intervalDays: null,
            anchorDate: '2026-07-01',
            reminderTime: null,
            lastReminderFiredDate: null,
            stoppedAt: null,
          },
        }),
      ],
    })
    await roundTripDay((c) => c.replace(/^- \[ \] Täglich lesen.*$/m, ''))
    expect(await db.goals.get('g1')).toBeDefined()
  })

  it('greift bei mehr als zehn Löschungen auf einmal nicht durch', async () => {
    const many = Array.from({ length: 12 }, (_, i) => oneOff({ id: `o${i}`, title: `Aufgabe ${i}` }))
    await reset({ tasks: many })
    const outcome = await roundTripDay((c) => c.replace(/^- \[ \] Aufgabe .*$/gm, ''))
    expect(await db.tasks.count()).toBe(12)
    expect(outcome.warnings.join(' ')).toContain('Löschungen')
  })
})

describe('applyDayFile - Neuanlage', () => {
  it('legt aus einer neuen Zeile eine einmalige Aufgabe für diesen Tag an', async () => {
    await reset()
    await roundTripDay((c) => c.replace('## Aufgaben', '## Aufgaben\n\n- [ ] Frisch notiert (Arbeit)'))
    const tasks = await db.tasks.toArray()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      title: 'Frisch notiert',
      categoryId: CAT_ARBEIT.id,
      type: 'oneoff',
    })
    expect((tasks[0] as { dueDate: string }).dueDate).toBe(TODAY)
  })

  it('übernimmt eine Uhrzeit aus einer neuen Zeile', async () => {
    await reset()
    await roundTripDay((c) => c.replace('## Aufgaben', '## Aufgaben\n\n- [ ] 06:30 Joggen (Arbeit)'))
    expect((await db.tasks.toArray())[0]).toMatchObject({ title: 'Joggen', time: '06:30' })
  })

  it('legt eine bereits angehakte neue Zeile samt Erledigung an', async () => {
    await reset()
    await roundTripDay((c) => c.replace('## Aufgaben', '## Aufgaben\n\n- [x] Schon erledigt (Arbeit)'))
    expect(await db.taskCompletions.count()).toBe(1)
  })

  it('legt auch eine Zeile mit unbekanntem Anker an und behält deren ID', async () => {
    await reset()
    // So schreibt ein Werkzeug von außen: Anker gleich mitgeliefert, obwohl die App
    // diese ID nie vergeben hat. Früher fiel die Zeile damit unter "in der App gelöscht"
    // und verschwand beim nächsten Schreiben.
    await roundTripDay((c) =>
      c.replace(
        '## Aufgaben',
        '## Aufgaben\n\n- [ ] 09:00 Koffer packen (Arbeit) ^qd-ed0f9ab7-0594-49ad-bb82-c5af4aecd3dd',
      ),
    )

    const task = await db.tasks.get('ed0f9ab7-0594-49ad-bb82-c5af4aecd3dd')
    expect(task).toMatchObject({ title: 'Koffer packen', time: '09:00', type: 'oneoff' })
    expect((task as { dueDate: string }).dueDate).toBe(TODAY)
  })

  it('legt aus derselben Zeile beim zweiten Lauf keine Dublette an', async () => {
    await reset()
    const mitAnker = (c: string) =>
      c.replace('## Aufgaben', '## Aufgaben\n\n- [ ] Koffer packen (Arbeit) ^qd-11111111-2222-3333-4444-555555555555')

    await roundTripDay(mitAnker)
    const zweiter = await roundTripDay(mitAnker)

    expect(await db.tasks.count()).toBe(1)
    expect(zweiter).toMatchObject({ created: 0, deleted: 0 })
  })
})

describe('applyGoalFile - Plan-Phase', () => {
  beforeEach(() =>
    reset({
      goals: [goal({ id: 'g1', title: 'Marathon', target: 'Sub-3:30' })],
      subSteps: [
        subStep({ id: 's1', goalId: 'g1', title: 'Grundlagen', order: 0 }),
        subStep({ id: 's2', goalId: 'g1', title: 'Longrun', order: 1 }),
      ],
    }),
  )

  async function roundTripGoal(edit: (content: string) => string) {
    const snapshot = await loadSnapshot(TODAY)
    const parsed = parseGoalFile(edit(renderGoalFile(snapshot, snapshot.goals[0])))
    if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
    return applyGoalFile(parsed.value, TODAY)
  }

  it('löscht einen Teilschritt, dessen Zeile entfernt wurde', async () => {
    await roundTripGoal((c) => c.replace(/^- \[ \] Longrun.*$/m, ''))
    expect(await db.subSteps.get('s2')).toBeUndefined()
    expect(await db.subSteps.get('s1')).toBeDefined()
  })

  it('legt einen neuen Teilschritt aus einer neuen Zeile an', async () => {
    await roundTripGoal((c) => `${c.trimEnd()}\n- [ ] Wettkampf\n`)
    const titles = (await db.subSteps.where('goalId').equals('g1').toArray()).map((s) => s.title)
    expect(titles).toContain('Wettkampf')
  })

  it('übernimmt Titel, Zieltext, Zieldatum und Kategorie', async () => {
    await roundTripGoal((c) =>
      c
        .replace('# Marathon', '# Halbmarathon')
        .replace('Sub-3:30', 'Sub-1:45')
        .replace('zieldatum: null', 'zieldatum: 2027-05-01')
        .replace('kategorie: null', 'kategorie: Arbeit'),
    )
    expect(await db.goals.get('g1')).toMatchObject({
      title: 'Halbmarathon',
      target: 'Sub-1:45',
      targetDate: '2027-05-01',
      categoryId: CAT_ARBEIT.id,
    })
  })

  it('übernimmt eine Wiederholung an mehreren Wochentagen', async () => {
    await roundTripGoal((c) => c.replace('wiederholung: keine', 'wiederholung: wöchentlich:1,3,5'))
    expect((await db.goals.get('g1'))!.recurrence).toMatchObject({
      frequency: 'weekly',
      weekdays: [1, 3, 5],
    })
  })

  it('löscht das Ziel NICHT, wenn alle Teilschritt-Zeilen fehlen', async () => {
    await roundTripGoal((c) => c.replace(/^- \[[ x]\] .*$/gm, ''))
    expect(await db.goals.get('g1')).toBeDefined()
    // Leerer Abschnitt bei mehreren Einträgen: Ventil greift, nichts wird gelöscht.
    expect(await db.subSteps.where('goalId').equals('g1').count()).toBe(2)
  })

  it('ist idempotent', async () => {
    await roundTripGoal((c) => c)
    const second = await roundTripGoal((c) => c)
    expect(second).toMatchObject({ created: 0, updated: 0, deleted: 0 })
  })

  it('legt ein in Obsidian neu geschriebenes Ziel samt Teilschritten an', async () => {
    const datei = [
      '---',
      'typ: questday-ziel',
      'id: neu-1',
      'kategorie: Arbeit',
      'erstellt: 2026-08-13',
      'zieldatum: 2026-08-20',
      'wiederholung: keine',
      '---',
      '',
      '# Hochzeit Packliste',
      '',
      'Drei Tage Hochzeit ab Freitag.',
      '',
      '## Teilschritte',
      '',
      '- [ ] Anzug einpacken',
      '- [x] Hotel bestätigen',
    ].join('\n')

    const parsed = parseGoalFile(datei)
    if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
    const outcome = await applyGoalFile(parsed.value, TODAY)

    const angelegt = await db.goals.get('neu-1')
    expect(angelegt).toMatchObject({
      title: 'Hochzeit Packliste',
      target: 'Drei Tage Hochzeit ab Freitag.',
      categoryId: CAT_ARBEIT.id,
      targetDate: '2026-08-20',
    })
    // Erstellungsdatum kommt aus der Datei, nicht vom Sync-Tag - sonst schriebe die App
    // die Datei nach dem Import sofort wieder um.
    expect(angelegt?.createdAt.slice(0, 10)).toBe('2026-08-13')

    const schritte = await db.subSteps.where('goalId').equals('neu-1').toArray()
    expect(schritte.map((s) => s.title).sort()).toEqual(['Anzug einpacken', 'Hotel bestätigen'])
    expect(schritte.find((s) => s.title === 'Hotel bestätigen')?.completed).toBe(true)
    // 1 Ziel + 2 Teilschritte
    expect(outcome.created).toBe(3)
  })

  it('ist nach dem ersten Zurückschreiben stabil', async () => {
    const datei = [
      '---',
      'typ: questday-ziel',
      'id: neu-2',
      'kategorie: Arbeit',
      'erstellt: 2026-08-13',
      'zieldatum: null',
      'wiederholung: keine',
      '---',
      '',
      '# Umzug planen',
      '',
      'Kisten besorgen.',
      '',
      '## Teilschritte',
      '',
      '- [ ] Kartons kaufen',
    ].join('\n')

    const parsed = parseGoalFile(datei)
    if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
    await applyGoalFile(parsed.value, TODAY)

    // So läuft es echt: nach dem Import schreibt die App die Datei einmal zurück - erst
    // dadurch trägt die Teilschritt-Zeile ihren ^qd--Anker. Ab da ändert sich nichts mehr.
    const snapshot = await loadSnapshot(TODAY)
    const neu = snapshot.goals.find((g) => g.id === 'neu-2')
    if (!neu) throw new Error('Ziel wurde nicht angelegt')
    const zurueckgeschrieben = parseGoalFile(renderGoalFile(snapshot, neu))
    if (!zurueckgeschrieben.ok) throw new Error(`Parse-Gate: ${zurueckgeschrieben.reason}`)

    const zweiter = await applyGoalFile(zurueckgeschrieben.value, TODAY)
    expect(zweiter).toMatchObject({ created: 0, updated: 0, deleted: 0 })
  })
})

describe('applyTasksFile', () => {
  beforeEach(() =>
    reset({
      tasks: [recurring({ id: 'r1', title: 'Zähne putzen', reminderTime: '07:30', time: '08:00' })],
    }),
  )

  async function roundTripTasks(edit: (content: string) => string) {
    const snapshot = await loadSnapshot(TODAY)
    const parsed = parseTasksFile(edit(renderTasksFile(snapshot)))
    if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
    return applyTasksFile(parsed.value)
  }

  const ROW = '| Zähne putzen | Arbeit | täglich | 08:00 | 07:30 | r1 |'

  it('übernimmt geänderte Zellen', async () => {
    await roundTripTasks((c) =>
      c.replace(ROW, `| Zähne | Haushalt | wöchentlich:1,${TODAY_WEEKDAY} | 09:00 | 08:00 | r1 |`),
    )
    expect(await db.tasks.get('r1')).toMatchObject({
      title: 'Zähne',
      categoryId: CAT_HAUSHALT.id,
      frequency: 'weekly',
      weekdays: [1, TODAY_WEEKDAY],
      time: '09:00',
      reminderTime: '08:00',
    })
  })

  it('lässt eine leere Zelle den Wert unverändert', async () => {
    await roundTripTasks((c) => c.replace(ROW, '|  |  |  |  |  | r1 |'))
    expect(await db.tasks.get('r1')).toMatchObject({
      title: 'Zähne putzen',
      categoryId: CAT_ARBEIT.id,
      reminderTime: '07:30',
      time: '08:00',
    })
  })

  it('löscht einen Wert nur bei ausdrücklichem "-"', async () => {
    await roundTripTasks((c) => c.replace(ROW, '| Zähne putzen | - | täglich | - | - | r1 |'))
    expect(await db.tasks.get('r1')).toMatchObject({
      categoryId: null,
      time: null,
      reminderTime: null,
    })
  })

  it('löscht nichts, wenn die Zeile entfernt wurde', async () => {
    await roundTripTasks((c) => c.replace(ROW, ''))
    expect(await db.tasks.get('r1')).toBeDefined()
  })
})

describe('applyCategoriesFile', () => {
  beforeEach(() => reset())

  async function roundTripCategories(edit: (content: string) => string) {
    const snapshot = await loadSnapshot(TODAY)
    const parsed = parseCategoriesFile(edit(renderCategoriesFile(snapshot)))
    if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
    return applyCategoriesFile(parsed.value)
  }

  it('übernimmt Umbenennen und Farbwechsel', async () => {
    await roundTripCategories((c) =>
      c.replace('| Arbeit | #2a78d6 | cat-arbeit |', '| Beruf | #123456 | cat-arbeit |'),
    )
    expect(await db.categories.get('cat-arbeit')).toMatchObject({
      name: 'Beruf',
      color: '#123456',
    })
  })

  it('legt aus einer Zeile ohne ID eine neue Kategorie an', async () => {
    await roundTripCategories((c) => `${c.trimEnd()}\n| Sport | #00ff00 |  |\n`)
    const names = (await db.categories.toArray()).map((c) => c.name)
    expect(names).toContain('Sport')
  })

  it('löscht nichts, wenn eine Zeile entfernt wurde', async () => {
    await roundTripCategories((c) => c.replace(/^\| Arbeit .*$/m, ''))
    expect(await db.categories.get('cat-arbeit')).toBeDefined()
  })

  it('ist idempotent', async () => {
    await roundTripCategories((c) => c)
    const second = await roundTripCategories((c) => c)
    expect(second).toMatchObject({ created: 0, updated: 0, deleted: 0 })
  })
})
