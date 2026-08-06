/**
 * Kanonisierung für den Vault-Sync.
 *
 * Alles hier dient einem einzigen Zweck: identische Daten müssen auf jedem Gerät
 * byteweise identische Dateien ergeben. Sonst committen sich zwei Geräte gegenseitig
 * im Kreis. Deshalb hier niemals `localeCompare`, `Intl` oder `JSON.stringify` auf
 * einem Objekt, dessen Schlüsselreihenfolge nicht fest verdrahtet ist.
 */

/** Vergleicht nach UTF-16-Code-Units - im Gegensatz zu `localeCompare` auf jeder Engine gleich. */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** Vergleicht der Reihe nach mehrere Schlüssel; der erste Unterschied entscheidet. */
export function compareBy(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < a.length && i < b.length; i++) {
    const cmp = compareCodeUnits(a[i], b[i])
    if (cmp !== 0) return cmp
  }
  return 0
}

/**
 * Bereinigt einen Wert, der in eine Markdown-Zeile geschrieben wird: NFC (macOS-Obsidian
 * schreibt sonst NFD und erzeugt bei Umlauten andere Bytes), keine Zeilenumbrüche, getrimmt.
 */
export function cleanText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalisiert einen kompletten Dateiinhalt: NFC, LF, genau ein abschließender Newline. */
export function normalizeFileContent(content: string): string {
  const body = content.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  return body.length > 0 ? `${body}\n` : ''
}

/** Entfernt Zeichen, die eine Markdown-Tabellenzelle zerlegen würden. */
export function cleanTableCell(value: string): string {
  return cleanText(value).replace(/\|/g, '\\|')
}

export function uncleanTableCell(value: string): string {
  return value.replace(/\\\|/g, '|').trim()
}

export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue }

/**
 * JSON-Serialisierung mit sortierten Schlüsseln und fester Einrückung. `undefined` kommt hier
 * nicht vor (der Typ lässt es nicht zu) - genau das ist der Punkt: `JSON.stringify` würde
 * `undefined`-Felder still weglassen, und dann fehlt ein Feld auf einem Gerät, das auf dem
 * anderen `null` ist.
 */
export function canonicalJson(value: CanonicalValue): string {
  return `${stringify(value, '')}\n`
}

function stringify(value: CanonicalValue, indent: string): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => `${inner}${stringify(item, inner)}`)
    return `[\n${items.join(',\n')}\n${indent}]`
  }

  const record = value as { readonly [key: string]: CanonicalValue }
  const keys = Object.keys(record).sort(compareCodeUnits)
  if (keys.length === 0) return '{}'
  const entries = keys.map((key) => `${inner}${JSON.stringify(key)}: ${stringify(record[key], inner)}`)
  return `{\n${entries.join(',\n')}\n${indent}}`
}

const UMLAUT_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
  ß: 'ss',
}

/**
 * ASCII-Slug für Dateinamen. Umlaute werden ausgeschrieben statt nur entfernt, und alles
 * Nicht-ASCII fliegt raus - damit umgehen wir das NFC/NFD-Problem bei Dateinamen komplett
 * (APFS und Git sind sich dort uneinig).
 */
export function asciiSlug(title: string): string {
  const folded = title
    .normalize('NFC')
    .replace(/[äöüÄÖÜß]/g, (char) => UMLAUT_MAP[char])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const trimmed = folded.slice(0, 60).replace(/-+$/, '')
  return trimmed.length > 0 ? trimmed : 'ohne-titel'
}

/** Hängt `-2`, `-3`, ... an, bis der Slug frei ist. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
}
