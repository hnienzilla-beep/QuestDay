import { cleanText, normalizeFileContent, uncleanTableCell } from '../canonical'
import { parseFrontmatter, readOptional } from '../frontmatter'
import { parseItemLine, type ItemLine } from '../lineFormat'
import { parseRecurrenceToken, parseTaskRecurrenceToken, type ParsedRecurrence } from '../recurrenceFormat'
import {
  TYPE_CATEGORIES,
  TYPE_DAY,
  TYPE_GOAL,
  TYPE_TASKS,
  SUBSTEPS_HEADING,
} from '../render/renderMarkdown'

/**
 * Parser für alles, was aus dem Repo zurückkommt.
 *
 * Zwei Eigenschaften sind hier nicht verhandelbar:
 *
 * 1. **Total** - keine Funktion wirft. Ein Fehler ist ein Rückgabewert, weil ein geworfener
 *    Fehler mitten im Import einen halb angewandten Stand hinterlassen würde.
 * 2. **Parse-Gate** - eine Datei gilt nur dann als verstanden, wenn *jede* nicht-leere Zeile
 *    in einem verwalteten Abschnitt erkannt wurde. Nur dann darf sie Löschungen auslösen.
 *    Alles andere landet in Quarantäne: nichts anwenden, nichts löschen, Datei nicht
 *    überschreiben - die Notizen des Nutzers bleiben unangetastet.
 *
 * Kategorien tauchen hier nur als **Name** auf. Aufgelöst wird erst im Import gegen die
 * Kategorie-Tabelle; ein unbekannter Name ist deshalb kein Parse-Fehler.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string }

function fail<T>(reason: string): ParseResult<T> {
  return { ok: false, reason }
}

interface Section {
  heading: string
  lines: string[]
}

/** Zerlegt einen Rumpf in `## …`-Abschnitte; alles vor dem ersten Heading ist Vorspann. */
function splitSections(body: string): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = []
  const sections: Section[] = []
  let current: Section | null = null

  for (const rawLine of body.split('\n')) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(rawLine)
    if (headingMatch) {
      current = { heading: headingMatch[1], lines: [] }
      sections.push(current)
      continue
    }
    if (current) current.lines.push(rawLine)
    else preamble.push(rawLine)
  }
  return { preamble, sections }
}

/**
 * Liest die Einträge eines Abschnitts. Eine nicht-leere Zeile, die keine Checkbox-Zeile ist,
 * lässt das Parse-Gate zuschnappen - dann weiß der Importer, dass er den Abschnitt nicht
 * vollständig versteht und daraus keine Löschungen ableiten darf.
 */
function readItemSection(
  section: Section | undefined,
  categoryNames: ReadonlySet<string>,
): ParseResult<ItemLine[]> {
  if (!section) return { ok: true, value: [] }
  const items: ItemLine[] = []
  for (const line of section.lines) {
    if (line.trim() === '') continue
    const item = parseItemLine(line, categoryNames)
    if (!item) return fail(`unlesbare Zeile in "${section.heading}": ${line.trim().slice(0, 60)}`)
    items.push(item)
  }
  return { ok: true, value: items }
}

