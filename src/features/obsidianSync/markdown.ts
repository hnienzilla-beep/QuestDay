export const WEEKDAY_NAMES = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
]

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
