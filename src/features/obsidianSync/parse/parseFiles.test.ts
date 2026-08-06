import { describe, it, expect } from 'vitest'
import { parseCategoriesFile, parseDayFile, parseGoalFile, parseTasksFile } from './parseFiles'
import {
  renderCategoriesFile,
  renderDayFile,
  renderGoalFile,
  renderTasksFile,
} from '../render/renderMarkdown'
import { parseItemLine, renderItemLine } from '../lineFormat'
import { parseRecurrenceToken, renderRecurrenceToken } from '../recurrenceFormat'
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

/** Namen, die der Parser als Kategorie akzeptieren darf. */
const KNOWN = new Set(['Arbeit', 'Haushalt', 'Gesundheit'])

describe('parseItemLine', () => {
  it('macht renderItemLine rückgängig', () => {
    const line = renderItemLine({
      id: 'abc-123',
      checked: true,
      title: 'Zahnarzt',
      categoryName: 'Gesundheit',
      startTime: '14:00',
      endTime: '15:00',
      location: 'Praxis Dr. Meier',
    })
    expect(parseItemLine(line, KNOWN)).toEqual({
      id: 'abc-123',
      checked: true,
      title: 'Zahnarzt',
      categoryName: 'Gesundheit',
      startTime: '14:00',
      endTime: '15:00',
      location: 'Praxis Dr. Meier',
    })
  })

  it('nimmt die letzte Klammer als Kategorie', () => {
    const line = renderItemLine({
      id: 'x1',
      checked: false,
      title: 'Antwort an (Chef) weiterleiten',
      categoryName: 'Arbeit',
    })
    const parsed = parseItemLine(line, KNOWN)
    expect(parsed?.title).toBe('Antwort an (Chef) weiterleiten')
    expect(parsed?.categoryName).toBe('Arbeit')
    expect(parsed?.location).toBeNull()
  })

  it('kommt ohne Kategorie aus', () => {
    const parsed = parseItemLine('- [ ] Einfach nur ein Titel ^qd-x1', KNOWN)
    expect(parsed).toMatchObject({ id: 'x1', title: 'Einfach nur ein Titel', categoryName: null })
  })

  it('lässt eine Klammer im Titel stehen, wenn sie keine bekannte Kategorie ist', () => {
    // Ohne diese Regel würde "(Milch, Brot)" als Kategorie gelesen - und beim nächsten
    // Schreiben aus dem Titel verschwinden.
    const parsed = parseItemLine('- [ ] Einkaufen (Milch, Brot) ^qd-x1', KNOWN)
    expect(parsed).toMatchObject({ title: 'Einkaufen (Milch, Brot)', categoryName: null })
  })

  it('trennt einen Ort auch ohne Kategorie ab', () => {
    const parsed = parseItemLine('- [ ] 14:00 Zahnarzt @Praxis ^qd-a1', KNOWN)
    expect(parsed).toMatchObject({ title: 'Zahnarzt', startTime: '14:00', location: 'Praxis' })
  })

  it('behandelt eine Zeile ohne unsere Block-Ref als neu', () => {
    expect(parseItemLine('- [ ] Neue Aufgabe (Arbeit)', KNOWN)).toMatchObject({
      id: null,
      title: 'Neue Aufgabe',
    })
    expect(parseItemLine('- [ ] Fremde Ref (Arbeit) ^meine-notiz', KNOWN)).toMatchObject({ id: null })
  })

  it('erkennt Nicht-Checkbox-Zeilen nicht als Eintrag', () => {
    expect(parseItemLine('Einfach nur Text')).toBeNull()
    expect(parseItemLine('- kein Kästchen')).toBeNull()
  })
})

describe('Wiederholungs-Token', () => {
  it('überlebt mehrere Wochentage byteidentisch', () => {
    const token = renderRecurrenceToken({
      frequency: 'weekly',
      weekdays: [5, 1, 3],
      dayOfMonth: null,
      intervalDays: null,
    })
    expect(token).toBe('wöchentlich:1,3,5')
    expect(parseRecurrenceToken(token)).toMatchObject({ frequency: 'weekly', weekdays: [1, 3, 5] })
  })

  it('lehnt Unsinn ab, statt still etwas zu erfinden', () => {
    expect(parseRecurrenceToken('wöchentlich:9')).toBeUndefined()
    expect(parseRecurrenceToken('irgendwann')).toBeUndefined()
    expect(parseRecurrenceToken('keine')).toBeNull()
  })
})

