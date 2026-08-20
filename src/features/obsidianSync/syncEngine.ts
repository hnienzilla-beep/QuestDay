import { db } from '../../db/db'
import { todayISODate } from '../../utils/dateUtils'
import { cleanText } from './canonical'
import {
  ObsidianSyncError,
  fetchBlobText,
  getHeadCommitSha,
  listTree,
  pushCommit,
  requireSettings,
  type TreeMutation,
} from './githubApi'
import { gitBlobShaOf } from './gitSha'
import {
  applyCategoriesFile,
  applyDayFile,
  applyGoalFile,
  applyTasksFile,
  applyUnplannedFile,
  emptyOutcome,
  mergeOutcomes,
  type ImportOutcome,
} from './import/applyFiles'
import {
  bootstrapFromJson,
  isDatabaseEmpty,
  mergeAdditiveFromJson,
  parseDataJson,
} from './import/importJson'
import { loadSnapshot } from './model/snapshot'
import {
  parseCategoriesFile,
  parseDayFile,
  parseGoalFile,
  parseTasksFile,
  parseUnplannedFile,
} from './parse/parseFiles'
import { renderVault, shaVault } from './render/renderVault'
import { repoKeyOf } from './settings'
import { commitSyncState, loadSyncState, type SyncState } from './syncState'
import { CONFLICTS_DIR, DATA_PATH, LEGACY_DIR, classifyPath, conflictPath, isUnderPrefix } from './vaultPaths'

/**
 * Der Abgleich selbst.
 *
 * Ablauf eines Laufs:
 *
 *  1. **Eine Anfrage** listet den kompletten Baum mit Blob-SHAs (mit `If-None-Match`;
 *     ein 304 zählt nicht gegen das Rate-Limit).
 *  2. Der lokale Stand wird gerendert und je Datei die Git-Blob-SHA *lokal* berechnet -
 *     das kostet nichts und macht beide Seiten direkt vergleichbar.
 *  3. Ein Drei-Wege-Vergleich je Pfad entscheidet, was zu tun ist. Alles, was auf beiden
 *     Seiten unverändert ist, wird nicht einmal geladen.
 *  4. Erst importieren (das Repo gewinnt), dann neu rendern, dann alles in **einen**
 *     Commit schreiben.
 *
 * Nichts geändert = 1 Anfrage, kein Commit.
 */

export interface SyncResult {
  requests: number
  imported: number
  deleted: number
  pushed: number
  commitSha: string | null
  quarantined: string[]
  warnings: string[]
}

/** Höchstzahl der pro Lauf geladenen Dateien; der Rest kommt in den Folgeläufen nach. */
const MAX_BLOB_FETCHES = 50
const MAX_PUSH_ATTEMPTS = 3
/** Mehr Vault-Dateien auf einmal zu löschen ist fast immer ein Unfall, kein Wunsch. */
const MAX_FILE_DELETES_PER_RUN = 20

function emptyResult(): SyncResult {
  return {
    requests: 0,
    imported: 0,
    deleted: 0,
    pushed: 0,
    commitSha: null,
    quarantined: [],
    warnings: [],
  }
}

export async function runSync(): Promise<SyncResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runSyncOnce()
    } catch (err) {
      // Ein fremder Push zwischen Auflisten und Schreiben: der Basis-Tree ist veraltet.
      // Forcen würde den fremden Commit stillschweigend zurückrollen - stattdessen läuft
      // alles noch einmal, und der fremde Stand wird regulär eingearbeitet.
      const isConflict = err instanceof ObsidianSyncError && err.kind === 'conflict'
      if (!isConflict || attempt >= MAX_PUSH_ATTEMPTS) throw err
    }
  }
}

