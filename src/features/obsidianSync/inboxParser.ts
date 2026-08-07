import { CATEGORIES, type Category } from '../../types/task'

/**
 * Parser für die Inbox-Datei im Obsidian-Vault. Jede offene Checkbox-Zeile wird zu
 * einer Aufgabe oder einem Ziel. Zeilen ohne Checkbox (Überschriften, Fließtext,
 * Frontmatter) werden ignoriert, abgehakte Zeilen ebenfalls.
 *
 * Syntax (Reihenfolge der Marker egal):
 *   - [ ] Titel #Kategorie @2026-08-10 !07:00
 *   - [ ] Zahnarzt #Sonstiges @morgen 14:30-15:30 ort:Praxis Müller
 *   - [ ] Vitamine #Haushalt täglich !08:00
 *   - [ ] Ziel: Vakuum #Hobby täglich !07:00
 *   - [ ] Ziel: Renovieren #Sonstiges bis:2026-12-31 > Streichen > Boden
 */

export const ARCHIVE_HEADING = '## Importiert'

const WEEKDAY_WORDS: Record<string, number> = {
  sonntags: 0,
  montags: 1,
  dienstags: 2,
  mittwochs: 3,
  donnerstags: 4,
  freitags: 5,
  samstags: 6,
}

export interface ParsedTaskEntry {
  kind: 'task'
  lineIndex: number
  sourceLine: string
  title: string
  category: Category
  taskType: 'oneoff' | 'recurring' | 'appointment'
  dueDate: string | null
  frequency: 'daily' | 'weekly' | null
  weekday: number | null
  date: string | null
  startTime: string | null
  endTime: string | null
  location: string | null
  reminderTime: string | null
}

export interface ParsedGoalEntry {
  kind: 'goal'
  lineIndex: number
  sourceLine: string
  title: string
  category: Category
  targetDate: string | null
  subStepTitles: string[]
  recurrence: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'custom'
    weekday: number | null
    dayOfMonth: number | null
    intervalDays: number | null
    reminderTime: string | null
  } | null
}

export type ParsedEntry = ParsedTaskEntry | ParsedGoalEntry

export interface ParseWarning {
  line: string
  reason: string
}

export interface ParsedInbox {
  entries: ParsedEntry[]
  warnings: ParseWarning[]
}

interface Tokens {
  category: Category | null
  date: string | null
  reminderTime: string | null
  startTime: string | null
  endTime: string | null
  location: string | null
  daily: boolean
  weekday: number | null
  monthly: boolean
  intervalDays: number | null
  targetDate: string | null
}

function padTime(time: string): string {
  const [hour, minute] = time.split(':')
  return `${hour.padStart(2, '0')}:${minute}`
}