describe('Roundtrip render -> parse', () => {
  const snapshot = snapshotOf({
    tasks: [
      oneOff({ id: 'o1', title: 'Müll rausbringen', time: '08:15' }),
      recurring({
        id: 'r1',
        title: 'Zähne putzen',
        reminderTime: '07:30',
        frequency: 'weekly',
        weekdays: [1, TODAY_WEEKDAY],
      }),
      appointment({ id: 'a1', title: 'Zahnarzt', location: 'Praxis' }),
    ],
    taskCompletions: [completion({ id: 'c1', taskId: 'o1', completedDate: TODAY })],
    goals: [
      goal({
        id: 'g1',
        title: 'Marathon vorbereiten',
        target: 'Sub-3:30 laufen',
        targetDate: '2026-12-31',
        categoryId: CAT_ARBEIT.id,
        recurrence: {
          frequency: 'weekly',
          weekdays: [TODAY_WEEKDAY],
          dayOfMonth: null,
          intervalDays: null,
          anchorDate: '2026-01-05',
          reminderTime: '08:00',
          lastReminderFiredDate: null,
          stoppedAt: null,
        },
      }),
    ],
    subSteps: [subStep({ id: 's1', goalId: 'g1', title: 'Longrun 25 km' })],
  })

  it('Tagesdatei', () => {
    const parsed = parseDayFile(TODAY, renderDayFile(snapshot, TODAY), KNOWN)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.tasks.map((t) => [t.id, t.checked])).toEqual([
      ['o1', true],
      ['r1', false],
    ])
    expect(parsed.value.tasks[0]).toMatchObject({ startTime: '08:15', categoryName: 'Haushalt' })
    expect(parsed.value.appointments[0]).toMatchObject({
      id: 'a1',
      startTime: '14:00',
      endTime: '15:00',
      location: 'Praxis',
    })
    expect(parsed.value.goalCycles.map((g) => g.id)).toEqual(['g1'])
  })

  it('Ziel-Datei', () => {
    const parsed = parseGoalFile(renderGoalFile(snapshot, snapshot.goals[0]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value).toMatchObject({
      id: 'g1',
      title: 'Marathon vorbereiten',
      target: 'Sub-3:30 laufen',
      categoryName: 'Arbeit',
      targetDate: '2026-12-31',
      reminderTime: '08:00',
      recurrence: { frequency: 'weekly', weekdays: [TODAY_WEEKDAY] },
    })
    expect(parsed.value.subSteps.map((s) => s.id)).toEqual(['s1'])
  })

  it('Aufgaben.md', () => {
    const parsed = parseTasksFile(renderTasksFile(snapshot))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.rows).toEqual([
      {
        id: 'r1',
        title: 'Zähne putzen',
        categoryName: 'Arbeit',
        frequency: 'weekly',
        weekdays: [1, TODAY_WEEKDAY],
        time: null,
        reminderTime: '07:30',
      },
    ])
  })

  it('Kategorien.md', () => {
    const parsed = parseCategoriesFile(renderCategoriesFile(snapshot))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.rows).toEqual([
      { id: 'cat-arbeit', name: 'Arbeit', color: '#2a78d6' },
      { id: 'cat-haushalt', name: 'Haushalt', color: '#eda100' },
    ])
  })

  it('Ziel ohne Wiederholung und ohne Zieltext', () => {
    const plain = snapshotOf({ goals: [goal({ id: 'g9', title: 'Ohne alles', target: '' })] })
    const parsed = parseGoalFile(renderGoalFile(plain, plain.goals[0]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.recurrence).toBeNull()
    expect(parsed.value.target).toBe('')
    expect(parsed.value.categoryName).toBeNull()
  })
})

describe('Parse-Gate', () => {
  const dayFile = renderDayFile(snapshotOf({ tasks: [oneOff({ id: 'o1', title: 'A' })] }), TODAY)

  it('lehnt eine unlesbare Zeile im verwalteten Abschnitt ab', () => {
    const broken = dayFile.replace('## Termine', '## Termine\n\nirgendein Fließtext')
    expect(parseDayFile(TODAY, broken).ok).toBe(false)
  })

  it('lehnt einen unbekannten Abschnitt ab', () => {
    expect(parseDayFile(TODAY, `${dayFile}\n## Notizen\n\nText\n`).ok).toBe(false)
  })

  it('lehnt kaputtes Frontmatter ab', () => {
    expect(parseDayFile(TODAY, dayFile.replace('typ: questday-tag', 'typ questday-tag')).ok).toBe(false)
    expect(parseDayFile(TODAY, dayFile.replace(/^---\n/, '')).ok).toBe(false)
  })

  it('lehnt ein Datum ab, das nicht zum Dateinamen passt', () => {
    expect(parseDayFile('2026-08-07', dayFile).ok).toBe(false)
  })

  it('verkraftet CRLF und fehlenden Schluss-Newline', () => {
    const windowsStyle = dayFile.replace(/\n/g, '\r\n').replace(/\r\n$/, '')
    expect(parseDayFile(TODAY, windowsStyle).ok).toBe(true)
  })

  it('lehnt einen unbekannten Rhythmus in der Aufgaben-Tabelle ab', () => {
    const tasksFile = renderTasksFile(snapshotOf({ tasks: [recurring({ id: 'r1', title: 'X' })] }))
    expect(parseTasksFile(tasksFile.replace('| täglich |', '| manchmal |')).ok).toBe(false)
  })

  it('akzeptiert eine unbekannte Kategorie - aufgelöst wird erst im Import', () => {
    const tasksFile = renderTasksFile(snapshotOf({ tasks: [recurring({ id: 'r1', title: 'X' })] }))
    const parsed = parseTasksFile(tasksFile.replace('| Arbeit |', '| Gibtsnicht |'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.rows[0].categoryName).toBe('Gibtsnicht')
  })

  it('lehnt eine ungültige Farbe in Kategorien.md ab', () => {
    const file = renderCategoriesFile(snapshotOf({}))
    expect(parseCategoriesFile(file.replace('#2a78d6', 'blau')).ok).toBe(false)
  })
})