async function runSyncOnce(): Promise<SyncResult> {
  const settings = requireSettings()
  const repoKey = repoKeyOf(settings)
  const state = loadSyncState(repoKey)
  const result = emptyResult()

  // --- 1. Die eine Anfrage -------------------------------------------------
  const listing = await listTree(settings, state.treeEtag)
  result.requests += 1
  if (listing.truncated) {
    throw new ObsidianSyncError(
      'Das Repo ist zu groß, um es in einem Zug aufzulisten. Bitte ein eigenes Vault-Repo verwenden.',
      'server',
    )
  }

  const remoteShas: Record<string, string> = listing.notModified
    ? { ...state.remoteShas }
    : Object.fromEntries(
        listing.entries.filter((entry) => isUnderPrefix(entry.path)).map((entry) => [entry.path, entry.sha]),
      )
  const etag = listing.notModified ? state.treeEtag : listing.etag

  // --- 2. Bootstrap eines neuen Geräts -------------------------------------
  const bootstrapped = await maybeBootstrap(settings, state, repoKey, remoteShas, result)

  // --- 3. Lokal rendern und vergleichen ------------------------------------
  let snapshot = await loadSnapshot(todayISODate())
  let rendered = renderVault(snapshot, state.goalPaths)
  let renderedShas = await shaVault(rendered)

  const quarantine = { ...state.quarantine }
  const agreedShas = bootstrapped ? { ...remoteShas } : { ...state.agreedShas }

  const toImport: string[] = []
  if (!bootstrapped) {
    for (const [path, remoteSha] of Object.entries(remoteShas)) {
      if (!classifyPath(path)) continue
      if (renderedShas.get(path) === remoteSha) continue // beide Seiten gleich
      if (agreedShas[path] === remoteSha) continue // nur lokal geändert -> nur pushen
      if (quarantine[path] === remoteSha) continue // schon als unlesbar bekannt
      toImport.push(path)
    }
    toImport.sort()
  }

  // --- 4. Import (das Repo gewinnt) ----------------------------------------
  const conflictBackups: TreeMutation[] = []
  /** Gelesene und verstandene Pfade - Grundlage der Prüfung auf Verwaistes weiter unten. */
  const appliedPaths: string[] = []
  if (toImport.length > 0) {
    const batch = toImport.slice(0, MAX_BLOB_FETCHES)
    if (toImport.length > batch.length) {
      result.warnings.push(
        `${toImport.length - batch.length} weitere geänderte Dateien folgen im nächsten Durchlauf.`,
      )
    }

    let outcome = emptyOutcome()
    for (const path of orderForImport(batch)) {
      const remoteSha = remoteShas[path]
      const content = await fetchBlobText(settings, remoteSha)
      result.requests += 1

      // Beidseitig geändert: "Repo gewinnt" verwirft hier die lokale Fassung. Sie wird
      // im selben Commit gesichert, damit das kein stiller Verlust ist.
      const localVersion = rendered.files.get(path)
      if (
        localVersion !== undefined &&
        agreedShas[path] !== undefined &&
        renderedShas.get(path) !== agreedShas[path]
      ) {
        conflictBackups.push({
          path: conflictPath(path, new Date().toISOString().replace(/[:.]/g, '-')),
          content: localVersion,
        })
      }

      const applied = await applyPath(path, content, snapshot.today)
      if (applied === null) {
        quarantine[path] = remoteSha
        result.quarantined.push(path)
        continue
      }
      delete quarantine[path]
      outcome = mergeOutcomes(outcome, applied)
      appliedPaths.push(path)
      // Erst wenn die Datei sauber verarbeitet wurde, gilt sie als abgeglichen.
      agreedShas[path] = remoteSha
    }

    result.imported = outcome.created + outcome.updated
    result.deleted = outcome.deleted
    result.warnings.push(...outcome.warnings)

    // Der Import hat die Datenbank verändert - neu rendern.
    snapshot = await loadSnapshot(todayISODate())
    rendered = renderVault(snapshot, rendered.goalPaths)
    renderedShas = await shaVault(rendered)
  }

  // --- 5. Push --------------------------------------------------------------
  const mutations: TreeMutation[] = [...conflictBackups]
  for (const [path, content] of rendered.files) {
    if (renderedShas.get(path) === remoteShas[path]) continue
    // Eine Datei in Quarantäne wird nicht überschrieben. "Das Repo gewinnt" heißt auch:
    // wenn wir sie nicht verstehen, fassen wir sie erst recht nicht an.
    if (path in quarantine && quarantine[path] === remoteShas[path]) continue
    mutations.push({ path, content })
  }

  // Eine Datei, die gerade eingelesen wurde und danach trotzdem in keinem gerenderten Pfad
  // auftaucht, gehört zu nichts, was die App kennt. Sie zu löschen hieße, fremde Inhalte
  // wegzuräumen, nur weil der Importer nichts damit anzufangen wusste - genau das hat
  // früher im Vault angelegte Ziele verschwinden lassen.
  const orphaned = new Set(appliedPaths.filter((path) => !rendered.files.has(path)))
  for (const path of orphaned) {
    // Bewusst nicht als abgeglichen merken: sonst liefe die Datei im nächsten Lauf ohne
    // erneutes Lesen direkt in die Löschregel unten.
    delete agreedShas[path]
  }

  const deletions: TreeMutation[] = []
  for (const path of Object.keys(remoteShas)) {
    if (rendered.files.has(path)) continue
    if (!classifyPath(path)) continue
    if (path.startsWith(`${CONFLICTS_DIR}/`)) continue
    if (orphaned.has(path)) continue
    // Nur löschen, wenn die Repo-Seite seit dem letzten Abgleich unverändert ist -
    // sonst hätte jemand die Datei gerade erst bearbeitet.
    if (remoteShas[path] !== agreedShas[path]) continue
    deletions.push({ path, content: null })
  }

  for (const path of orphaned) {
    result.warnings.push(
      `"${path}" gehört zu keinem Eintrag in der App - liegen gelassen. In Obsidian löschen, wenn die Datei weg soll.`,
    )
  }
  // Letzte Sicherung: eine leergeräumte lokale Datenbank (Browserdaten gelöscht, aber
  // localStorage überlebt) würde sonst das komplette Vault im Repo mitreißen.
  if (deletions.length > MAX_FILE_DELETES_PER_RUN) {
    result.warnings.push(
      `${deletions.length} Vault-Dateien würden gelöscht - übersprungen. Sind die lokalen Daten vollständig?`,
    )
  } else {
    mutations.push(...deletions)
  }

  /**
   * `questday-data.json` allein rechtfertigt keinen Commit.
   *
   * Die Datei ist ein Abzug für die Einrichtung eines neuen Geräts und enthält Felder, die
   * das Markdown gar nicht trägt - etwa Zeitstempel auf die Millisekunde. Zwei Geräte
   * unterscheiden sich darin zwangsläufig und können sich darüber auch nicht einigen: Der
   * Import der JSON ist bewusst nur additiv. Vorher schrieb deshalb jedes Gerät im Wechsel
   * seine Fassung - im Minutentakt, ohne dass sich inhaltlich etwas änderte.
   *
   * Sie wandert weiterhin mit, sobald es echte Änderungen gibt; sie löst nur keine mehr aus.
   */
  const nurAbzug =
    mutations.length > 0 && mutations.every((mutation) => mutation.path === DATA_PATH)
  if (nurAbzug && remoteShas[DATA_PATH] !== undefined) {
    mutations.length = 0
  }

  if (mutations.length > 0) {
    const headSha = await getHeadCommitSha(settings)
    result.requests += 1
    result.commitSha = await pushCommit(settings, headSha, mutations, commitMessageFor(mutations))
    result.requests += 3
    result.pushed = mutations.length

    for (const mutation of mutations) {
      if (mutation.content === null) delete agreedShas[mutation.path]
      else agreedShas[mutation.path] = await gitBlobShaOf(mutation.content)
    }
    for (const path of Object.keys(remoteShas)) {
      if (!(path in agreedShas) && rendered.files.has(path)) agreedShas[path] = remoteShas[path]
    }
  } else {
    for (const [path, sha] of Object.entries(remoteShas)) {
      if (renderedShas.get(path) === sha) agreedShas[path] = sha
    }
  }

  // --- 6. Zustand erst jetzt festschreiben, in einem Zug --------------------
  const nextState: SyncState = {
    ...state,
    repoKey,
    // Nach einem Push ist der gecachte Baum veraltet; der nächste Lauf holt ihn frisch.
    treeEtag: mutations.length > 0 ? null : etag,
    remoteShas: mutations.length > 0 ? {} : remoteShas,
    agreedShas,
    goalPaths: rendered.goalPaths,
    quarantine,
    bootstrappedFor: bootstrapped ? repoKey : state.bootstrappedFor,
    lastSyncAt: Date.now(),
    lastError: null,
    backoff: { failures: 0, nextAttemptAt: null },
  }
  commitSyncState(nextState)

  return result
}

