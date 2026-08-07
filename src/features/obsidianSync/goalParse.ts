import { CATEGORIES, type Category } from '../../types/task'
import { splitId } from './markdown'

export interface ParsedStep {
  /** null = Zeile ohne Marker, also in Obsidian neu angelegt. */
  id: string | null
  done: boolean
  title: string
}

export interface ParsedGoal {
  /** null = Überschrift ohne Marker, also in Obsidian neu angelegt. */
  id: string | null
  title: string
  category: Category
  target: string
  targetDate: string | null
  steps: ParsedStep[]
}

const GOAL_HEADING_RE = /^###\s+(.*)$/
const SECTION_HEADING_RE = /^##\s+(.*)$/
const CHECKBOX_RE = /^\s*-\s+\[( |x|X)\]\s+(.*)$/
const FACT_RE = /^\s*-\s+([^:]+):\s*(.*)$/

function toCategory(value: string): Category {
  return CATEGORIES.find((c) => c === value.trim()) ?? 'Sonstiges'
}

function applyFact(goal: ParsedGoal, key: string, value: string): void {
  switch (key.trim()) {
    case 'Kategorie':
      goal.category = toCategory(value)
      break
    case 'Ziel':
      goal.target = value.trim()
      break
    case 'Zieldatum':
      goal.targetDate = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null
      break
    // Wiederholung, Zyklus-Status und Fortschritt sind abgeleitete Anzeigen und
    // werden bewusst nicht zurückgelesen – sie gehören der App.
  }
}

/**
 * Liest alle Ziel-Blöcke aus der Ziele-Datei. `null` heißt "nicht auswertbar"
 * (fehlende Überschrift) – dann wird der Import übersprungen.
 */
export function parseGoalFile(content: string): ParsedGoal[] | null {
  if (!/^#\s+Ziele\s*$/m.test(content)) return null

  const goals: ParsedGoal[] = []
  let current: ParsedGoal | null = null

  for (const rawLine of content.split('\n')) {
    const sectionHeading = rawLine.match(SECTION_HEADING_RE)
    if (sectionHeading) {
      current = null
      continue
    }

    const goalHeading = rawLine.match(GOAL_HEADING_RE)
    if (goalHeading) {
      const { text, id } = splitId(goalHeading[1])
      current = { id, title: text.trim(), category: 'Sonstiges', target: '', targetDate: null, steps: [] }
      if (current.title) goals.push(current)
      else current = null
      continue
    }

    if (!current) continue

    const checkbox = rawLine.match(CHECKBOX_RE)
    if (checkbox) {
      const { text, id } = splitId(checkbox[2])
      const title = text.trim()
      if (title) current.steps.push({ id, done: checkbox[1].toLowerCase() === 'x', title })
      continue
    }

    const fact = rawLine.match(FACT_RE)
    if (fact) applyFact(current, fact[1], fact[2])
  }

  return goals
}
