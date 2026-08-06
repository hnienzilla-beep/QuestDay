import { cleanText } from './canonical'

/**
 * Das Zeilenformat für alles Abhakbare:
 *
 *     - [x] 14:00-15:00 Zahnarzt (Gesundheit) @Praxis Dr. Meier ^qd-<id>
 *
 * Die ID hängt als Obsidian-Block-Ref am Zeilenende (im Lesemodus unsichtbar). Der Prefix
 * `qd-` trennt sie von Block-Refs, die der Nutzer selbst vergeben hat.
 *
 * Geparst wird von rechts nach links: erst die Block-Ref, dann - anhand der *letzten*
 * Klammergruppe - Ort und Kategorie, dann die Uhrzeit am Anfang. Dadurch sind Titel mit
 * Klammern, Klammerausdrücken oder `@` unproblematisch.
 *
 * Die Kategorie steht als **Name** in der Zeile, nicht als ID: Kategorien sind seit dem
 * Umbau frei anlegbar. Der Parser gibt den Namen unverändert zurück; aufgelöst wird er erst
 * im Import gegen die Kategorie-Tabelle.
 */

export const ID_PREFIX = 'qd-'

export interface ItemLine {
  id: string | null
  checked: boolean
  title: string
  /** Kategoriename, wie er in der Zeile stand - noch nicht aufgelöst. */
  categoryName: string | null
  startTime: string | null
  endTime: string | null
  location: string | null
}

export interface RenderItemLineInput {
  id: string
  checked: boolean
  title: string
  /** `null` = keine Kategorie oder (bei Teilschritten) nicht einzeln änderbar. */
  categoryName: string | null
  startTime?: string | null
  endTime?: string | null
  location?: string | null
}

export function renderItemLine(item: RenderItemLineInput): string {
  const box = item.checked ? '[x]' : '[ ]'
  const time = item.startTime ? `${item.startTime}${item.endTime ? `-${item.endTime}` : ''} ` : ''
  const title = cleanText(item.title) || '(ohne Titel)'
  const category = item.categoryName ? ` (${cleanText(item.categoryName)})` : ''
  const location = item.location ? ` @${cleanText(item.location)}` : ''
  return `- ${box} ${time}${title}${category}${location} ^${ID_PREFIX}${item.id}`
}

const CHECKBOX_RE = /^\s*-\s+\[([ xX])\]\s*(.*)$/
const BLOCK_REF_RE = /\s+\^([A-Za-z0-9-]+)\s*$/
const TIME_RE = /^(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?\s+/
// Gieriges `(.*)` vorne greift die *letzte* Klammergruppe, damit ein Titel wie
// "Antwort an (Chef) weiterleiten (Arbeit)" korrekt zerlegt wird. Die Gruppe selbst darf
// keine Klammern enthalten - sonst würde ein Titel, der auf ")" endet, falsch zerlegt.
const CATEGORY_RE = /^(.*)\(([^()]*)\)\s*(?:@(.*))?$/
// Ort ohne Kategorie: der *letzte* `@` gewinnt.
const LOCATION_ONLY_RE = /^(.*)\s+@([^@]*)$/

/**
 * Gibt `null` zurück, wenn die Zeile keine Checkbox-Zeile ist (dann greift das Parse-Gate).
 *
 * `knownCategoryNames` entscheidet, ob eine Klammer am Zeilenende eine Kategorie ist. Ohne
 * diese Prüfung würde `- [ ] Einkaufen (Milch, Brot)` als Kategorie "Milch, Brot" gelesen -
 * und der Klammertext beim nächsten Schreiben verschwinden. Seit Kategorien frei benannt
 * werden, ist die Liste der gültigen Namen die einzige verlässliche Unterscheidung.
 */
export function parseItemLine(
  line: string,
  knownCategoryNames: ReadonlySet<string> = new Set(),
): ItemLine | null {
  const checkboxMatch = CHECKBOX_RE.exec(line)
  if (!checkboxMatch) return null

  const checked = checkboxMatch[1].toLowerCase() === 'x'
  let rest = checkboxMatch[2]

  let id: string | null = null
  const refMatch = BLOCK_REF_RE.exec(rest)
  if (refMatch) {
    // Block-Refs ohne unser Prefix stammen vom Nutzer; die Zeile gilt dann als neu.
    if (refMatch[1].startsWith(ID_PREFIX)) {
      id = refMatch[1].slice(ID_PREFIX.length)
      rest = rest.slice(0, refMatch.index)
    }
  }

  let categoryName: string | null = null
  let location: string | null = null

  const categoryMatch = CATEGORY_RE.exec(rest.trim())
  const candidate = categoryMatch ? cleanText(categoryMatch[2]) : ''
  if (categoryMatch && candidate && knownCategoryNames.has(candidate)) {
    rest = categoryMatch[1]
    categoryName = candidate
    const rawLocation = categoryMatch[3]?.trim()
    location = rawLocation ? cleanText(rawLocation) : null
  } else {
    // Keine (bekannte) Kategorie - die Klammer bleibt Teil des Titels, nur der Ort wird
    // noch abgetrennt.
    const locationMatch = LOCATION_ONLY_RE.exec(rest.trim())
    if (locationMatch) {
      rest = locationMatch[1]
      const rawLocation = locationMatch[2].trim()
      location = rawLocation ? cleanText(rawLocation) : null
    }
  }

  let startTime: string | null = null
  let endTime: string | null = null
  const timeMatch = TIME_RE.exec(rest.trim())
  if (timeMatch) {
    startTime = timeMatch[1]
    endTime = timeMatch[2] ?? null
    rest = rest.trim().slice(timeMatch[0].length)
  }

  const title = cleanText(rest)
  if (!title) return null

  return { id, checked, title, categoryName, startTime, endTime, location }
}