function sectionByHeading(sections: Section[], heading: string): Section | undefined {
  return sections.find((section) => section.heading === heading)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/
const CLEAR_TOKEN = '-'

// ---------------------------------------------------------------- Tagesdatei

export interface ParsedDayFile {
  dateStr: string
  tasks: ItemLine[]
  appointments: ItemLine[]
  goalCycles: ItemLine[]
}

export function parseDayFile(
  dateStrFromPath: string,
  content: string,
  categoryNames: ReadonlySet<string> = new Set(),
): ParseResult<ParsedDayFile> {
  const parsed = parseFrontmatter(normalizeFileContent(content))
  if (!parsed) return fail('Frontmatter fehlt oder ist unvollständig')
  if (parsed.fields.typ !== TYPE_DAY) return fail('keine QuestDay-Tagesdatei')
  if (parsed.fields.datum !== dateStrFromPath) {
    return fail(`Datum im Frontmatter (${parsed.fields.datum}) passt nicht zum Dateinamen`)
  }

  const { preamble, sections } = splitSections(parsed.body)
  if (preamble.some((line) => line.trim() !== '')) return fail('unerwarteter Text vor dem ersten Abschnitt')

  for (const section of sections) {
    if (!['Aufgaben', 'Termine', 'Ziele'].includes(section.heading)) {
      return fail(`unbekannter Abschnitt "${section.heading}"`)
    }
  }

  const tasks = readItemSection(sectionByHeading(sections, 'Aufgaben'), categoryNames)
  if (!tasks.ok) return tasks
  const appointments = readItemSection(sectionByHeading(sections, 'Termine'), categoryNames)
  if (!appointments.ok) return appointments
  const goalCycles = readItemSection(sectionByHeading(sections, 'Ziele'), categoryNames)
  if (!goalCycles.ok) return goalCycles

  return {
    ok: true,
    value: {
      dateStr: dateStrFromPath,
      tasks: tasks.value,
      appointments: appointments.value,
      goalCycles: goalCycles.value,
    },
  }
}

// ---------------------------------------------------------------- Ziel-Datei

export interface ParsedGoalFile {
  id: string
  title: string
  target: string
  categoryName: string | null
  targetDate: string | null
  recurrence: ParsedRecurrence | null
  reminderTime: string | null
  subSteps: ItemLine[]
}

// Die Kategorie eines Ziels steht im Frontmatter, nicht in einer Zeile - deshalb braucht
// dieser Parser die Namensliste nicht.
export function parseGoalFile(content: string): ParseResult<ParsedGoalFile> {
  const parsed = parseFrontmatter(normalizeFileContent(content))
  if (!parsed) return fail('Frontmatter fehlt oder ist unvollständig')
  if (parsed.fields.typ !== TYPE_GOAL) return fail('keine QuestDay-Ziel-Datei')

  const id = readOptional(parsed.fields, 'id')
  if (!id) return fail('Ziel-ID fehlt im Frontmatter')

  const categoryName = readOptional(parsed.fields, 'kategorie')

  const targetDate = readOptional(parsed.fields, 'zieldatum')
  if (targetDate !== null && !DATE_RE.test(targetDate)) return fail('zieldatum ist kein Datum')

  const recurrence = parseRecurrenceToken(parsed.fields.wiederholung ?? '')
  if (recurrence === undefined) return fail(`unbekannte Wiederholung "${parsed.fields.wiederholung}"`)

  const reminderTime = readOptional(parsed.fields, 'erinnerung')
  if (reminderTime !== null && !TIME_RE.test(reminderTime)) return fail('erinnerung ist keine Uhrzeit')

  const { preamble, sections } = splitSections(parsed.body)
  const titleLine = preamble.find((line) => line.startsWith('# '))
  if (!titleLine) return fail('Titel-Überschrift (# …) fehlt')
  const title = cleanText(titleLine.slice(2))
  if (!title) return fail('Titel ist leer')

  const targetLines = preamble
    .slice(preamble.indexOf(titleLine) + 1)
    .filter((line) => line.trim() !== '')
  const target = cleanText(targetLines.join(' ')).replace(/^_kein Zieltext_$/, '')

  for (const section of sections) {
    if (section.heading !== SUBSTEPS_HEADING) return fail(`unbekannter Abschnitt "${section.heading}"`)
  }
  // Teilschritte tragen nie eine Kategorie - eine Klammer dort gehört zum Titel.
  const subSteps = readItemSection(sectionByHeading(sections, SUBSTEPS_HEADING), new Set())
  if (!subSteps.ok) return subSteps

  return {
    ok: true,
    value: {
      id,
      title,
      target,
      categoryName,
      targetDate,
      recurrence,
      reminderTime,
      subSteps: subSteps.value,
    },
  }
}

// ------------------------------------------------------------- Tabellen

function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  return trimmed
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map(uncleanTableCell)
}

/** Liest die Datenzeilen einer Markdown-Tabelle (Kopf- und Trennzeile übersprungen). */
function readTableRows(body: string, columns: number): ParseResult<string[][]> {
  const rows: string[][] = []
  let seenHeader = false

  for (const line of body.split('\n')) {
    const cells = splitTableRow(line)
    if (!cells) continue
    if (!seenHeader) {
      seenHeader = true
      continue
    }
    if (cells.every((cell) => /^-{3,}$/.test(cell))) continue
    if (cells.length !== columns) {
      return fail(`Tabellenzeile mit ${cells.length} statt ${columns} Spalten`)
    }
    rows.push(cells)
  }

  if (!seenHeader) return fail('Tabelle fehlt')
  return { ok: true, value: rows }
}