function isValidTime(time: string): boolean {
  const [hour, minute] = time.split(':').map(Number)
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function resolveDate(raw: string, today: string): string | null {
  const lower = raw.toLowerCase()
  if (lower === 'heute') return today
  if (lower === 'morgen') {
    const next = new Date(`${today}T12:00:00`)
    next.setDate(next.getDate() + 1)
    return next.toISOString().slice(0, 10)
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

/** Zieht alle Marker aus der Zeile und gibt den verbleibenden Text als Titel zurück. */
function extractTokens(input: string, today: string): { rest: string; tokens: Tokens } {
  const tokens: Tokens = {
    category: null,
    date: null,
    reminderTime: null,
    startTime: null,
    endTime: null,
    location: null,
    daily: false,
    weekday: null,
    monthly: false,
    intervalDays: null,
    targetDate: null,
  }
  let rest = input

  const take = (pattern: RegExp, onMatch: (match: RegExpExecArray) => void): void => {
    const match = pattern.exec(rest)
    if (!match) return
    onMatch(match)
    rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`
  }

  // "ort:" zuerst, da es bis zum Zeilenende reicht und sonst andere Marker verschluckt.
  take(/(?:^|\s)ort:\s*(.+)$/i, (m) => {
    tokens.location = m[1].trim()
  })
  take(/(?:^|\s)bis:\s*(\d{4}-\d{2}-\d{2})(?=\s|$)/i, (m) => {
    tokens.targetDate = m[1]
  })
  take(/(?:^|\s)#([A-Za-zÄÖÜäöüß]+)(?=\s|$)/, (m) => {
    const found = CATEGORIES.find((c) => c.toLowerCase() === m[1].toLowerCase())
    tokens.category = found ?? null
  })
  take(/(?:^|\s)@([\wäöü-]+)(?=\s|$)/i, (m) => {
    tokens.date = resolveDate(m[1], today)
  })
  take(/(?:^|\s)!(\d{1,2}:\d{2})(?=\s|$)/, (m) => {
    if (isValidTime(m[1])) tokens.reminderTime = padTime(m[1])
  })
  take(/(?:^|\s)(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?(?=\s|$)/, (m) => {
    if (!isValidTime(m[1])) return
    tokens.startTime = padTime(m[1])
    if (m[2] && isValidTime(m[2])) tokens.endTime = padTime(m[2])
  })
  take(/(?:^|\s)(täglich|taeglich)(?=\s|$)/i, () => {
    tokens.daily = true
  })
  take(/(?:^|\s)(sonntags|montags|dienstags|mittwochs|donnerstags|freitags|samstags)(?=\s|$)/i, (m) => {
    tokens.weekday = WEEKDAY_WORDS[m[1].toLowerCase()]
  })
  take(/(?:^|\s)(monatlich)(?=\s|$)/i, () => {
    tokens.monthly = true
  })
  take(/(?:^|\s)alle\s+(\d+)\s+tage(?=\s|$)/i, (m) => {
    const days = Number(m[1])
    if (days >= 1) tokens.intervalDays = days
  })

  return { rest: rest.replace(/\s+/g, ' ').trim(), tokens }
}

function parseGoal(
  rest: string,
  tokens: Tokens,
  lineIndex: number,
  sourceLine: string,
): ParsedGoalEntry | ParseWarning {
  const parts = rest
    .split('>')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const title = parts[0] ?? ''
  if (!title) return { line: sourceLine, reason: 'Ziel ohne Titel' }

  let recurrence: ParsedGoalEntry['recurrence'] = null
  if (tokens.daily) {
    recurrence = { frequency: 'daily', weekday: null, dayOfMonth: null, intervalDays: null, reminderTime: tokens.reminderTime }
  } else if (tokens.weekday !== null) {
    recurrence = { frequency: 'weekly', weekday: tokens.weekday, dayOfMonth: null, intervalDays: null, reminderTime: tokens.reminderTime }
  } else if (tokens.monthly) {
    const dayOfMonth = tokens.date ? Number(tokens.date.slice(8, 10)) : new Date().getDate()
    recurrence = { frequency: 'monthly', weekday: null, dayOfMonth, intervalDays: null, reminderTime: tokens.reminderTime }
  } else if (tokens.intervalDays !== null) {
    recurrence = {
      frequency: 'custom',
      weekday: null,
      dayOfMonth: null,
      intervalDays: tokens.intervalDays,
      reminderTime: tokens.reminderTime,
    }
  }

  return {
    kind: 'goal',
    lineIndex,
    sourceLine,
    title,
    category: tokens.category ?? 'Sonstiges',
    targetDate: tokens.targetDate ?? tokens.date,
    subStepTitles: parts.slice(1),
    recurrence,
  }
}

function parseTask(
  rest: string,
  tokens: Tokens,
  lineIndex: number,
  sourceLine: string,
  today: string,
): ParsedTaskEntry | ParseWarning {
  const title = rest.replace(/\s*>\s*/g, ' ').trim()
  if (!title) return { line: sourceLine, reason: 'Aufgabe ohne Titel' }
  if (tokens.monthly || tokens.intervalDays !== null) {
    return {
      line: sourceLine,
      reason: 'Monatlich bzw. "alle X Tage" gibt es nur für Ziele – Zeile mit "Ziel:" beginnen',
    }
  }

  const base = {
    kind: 'task' as const,
    lineIndex,
    sourceLine,
    title,
    category: tokens.category ?? 'Sonstiges',
    reminderTime: tokens.reminderTime,
  }

  if (tokens.startTime) {
    return {
      ...base,
      taskType: 'appointment',
      dueDate: null,
      frequency: null,
      weekday: null,
      date: tokens.date ?? today,
      startTime: tokens.startTime,
      endTime: tokens.endTime,
      location: tokens.location,
    }
  }

  if (tokens.daily || tokens.weekday !== null) {
    return {
      ...base,
      taskType: 'recurring',
      dueDate: null,
      frequency: tokens.daily ? 'daily' : 'weekly',
      weekday: tokens.daily ? null : tokens.weekday,
      date: null,
      startTime: null,
      endTime: null,
      location: null,
    }
  }

  return {
    ...base,
    taskType: 'oneoff',
    dueDate: tokens.date,
    frequency: null,
    weekday: null,
    date: null,
    startTime: null,
    endTime: null,
    location: null,
  }
}

function isWarning(value: ParsedEntry | ParseWarning): value is ParseWarning {
  return 'reason' in value
}

/**
 * Parst die Zeilen oberhalb des Archiv-Abschnitts. `lines` ist die komplette
 * Datei; `lineIndex` in den Ergebnissen zeigt auf die Originalzeile.
 */
export function parseInboxLines(lines: string[], today: string): ParsedInbox {
  const entries: ParsedEntry[] = []
  const warnings: ParseWarning[] = []
  let inCodeBlock = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim().toLowerCase().startsWith(ARCHIVE_HEADING.toLowerCase())) break

    // Beispiele in Code-Blöcken (etwa in der Syntax-Hilfe) sind keine Aufgaben.
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = /^\s*[-*]\s*\[([ xX])\]\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    if (match[1] !== ' ') continue

    const body = match[2]
    const goalPrefix = /^ziel:\s*/i.exec(body)
    const { rest, tokens } = extractTokens(goalPrefix ? body.slice(goalPrefix[0].length) : body, today)

    if (tokens.category === null && /(?:^|\s)#[A-Za-zÄÖÜäöüß]+/.test(body)) {
      warnings.push({ line, reason: 'Unbekannte Kategorie – Sonstiges verwendet' })
    }

    const result = goalPrefix
      ? parseGoal(rest, tokens, index, line)
      : parseTask(rest, tokens, index, line, today)

    if (isWarning(result)) warnings.push(result)
    else entries.push(result)
  }

  return { entries, warnings }
}

/** Findet die Zeile, ab der der Archiv-Abschnitt beginnt (-1 = nicht vorhanden). */
export function archiveHeadingIndex(lines: string[]): number {
  return lines.findIndex((line) => line.trim().toLowerCase().startsWith(ARCHIVE_HEADING.toLowerCase()))
}

/**
 * Schreibt die Inbox neu: importierte Zeilen wandern abgehakt in den Abschnitt
 * "## Importiert" ans Dateiende, alles andere bleibt unverändert stehen.
 */
export function rewriteInbox(lines: string[], importedIndexes: number[], today: string): string {
  const imported = new Set(importedIndexes)
  const headingAt = archiveHeadingIndex(lines)
  const head = (headingAt === -1 ? lines : lines.slice(0, headingAt)).filter((_, i) => !imported.has(i))
  const archive = headingAt === -1 ? [] : lines.slice(headingAt + 1)

  const archivedLines = importedIndexes.map((index) => {
    const body = lines[index].replace(/^\s*[-*]\s*\[\s\]\s*/, '')
    return `- [x] ${today} · ${body.trim()}`
  })

  while (head.length > 0 && head[head.length - 1].trim() === '') head.pop()
  while (archive.length > 0 && archive[0].trim() === '') archive.shift()
  while (archive.length > 0 && archive[archive.length - 1].trim() === '') archive.pop()

  return [...head, '', ARCHIVE_HEADING, '', ...archive, ...archivedLines, ''].join('\n')
}