async function categoryNames(): Promise<ReadonlySet<string>> {
  return new Set((await db.categories.toArray()).map((c) => cleanText(c.name)))
}

/** Stammdaten vor Verweisen: Kategorien, dann Aufgaben.md, dann Ziele, dann Tagesdateien. */
function orderForImport(paths: readonly string[]): string[] {
  const rank = (path: string) => {
    const kind = classifyPath(path)?.kind
    if (kind === 'categories') return 0
    if (kind === 'tasks') return 1
    if (kind === 'goal') return 2
    return 3
  }
  return [...paths].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
}

/** `null` = Datei nicht verstanden -> Quarantäne (nichts anwenden, nichts löschen). */
async function applyPath(path: string, content: string, today: string): Promise<ImportOutcome | null> {
  const classified = classifyPath(path)
  if (!classified) return null

  if (classified.kind === 'day') {
    // Frisch laden: Kategorien.md wird vor den Tagesdateien angewandt, neue Kategorien
    // sollen also schon zählen.
    const parsed = parseDayFile(classified.dateStr!, content, await categoryNames())
    return parsed.ok ? applyDayFile(parsed.value) : null
  }
  if (classified.kind === 'goal') {
    const parsed = parseGoalFile(content)
    return parsed.ok ? applyGoalFile(parsed.value, today) : null
  }
  if (classified.kind === 'tasks') {
    const parsed = parseTasksFile(content)
    return parsed.ok ? applyTasksFile(parsed.value) : null
  }
  if (classified.kind === 'unplanned') {
    const parsed = parseUnplannedFile(content, await categoryNames())
    return parsed.ok ? applyUnplannedFile(parsed.value) : null
  }
  if (classified.kind === 'categories') {
    const parsed = parseCategoriesFile(content)
    return parsed.ok ? applyCategoriesFile(parsed.value) : null
  }
  if (classified.kind === 'data') {
    // Im laufenden Betrieb nur additiv: die JSON legt Fehlendes an, ändert aber nichts.
    const parsed = parseDataJson(content)
    return parsed.ok ? mergeAdditiveFromJson(parsed.value) : null
  }
  return emptyOutcome()
}

