import { describe, it, expect } from 'vitest'
import { renderVault } from './renderVault'
import { renderDayFile } from './renderMarkdown'
import { CATEGORIES_PATH, TASKS_PATH, dayPath } from '../vaultPaths'
import {
  CAT_ARBEIT,
  TODAY,
  TODAY_WEEKDAY,
  appointment,
  completion,
  goal,
  oneOff,
  recurring,
  snapshotOf,
  subStep,
} from '../../../test/fixtures'
import type { VaultSnapshot } from '../model/snapshot'

function fullSnapshot(): VaultSnapshot {
  return snapshotOf({
    tasks: [
      recurring({ id: 'r1', title: 'Zähne putzen' }),
      oneOff({ id: 'o1', title: 'Müll rausbringen' }),
      appointment({ id: 'a1', title: 'Zahnarzt', location: 'Praxis Dr. Meier' }),
      oneOff({ id: 'o2', title: 'Ohne Datum', dueDate: null }),
    ],
    taskCompletions: [completion({ id: 'c1', taskId: 'o1', completedDate: TODAY })],
    goals: [
      goal({ id: 'g1', title: 'Marathon vorbereiten' }),
      goal({
        id: 'g2',
        title: 'Täglich lesen',
        recurrence: {
          frequency: 'daily',
          weekdays: [],
          dayOfMonth: null,
          intervalDays: null,
          anchorDate: '2026-07-01',
          reminderTime: '20:00',
          lastReminderFiredDate: null,
          stoppedAt: null,
        },
      }),
    ],
    subSteps: [
      subStep({ id: 's2', goalId: 'g1', title: 'Longrun 25 km', order: 1 }),
      subStep({ id: 's1', goalId: 'g1', title: 'Grundlagenausdauer', order: 0, completed: true }),
    ],
  })
}

describe('renderVault - Determinismus', () => {
  it('erzeugt bei zwei Läufen byteidentische Dateien', () => {
    const snapshot = fullSnapshot()
    const first = renderVault(snapshot, {})
    const second = renderVault(snapshot, first.goalPaths)
    expect([...second.files.entries()]).toEqual([...first.files.entries()])
  })

  it('ist unabhängig von der Reihenfolge der Eingabelisten', () => {
    const snapshot = fullSnapshot()
    const shuffled: VaultSnapshot = {
      ...snapshot,
      tasks: [...snapshot.tasks].reverse(),
      goals: [...snapshot.goals].reverse(),
      subSteps: [...snapshot.subSteps].reverse(),
      categories: [...snapshot.categories].reverse(),
    }
    const a = renderVault(snapshot, {})
    const b = renderVault(shuffled, a.goalPaths)
    expect([...b.files.entries()].sort()).toEqual([...a.files.entries()].sort())
  })

  it('verschiebt die Ziel-Datei mit dem Titel - und zwar auf jedem Gerät gleich', () => {
    const snapshot = fullSnapshot()
    const first = renderVault(snapshot, {})
    const renamed: VaultSnapshot = {
      ...snapshot,
      goals: snapshot.goals.map((g) => (g.id === 'g1' ? { ...g, title: 'Ganz anderer Titel' } : g)),
    }

    // Früher blieb der alte Pfad bestehen, gestützt auf den lokal gemerkten Stand. Genau das
    // ließ zwei Geräte dieselben Dateien gegeneinander umschreiben: Der gemerkte Stand liegt
    // im localStorage und ist auf jedem Gerät ein anderer. Der Pfad folgt jetzt dem Titel.
    const mitVorgeschichte = renderVault(renamed, first.goalPaths)
    const ohneVorgeschichte = renderVault(renamed, {})

    expect(mitVorgeschichte.goalPaths.g1).toBe('QuestDay/Ziele/ganz-anderer-titel.md')
    expect(ohneVorgeschichte.goalPaths.g1).toBe(mitVorgeschichte.goalPaths.g1)
  })

  it('gibt gleichnamigen Zielen feste, voneinander unabhängige Pfade', () => {
    const snapshot = fullSnapshot()
    const zwilling: VaultSnapshot = {
      ...snapshot,
      goals: [
        ...snapshot.goals,
        { ...snapshot.goals[0], id: 'zwilling-1', title: snapshot.goals[0].title },
      ],
    }

    const a = renderVault(zwilling, {})
    // Anderes Gerät: andere Reihenfolge, anderer gemerkter Stand.
    const b = renderVault({ ...zwilling, goals: [...zwilling.goals].reverse() }, { g1: 'QuestDay/Ziele/irgendwas.md' })

    expect(b.goalPaths).toEqual(a.goalPaths)
    // Kein Zähl-Suffix mehr, das von der Reihenfolge abhinge.
    expect(Object.values(a.goalPaths)).not.toContain('QuestDay/Ziele/marathon-vorbereiten-2.md')
    expect(new Set(Object.values(a.goalPaths)).size).toBe(Object.keys(a.goalPaths).length)
  })

  it('führt undatierte einmalige Aufgaben in keiner Tagesdatei', () => {
    const files = renderVault(fullSnapshot(), {}).files
    for (const [path, content] of files) {
      if (path.includes('/Tage/')) expect(content).not.toContain('Ohne Datum')
    }
  })

  it('schreibt Kategorien als Namen in die Zeile', () => {
    const dayFile = renderVault(fullSnapshot(), {}).files.get(dayPath(TODAY))!
    expect(dayFile).toContain('Müll rausbringen (Haushalt)')
    expect(dayFile).toContain('Zähne putzen (Arbeit)')
  })

  it('lässt die Klammer weg, wenn keine Kategorie gesetzt ist', () => {
    const snapshot = snapshotOf({ tasks: [oneOff({ id: 'o1', title: 'Ohne', categoryId: null })] })
    expect(renderDayFile(snapshot, TODAY)).toContain('- [ ] Ohne ^qd-o1')
  })
})

