import { asciiSlug, uniqueSlug } from '../canonical'
import { gitBlobShaOf } from '../gitSha'
import { dayFileDates } from '../model/dayScope'
import { canonicalizeSnapshot, type VaultSnapshot } from '../model/snapshot'
import { CATEGORIES_PATH, DATA_PATH, TASKS_PATH, dayPath, goalPath, goalSlugOf } from '../vaultPaths'
import {
  renderCategoriesFile,
  renderDayFile,
  renderGoalFile,
  renderTasksFile,
} from './renderMarkdown'
import { renderDataJson } from './renderDataJson'

export interface RenderedVault {
  files: Map<string, string>
  /** Ziel-ID -> Pfad. Wird als Sync-Zustand behalten, damit ein Umbenennen in Obsidian keine Dublette erzeugt. */
  goalPaths: Record<string, string>
}

/**
 * Baut den kompletten Soll-Zustand des Vaults aus einem Snapshot.
 *
 * Ziel-Dateipfade sind klebrig: einmal vergeben, bleibt der Pfad, auch wenn sich der Titel
 * ändert oder die Datei in Obsidian umbenannt wurde. Sonst entstünde bei jeder Titeländerung
 * eine neue Datei neben der alten.
 */
export function renderVault(
  input: VaultSnapshot,
  previousGoalPaths: Readonly<Record<string, string>>,
): RenderedVault {
  const snapshot = canonicalizeSnapshot(input)
  const files = new Map<string, string>()

  for (const dateStr of dayFileDates(snapshot)) {
    files.set(dayPath(dateStr), renderDayFile(snapshot, dateStr))
  }

  const goalPaths: Record<string, string> = {}
  const takenSlugs = new Set<string>()

  // Erst die bereits bekannten Pfade festhalten, damit neue Ziele nicht in einen belegten
  // Slug laufen; die Reihenfolge ist durch die Snapshot-Sortierung deterministisch.
  for (const goal of snapshot.goals) {
    const known = previousGoalPaths[goal.id]
    const knownSlug = known ? goalSlugOf(known) : null
    if (knownSlug && !takenSlugs.has(knownSlug)) {
      goalPaths[goal.id] = goalPath(knownSlug)
      takenSlugs.add(knownSlug)
    }
  }
  for (const goal of snapshot.goals) {
    if (goalPaths[goal.id]) continue
    const slug = uniqueSlug(asciiSlug(goal.title), takenSlugs)
    takenSlugs.add(slug)
    goalPaths[goal.id] = goalPath(slug)
  }

  for (const goal of snapshot.goals) {
    files.set(goalPaths[goal.id], renderGoalFile(snapshot, goal))
  }

  files.set(TASKS_PATH, renderTasksFile(snapshot))
  files.set(CATEGORIES_PATH, renderCategoriesFile(snapshot))
  files.set(DATA_PATH, renderDataJson(snapshot))

  return { files, goalPaths }
}

export async function shaVault(vault: RenderedVault): Promise<Map<string, string>> {
  const paths = [...vault.files.keys()].sort()
  const shas = await Promise.all(paths.map((path) => gitBlobShaOf(vault.files.get(path)!)))
  return new Map(paths.map((path, index) => [path, shas[index]]))
}