async function maybeBootstrap(
  settings: ReturnType<typeof requireSettings>,
  state: SyncState,
  repoKey: string,
  remoteShas: Record<string, string>,
  result: SyncResult,
): Promise<boolean> {
  if (state.bootstrappedFor === repoKey) return false
  const dataSha = remoteShas[DATA_PATH]
  if (!dataSha) return false
  // Liegt im Repo genau die JSON, die dieses Gerät zuletzt geschrieben hat, gibt es daraus
  // nichts wiederherzustellen - sonst würde ein Gerät ohne Daten sich bei jedem Lauf aus
  // seinem eigenen leeren Abzug "bootstrappen".
  if (state.agreedShas[DATA_PATH] === dataSha) return false
  if (!(await isDatabaseEmpty())) return false

  const content = await fetchBlobText(settings, dataSha)
  result.requests += 1
  const parsed = parseDataJson(content)
  if (!parsed.ok) {
    result.warnings.push(`questday-data.json konnte nicht gelesen werden: ${parsed.reason}`)
    return false
  }

  const outcome = await bootstrapFromJson(parsed.value)
  result.imported += outcome.created
  return true
}

function commitMessageFor(mutations: readonly TreeMutation[]): string {
  const deleted = mutations.filter((m) => m.content === null).length
  const written = mutations.length - deleted
  const parts: string[] = []
  if (written > 0) parts.push(`${written} Datei${written === 1 ? '' : 'en'} aktualisiert`)
  if (deleted > 0) parts.push(`${deleted} gelöscht`)
  return `QuestDay-Sync: ${parts.join(', ')}`
}

/**
 * Ausdrücklicher Vollimport aus `questday-data.json` - für "dieses Gerät neu aufsetzen",
 * wenn die Datenbank nicht leer ist und der Bootstrap deshalb nicht greift.
 */
export async function runFullRestoreFromJson(): Promise<SyncResult> {
  const settings = requireSettings()
  const result = emptyResult()

  const listing = await listTree(settings, null)
  result.requests += 1
  const dataEntry = listing.entries.find((entry) => entry.path === DATA_PATH)
  if (!dataEntry) {
    throw new ObsidianSyncError('Im Repo liegt keine questday-data.json.', 'config')
  }

  const content = await fetchBlobText(settings, dataEntry.sha)
  result.requests += 1
  const parsed = parseDataJson(content)
  if (!parsed.ok) throw new ObsidianSyncError(parsed.reason, 'server')

  const outcome = await bootstrapFromJson(parsed.value)
  result.imported = outcome.created

  // Der gemerkte Abgleichstand passt danach nicht mehr - der nächste Lauf baut ihn neu auf.
  commitSyncState({
    ...loadSyncState(repoKeyOf(settings)),
    treeEtag: null,
    remoteShas: {},
    agreedShas: {},
    bootstrappedFor: repoKeyOf(settings),
  })
  return result
}

/** Räumt die Dateien des alten Einbahn-Exports weg - nur auf ausdrücklichen Wunsch. */
export async function removeLegacyQuestFiles(): Promise<SyncResult> {
  const settings = requireSettings()
  const result = emptyResult()

  const listing = await listTree(settings, null)
  result.requests += 1
  const legacyPaths = listing.entries
    .filter((entry) => entry.path.startsWith(`${LEGACY_DIR}/`))
    .map((entry) => entry.path)
  if (legacyPaths.length === 0) return result

  const headSha = await getHeadCommitSha(settings)
  result.requests += 1
  result.commitSha = await pushCommit(
    settings,
    headSha,
    legacyPaths.map((path) => ({ path, content: null })),
    `QuestDay-Sync: ${legacyPaths.length} alte ${LEGACY_DIR}-Dateien entfernt`,
  )
  result.requests += 3
  result.pushed = legacyPaths.length

  commitSyncState({ ...loadSyncState(repoKeyOf(settings)), treeEtag: null, remoteShas: {} })
  return result
}
