import { cleanText } from './canonical'

/**
 * Minimales Frontmatter - absichtlich kein YAML.
 *
 * Es gibt genau eine Form: `schlüssel: wert` mit skalarem Wert. Titel und Freitext stehen
 * deshalb nie im Frontmatter, sondern immer im Rumpf: ein Titel mit `:` oder führendem `-`
 * würde einen naiven Parser zerlegen, und eine YAML-Bibliothek will dieses Projekt nicht
 * mitschleppen.
 */

export interface Frontmatter {
  fields: Record<string, string>
  body: string
}

export const NULL_TOKEN = 'null'

export function renderFrontmatter(fields: readonly (readonly [string, string])[]): string {
  const lines = fields.map(([key, value]) => `${key}: ${value}`)
  return `---\n${lines.join('\n')}\n---`
}

export function frontmatterValue(value: string | null): string {
  if (value === null) return NULL_TOKEN
  const clean = cleanText(value)
  return clean.length > 0 ? clean : NULL_TOKEN
}

export function parseFrontmatter(content: string): Frontmatter | null {
  if (!content.startsWith('---\n')) return null
  const end = content.indexOf('\n---', 3)
  if (end === -1) return null

  const block = content.slice(4, end + 1)
  const rest = content.slice(end + 4)
  const body = rest.startsWith('\n') ? rest.slice(1) : rest

  const fields: Record<string, string> = {}
  for (const line of block.split('\n')) {
    if (line.trim() === '') continue
    const separator = line.indexOf(':')
    if (separator === -1) return null
    const key = line.slice(0, separator).trim()
    if (!key) return null
    fields[key] = line.slice(separator + 1).trim()
  }
  return { fields, body }
}

/** Liest ein Feld; `null`/leer ergibt `null`. */
export function readOptional(fields: Record<string, string>, key: string): string | null {
  const raw = fields[key]
  if (raw === undefined) return null
  const value = raw.trim()
  if (value === '' || value === NULL_TOKEN) return null
  return value
}
