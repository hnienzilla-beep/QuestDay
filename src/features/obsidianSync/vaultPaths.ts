/**
 * Pfade im Vault-Repo. Der Sync fasst ausschließlich Pfade unter `QuestDay/` an, und auch
 * dort nur solche, die `classifyPath` als verwaltet erkennt. Alles andere im Repo - inklusive
 * eigener Notizen unter `QuestDay/Ziele/` - bleibt unberührt.
 */

export const PREFIX = 'QuestDay'
export const DAYS_DIR = `${PREFIX}/Tage`
export const GOALS_DIR = `${PREFIX}/Ziele`
export const TASKS_PATH = `${PREFIX}/Aufgaben.md`
export const CATEGORIES_PATH = `${PREFIX}/Kategorien.md`
/** Einmalige Aufgaben ohne Datum. Ohne eigene Datei stünde ihr Zustand nirgends im Markdown. */
export const UNPLANNED_PATH = `${PREFIX}/Ungeplant.md`
export const DATA_PATH = `${PREFIX}/questday-data.json`
export const CONFLICTS_DIR = `${PREFIX}/_Konflikte`

/** Aus dem Einbahn-Export der Vorversion; wird nicht mehr geschrieben, nur auf Wunsch gelöscht. */
export const LEGACY_DIR = '10-Quests'

export type ManagedKind = 'day' | 'goal' | 'tasks' | 'categories' | 'unplanned' | 'data'

export interface ClassifiedPath {
  kind: ManagedKind
  /** nur bei `kind === 'day'` */
  dateStr?: string
}

const DAY_PATH_RE = new RegExp(`^${DAYS_DIR}/(\\d{4}-\\d{2}-\\d{2})\\.md$`)
const GOAL_PATH_RE = new RegExp(`^${GOALS_DIR}/[^/]+\\.md$`)

export function dayPath(dateStr: string): string {
  return `${DAYS_DIR}/${dateStr}.md`
}

export function goalPath(slug: string): string {
  return `${GOALS_DIR}/${slug}.md`
}

export function goalSlugOf(path: string): string | null {
  if (!GOAL_PATH_RE.test(path)) return null
  return path.slice(GOALS_DIR.length + 1, -'.md'.length)
}

/**
 * Erkennt einen Pfad als verwaltet. Für Ziel-Dateien ist das nur der halbe Test - ob eine
 * Datei wirklich zu QuestDay gehört, entscheidet zusätzlich das `typ:`-Frontmatter, das erst
 * beim Parsen sichtbar ist.
 */
export function classifyPath(path: string): ClassifiedPath | null {
  if (path === UNPLANNED_PATH) return { kind: 'unplanned' }
  const dayMatch = DAY_PATH_RE.exec(path)
  if (dayMatch) return { kind: 'day', dateStr: dayMatch[1] }
  if (GOAL_PATH_RE.test(path)) return { kind: 'goal' }
  if (path === TASKS_PATH) return { kind: 'tasks' }
  if (path === CATEGORIES_PATH) return { kind: 'categories' }
  if (path === DATA_PATH) return { kind: 'data' }
  return null
}

export function isUnderPrefix(path: string): boolean {
  return path === PREFIX || path.startsWith(`${PREFIX}/`)
}

export function conflictPath(originalPath: string, stamp: string): string {
  const flattened = originalPath.slice(PREFIX.length + 1).replace(/\//g, '_')
  return `${CONFLICTS_DIR}/${stamp}-${flattened}`
}
