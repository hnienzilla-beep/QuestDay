import { CATEGORIES, type Category } from '../../types/task'
import { splitId, WEEKDAY_NAMES } from './markdown'

/** Eine Checkbox-Zeile aus `20-Todos/To-dos.md`, so wie sie im Vault steht. */
export interface ParsedTodo {
  /** null = Zeile ohne Marker, also in Obsidian neu angelegt. */
  id: string | null
  done: boolean
  title: string
  category: Category
  dueDate: string | null
  startTime: string | null
  endTime: string | null
  location: string | null
  frequency: 'daily' | 'weekly' | null
  weekday: number | null
}

const CHECKBOX_RE = /^\s*-\s+\[( |x|X)\]\s+(.*)$/
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/
const DONE_DATE_RE = /✅\s*(\d{4}-\d{2}-\d{2})/
const TIME_RE = /🕘\s*(\d{1,2}:\d{2})(?:\s*[–-]\s*(\d{1,2}:\d{2}))?/
const PLACE_RE = /📍\s*(.+?)\s*$/
const REPEAT_RE = /🔁\s*(täglich|wöchentlich)(?:\s*\(([^)]+)\))?/
const CATEGORY_RE = /\(([^()]+)\)\s*(?=📅|🕘|📍|🔁|✅|$)/

function parseCategory(text: string): Category {
  const match = text.match(CATEGORY_RE)
  const found = match && CATEGORIES.find((c) => c === match[1].trim())
  return found ?? 'Sonstiges'
}

/** Titel = Zeile ohne Kategorie und ohne alle Emoji-Metadaten. */
function parseTitle(text: string): string {
  return text
    .replace(CATEGORY_RE, '')
    .replace(DUE_RE, '')
    .replace(DONE_DATE_RE, '')
    .replace(TIME_RE, '')
    .replace(REPEAT_RE, '')
    .replace(/📍.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseLine(rawLine: string): ParsedTodo | null {
  const match = rawLine.match(CHECKBOX_RE)
  if (!match) return null

  const { text, id } = splitId(match[2])
  const repeat = text.match(REPEAT_RE)
  const time = text.match(TIME_RE)
  // 📍 steht immer am Zeilenende, deshalb erst nach dem Abtrennen der ID auswerten.
  const place = text.match(PLACE_RE)

  let frequency: 'daily' | 'weekly' | null = null
  let weekday: number | null = null
  if (repeat) {
    frequency = repeat[1] === 'täglich' ? 'daily' : 'weekly'
    if (repeat[2]) {
      const index = WEEKDAY_NAMES.indexOf(repeat[2].trim())
      weekday = index === -1 ? null : index
    }
  }

  return {
    id,
    done: match[1].toLowerCase() === 'x',
    title: parseTitle(text),
    category: parseCategory(text),
    dueDate: text.match(DUE_RE)?.[1] ?? null,
    startTime: time?.[1] ?? null,
    endTime: time?.[2] ?? null,
    location: place?.[1]?.trim() ?? null,
    frequency,
    weekday,
  }
}

/**
 * Liest alle Checkbox-Zeilen aus der To-do-Datei. `null` heißt "nicht auswertbar"
 * (fehlende Überschrift) – dann wird der Import übersprungen, statt auf Basis
 * eines kaputten Parses Daten zu löschen.
 */
export function parseTodoFile(content: string): ParsedTodo[] | null {
  if (!/^#\s+To-dos\s*$/m.test(content)) return null
  return content
    .split('\n')
    .map(parseLine)
    .filter((item): item is ParsedTodo => item !== null && item.title.length > 0)
}
