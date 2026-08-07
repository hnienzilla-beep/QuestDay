export const WEEKDAY_NAMES = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
]

/**
 * Stabile Zuordnung zwischen App-Datensatz und Vault-Zeile. Listeneinträge bekommen eine
 * Obsidian-Block-ID (`^qd-<uuid>`, in der Lesenansicht unsichtbar und verlinkbar),
 * Überschriften einen Obsidian-Kommentar (`%%qd-<uuid>%%`) – dort ist keine Block-ID erlaubt.
 * Zeilen ohne Marker gelten beim Import als neu angelegt.
 */
const ID_PREFIX = 'qd-'

export function blockId(id: string): string {
  return ` ^${ID_PREFIX}${id}`
}

export function commentId(id: string): string {
  return ` %%${ID_PREFIX}${id}%%`
}

const BLOCK_ID_RE = new RegExp(`\\s*\\^${ID_PREFIX}([0-9a-fA-F-]+)\\s*$`)
const COMMENT_ID_RE = new RegExp(`\\s*%%${ID_PREFIX}([0-9a-fA-F-]+)%%\\s*$`)

/** Trennt einen Zeilen-Marker ab und liefert Resttext plus ID (null = neue Zeile). */
export function splitId(line: string): { text: string; id: string | null } {
  for (const re of [BLOCK_ID_RE, COMMENT_ID_RE]) {
    const match = line.match(re)
    if (match) return { text: line.slice(0, match.index).trimEnd(), id: match[1] }
  }
  return { text: line.trimEnd(), id: null }
}

/** Zeilenumbrüche entfernen, damit ein Titel eine Markdown-Listenzeile nicht zerreißt. */
export function cleanTitle(title: string): string {
  return title.replace(/\r?\n/g, ' ').trim()
}

/** Baut einen YAML-Frontmatter-Block; Werte werden 1:1 übernommen (nur Zahlen/Daten/Slugs). */
export function frontmatter(fields: Record<string, string | number>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`)
  return ['---', ...lines, '---', '', ''].join('\n')
}

/** Hängt einen Abschnitt an, wenn er Zeilen enthält – leere Abschnitte entfallen komplett. */
export function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) return []
  return [`## ${title}`, '', ...lines, '']
}
