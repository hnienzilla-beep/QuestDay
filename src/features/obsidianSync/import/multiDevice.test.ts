import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../../db/db'
import { applyDayFile, applyGoalFile } from './applyFiles'
import { parseDayFile, parseGoalFile } from '../parse/parseFiles'
import { CATEGORIES, TODAY } from '../../../test/fixtures'

/**
 * Was passiert, wenn dieselbe Datei auf mehreren Geräten ankommt.
 *
 * Genau hier entstanden die doppelten Checklistenschritte: Jedes Gerät vergab beim Lesen
 * einer ihm unbekannten Zeile eine frische Zufalls-ID, schrieb sie zurück, das andere Gerät
 * las sie wieder als unbekannt - und legte erneut an.
 */

async function frischesGeraet() {
  await Promise.all([
    db.tasks.clear(),
    db.taskCompletions.clear(),
    db.goals.clear(),
    db.subSteps.clear(),
    db.goalCycleCompletions.clear(),
    db.subStepCycleCompletions.clear(),
    db.categories.clear(),
  ])
  await db.categories.bulkPut(CATEGORIES)
}

/** Ziel-Datei mit 30 Teilschritten - über der Grenze von zehn Löschungen je Datei. */
function zielDatei(schritte: string[], mitAnkern: boolean): string {
  const zeilen = schritte.map((titel, i) =>
    mitAnkern ? `- [ ] ${titel} ^qd-fremd-${i}` : `- [ ] ${titel}`,
  )
  return [
    '---',
    'typ: questday-ziel',
    'id: ziel-1',
    'kategorie: null',
    'erstellt: 2026-08-13',
    'zieldatum: null',
    'wiederholung: keine',
    '---',
    '',
    '# Hochzeit Packliste',
    '',
    'Alles einpacken.',
    '',
    '## Teilschritte',
    '',
    ...zeilen,
    '',
  ].join('\n')
}

async function anwenden(inhalt: string) {
  const parsed = parseGoalFile(inhalt)
  if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
  return applyGoalFile(parsed.value, TODAY)
}

const DREISSIG = Array.from({ length: 30 }, (_, i) => `Schritt ${i + 1}`)

describe('Abgleich über mehrere Geräte', () => {
  beforeEach(frischesGeraet)

  it('übernimmt die Anker eines anderen Geräts, statt eigene IDs zu vergeben', async () => {
    await anwenden(zielDatei(['Anzug einpacken', 'Hotel bestätigen'], true))

    const ids = (await db.subSteps.toArray()).map((s) => s.id).sort()
    expect(ids).toEqual(['fremd-0', 'fremd-1'])
  })

  it('verdoppelt 30 Teilschritte auch beim zweiten Lauf nicht', async () => {
    // Der gemeldete Fall: über zehn Einträge greift die Löschregel nicht mehr, ein zweiter
    // Satz eigener IDs wäre also dauerhaft stehen geblieben.
    const datei = zielDatei(DREISSIG, true)
    await anwenden(datei)
    await anwenden(datei)

    expect(await db.subSteps.count()).toBe(30)
  })

  it('kommt bei einer Datei ohne Anker auf beiden Geräten zu denselben IDs', async () => {
    const datei = zielDatei(['Anzug einpacken', 'Hotel bestätigen'], false)

    await anwenden(datei)
    const geraetA = (await db.subSteps.toArray()).map((s) => s.id).sort()

    await frischesGeraet()
    await anwenden(datei)
    const geraetB = (await db.subSteps.toArray()).map((s) => s.id).sort()

    expect(geraetB).toEqual(geraetA)
  })

  it('vergibt für gleichlautende Zeilen trotzdem verschiedene IDs', async () => {
    await anwenden(zielDatei(['Einpacken', 'Einpacken'], false))
    const ids = (await db.subSteps.toArray()).map((s) => s.id)

    expect(new Set(ids).size).toBe(2)
    expect(await db.subSteps.count()).toBe(2)
  })

  it('erzeugt IDs, die als Obsidian-Block-Anker zulässig sind', async () => {
    await anwenden(zielDatei(['Anzug & Hemd aufhängen (wichtig!)'], false))
    const id = (await db.subSteps.toArray())[0].id

    // Nur Buchstaben, Ziffern und Bindestriche - sonst wäre der Anker unlesbar und die
    // Zeile käme beim nächsten Lesen ohne ID zurück.
    expect(id).toMatch(/^[A-Za-z0-9-]+$/)
  })

  it('legt aus einer Tageszeile ohne Anker auf beiden Geräten dieselbe Aufgabe an', async () => {
    const datei = [
      '---',
      'typ: questday-tag',
      `datum: ${TODAY}`,
      '---',
      '',
      '## Aufgaben',
      '',
      '- [ ] 09:00 Koffer packen',
      '',
      '## Termine',
      '',
      '## Ziele',
    ].join('\n')

    const anwendenTag = async () => {
      const parsed = parseDayFile(TODAY, datei, new Set())
      if (!parsed.ok) throw new Error(`Parse-Gate: ${parsed.reason}`)
      return applyDayFile(parsed.value)
    }

    await anwendenTag()
    const geraetA = (await db.tasks.toArray()).map((t) => t.id)

    await frischesGeraet()
    await anwendenTag()
    const geraetB = (await db.tasks.toArray()).map((t) => t.id)

    expect(geraetB).toEqual(geraetA)
  })
})
