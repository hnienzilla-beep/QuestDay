export interface VaultDiff<T> {
  /** Zeilen ohne Marker – in Obsidian neu angelegt. */
  added: T[]
  /** Zeilen, deren Inhalt sich seit der Baseline geändert hat. */
  changed: { id: string; before: T; after: T }[]
  /** IDs, die in der Baseline standen und im Vault gelöscht wurden. */
  removedIds: string[]
}

/**
 * Vergleicht den Vault-Stand des letzten Syncs mit dem aktuellen. Nur so ist eine
 * Änderung in Obsidian von einem unveränderten alten Export unterscheidbar.
 */
export function diffById<T extends { id: string | null }>(
  baseline: T[],
  current: T[],
  isEqual: (a: T, b: T) => boolean,
): VaultDiff<T> {
  const baselineById = new Map<string, T>()
  for (const item of baseline) {
    if (item.id) baselineById.set(item.id, item)
  }

  const diff: VaultDiff<T> = { added: [], changed: [], removedIds: [] }
  const seen = new Set<string>()

  for (const item of current) {
    if (!item.id) {
      diff.added.push(item)
      continue
    }
    // Kopierte Zeilen tragen dieselbe Block-ID; nur die erste zählt.
    if (seen.has(item.id)) continue
    seen.add(item.id)

    const before = baselineById.get(item.id)
    // Unbekannte ID: gehört zu keinem Eintrag der Baseline – ignorieren statt raten.
    if (!before) continue
    if (!isEqual(before, item)) diff.changed.push({ id: item.id, before, after: item })
  }

  for (const id of baselineById.keys()) {
    if (!seen.has(id)) diff.removedIds.push(id)
  }

  return diff
}

function ms(iso: string | null): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * Konfliktregel: Hat die App den Eintrag seit dem letzten Sync nicht angefasst,
 * gewinnt der Vault. Haben beide Seiten geändert, gewinnt der jüngere Zeitstempel –
 * App-seitig `updatedAt`, Vault-seitig das Commit-Datum der Datei.
 */
export function vaultWins(
  appUpdatedAt: string | null,
  vaultModifiedAt: string | null,
  lastSyncAt: string | null,
): boolean {
  const app = ms(appUpdatedAt)
  if (app === null) return true

  const since = ms(lastSyncAt)
  if (since !== null && app <= since) return true

  const vault = ms(vaultModifiedAt)
  if (vault === null) return false
  return vault > app
}