describe('renderDayFile - eingefrorene Vergangenheit', () => {
  it('ändert vergangene Tagesdateien nicht, wenn eine neue tägliche Aufgabe entsteht', () => {
    const past = '2026-08-01'
    const base = snapshotOf({
      tasks: [oneOff({ id: 'o1', title: 'Alt', dueDate: past })],
      taskCompletions: [completion({ id: 'c1', taskId: 'o1', completedDate: past })],
    })
    const before = renderDayFile(base, past)

    const withNewRecurring = snapshotOf({
      tasks: [...base.tasks, recurring({ id: 'r9', title: 'Neue tägliche Aufgabe' })],
      taskCompletions: [...base.taskCompletions],
    })
    expect(renderDayFile(withNewRecurring, past)).toBe(before)
  })

  it('zeigt wiederkehrende Aufgaben ab heute', () => {
    const snapshot = snapshotOf({ tasks: [recurring({ id: 'r1', title: 'Heute fällig' })] })
    expect(renderDayFile(snapshot, TODAY)).toContain('Heute fällig')
  })

  it('berücksichtigt mehrere Wochentage', () => {
    const snapshot = snapshotOf({
      tasks: [
        recurring({
          id: 'r1',
          title: 'Mehrtägig',
          frequency: 'weekly',
          weekdays: [1, TODAY_WEEKDAY],
        }),
        recurring({ id: 'r2', title: 'Anderer Tag', frequency: 'weekly', weekdays: [1] }),
      ],
    })
    const dayFile = renderDayFile(snapshot, TODAY)
    expect(dayFile).toContain('Mehrtägig')
    expect(dayFile).not.toContain('Anderer Tag')
  })
})

describe('renderDayFile - Uhrzeiten', () => {
  it('rendert die Uhrzeit einer einmaligen Aufgabe wie bei einem Termin', () => {
    const snapshot = snapshotOf({
      tasks: [oneOff({ id: 'o1', title: 'Mit Uhrzeit', time: '09:00', categoryId: CAT_ARBEIT.id })],
    })
    expect(renderDayFile(snapshot, TODAY)).toContain('- [ ] 09:00 Mit Uhrzeit (Arbeit) ^qd-o1')
  })
})

describe('renderTasksFile / renderCategoriesFile', () => {
  it('listet nur wiederkehrende Aufgaben', () => {
    const content = renderVault(fullSnapshot(), {}).files.get(TASKS_PATH)!
    expect(content).toContain('Zähne putzen')
    expect(content).not.toContain('Müll rausbringen')
  })

  it('schreibt alle Kategorien mit Farbe und ID', () => {
    const content = renderVault(fullSnapshot(), {}).files.get(CATEGORIES_PATH)!
    expect(content).toContain('| Arbeit | #2a78d6 | cat-arbeit |')
    expect(content).toContain('| Haushalt | #eda100 | cat-haushalt |')
  })
})
