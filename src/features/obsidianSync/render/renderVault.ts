import { asciiSlug } from '../canonical'
import { gitBlobShaOf } from '../gitSha'
import { dayFileDates } from '../model/dayScope'
import { canonicalizeSnapshot, type VaultSnapshot } from '../model/snapshot'
import { CATEGORIES_PATH, DATA_PATH, TASKS_PATH, dayPath, goalPath } from '../vaultPaths'
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
  /** Wird nicht mehr ausgewertet; siehe Begründung bei der Pfadvergabe unten. */
  _previousGoalPaths: Readonly<Record<string, string>> = {},
): RenderedVault {
  const snapshot = canonicalizeSnapshot(input)
  const files = new Map<string, string>()

  for (const dateStr of dayFileDates(snapshot)) {
    files.set(dayPath(dateStr), renderDayFile(snapshot, dateStr))
  }

  /**
   * Der Pfad eines Ziels ist eine reine Funktion seiner Daten - bewusst ohne den lokal
   * gemerkten Stand.
   *
   * Vorher entschied `previousGoalPaths` aus dem localStorage mit, und bei gleichnamigen
   * Zielen vergab `uniqueSlug` das Suffix nach Reihenfolge. Beides ist je Gerät verschieden:
   * Gerät A schrieb Ziel X nach `ziel.md` und Y nach `ziel-2.md`, Gerät B genau andersherum -
   * und jeder Abgleich schrieb beide Dateien in die eigene Zuordnung um. Von außen sah das
   * aus, als würde die App alles zurückschreiben, samt Konflikt-Sicherungen.
   *
   * Jetzt gilt: Ein eindeutiger Titel ergibt den Slug des Titels. Teilen sich mehrere Ziele
   * einen Slug, hängt jedes davon einen festen Teil seiner ID an - auf jedem Gerät dasselbe
   * Ergebnis, ohne Rücksicht auf Reihenfolge oder Vorgeschichte.
   */
  const goalPaths: Record<string, string> = {}
  const slugCount = new Map<string, number>()
  for (const goal of snapshot.goals) {
    const base = asciiSlug(goal.title)
    slugCount.set(base, (slugCount.get(base) ?? 0) + 1)
  }
  for (const goal of snapshot.goals) {
    const base = asciiSlug(goal.title)
    const slug = slugCount.get(base) === 1 ? base : `${base}-${goal.id.slice(0, 8)}`
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