// ------------------------------------------------------------- Aufgaben.md

export interface ParsedTaskRow {
  id: string
  /** `null` = Zelle war leer, Wert bleibt unverändert. */
  title: string | null
  /** `null` = unverändert, `''` = ausdrücklich entfernt (Zelle enthielt `-`). */
  categoryName: string | null | ''
  frequency: 'daily' | 'weekly' | null
  weekdays: number[]
  time: string | null | ''
  reminderTime: string | null | ''
}

export interface ParsedTasksFile {
  rows: ParsedTaskRow[]
}

/** `undefined` = ungültige Uhrzeit; `null` = unverändert; `''` = löschen. */
function readOptionalTimeCell(raw: string): string | null | '' | undefined {
  const cell = raw.trim()
  if (cell === CLEAR_TOKEN) return ''
  if (cell === '') return null
  return TIME_RE.test(cell) ? cell : undefined
}

export function parseTasksFile(content: string): ParseResult<ParsedTasksFile> {
  const parsed = parseFrontmatter(normalizeFileContent(content))
  if (!parsed) return fail('Frontmatter fehlt oder ist unvollständig')
  if (parsed.fields.typ !== TYPE_TASKS) return fail('keine QuestDay-Aufgabendatei')

  const table = readTableRows(parsed.body, 6)
  if (!table.ok) return table

  const rows: ParsedTaskRow[] = []
  for (const [rawTitle, rawCategory, rawRhythm, rawTime, rawReminder, rawId] of table.value) {
    const id = rawId.trim()
    // Eine Zeile ohne ID ist ein Neuanlage-Versuch - über Aufgaben.md nicht vorgesehen,
    // aber auch kein Fehler: sie wird beim nächsten Schreiben schlicht entfernt.
    if (!id) continue

    let frequency: 'daily' | 'weekly' | null = null
    let weekdays: number[] = []
    if (rawRhythm.trim() !== '') {
      const rhythm = parseTaskRecurrenceToken(rawRhythm)
      if (!rhythm) return fail(`unbekannter Rhythmus "${rawRhythm.trim()}"`)
      frequency = rhythm.frequency
      weekdays = rhythm.weekdays
    }

    const time = readOptionalTimeCell(rawTime)
    if (time === undefined) return fail(`"${rawTime.trim()}" ist keine Uhrzeit`)
    const reminderTime = readOptionalTimeCell(rawReminder)
    if (reminderTime === undefined) return fail(`"${rawReminder.trim()}" ist keine Uhrzeit`)

    const categoryCell = rawCategory.trim()
    rows.push({
      id,
      title: rawTitle.trim() === '' ? null : cleanText(rawTitle),
      categoryName: categoryCell === CLEAR_TOKEN ? '' : categoryCell === '' ? null : cleanText(rawCategory),
      frequency,
      weekdays,
      time,
      reminderTime,
    })
  }

  return { ok: true, value: { rows } }
}

// ----------------------------------------------------------- Kategorien.md

export interface ParsedCategoryRow {
  /** `null` = Zeile ohne ID -> neue Kategorie. */
  id: string | null
  name: string | null
  color: string | null
}

export interface ParsedCategoriesFile {
  rows: ParsedCategoryRow[]
}

export function parseCategoriesFile(content: string): ParseResult<ParsedCategoriesFile> {
  const parsed = parseFrontmatter(normalizeFileContent(content))
  if (!parsed) return fail('Frontmatter fehlt oder ist unvollständig')
  if (parsed.fields.typ !== TYPE_CATEGORIES) return fail('keine QuestDay-Kategoriendatei')

  const table = readTableRows(parsed.body, 3)
  if (!table.ok) return table

  const rows: ParsedCategoryRow[] = []
  for (const [rawName, rawColor, rawId] of table.value) {
    const id = rawId.trim() || null
    const name = rawName.trim() === '' ? null : cleanText(rawName)
    const colorCell = rawColor.trim()
    if (colorCell !== '' && !COLOR_RE.test(colorCell)) {
      return fail(`"${colorCell}" ist keine Farbe (erwartet z. B. #4f6df5)`)
    }
    // Eine völlig leere Zeile ist kein Eintrag.
    if (!id && !name) continue
    rows.push({ id, name, color: colorCell || null })
  }

  return { ok: true, value: { rows } }
}
