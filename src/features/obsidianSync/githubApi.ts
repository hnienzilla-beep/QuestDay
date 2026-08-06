import { getSyncSettings, type ObsidianSyncSettings } from './settings'

/**
 * GitHub-Zugriff über die Git-Data-API statt der Contents-API.
 *
 * Der Unterschied ist der Grund für den ganzen Umbau: die Contents-API kostet einen Request
 * *und* einen Commit pro Datei. Über die Git-Data-API listet ein einziger Tree-Request den
 * kompletten Bestand mit Blob-SHAs, und beliebig viele geänderte Dateien gehen in einen
 * einzigen Commit.
 */

export type SyncErrorKind = 'auth' | 'network' | 'conflict' | 'ratelimit' | 'server' | 'config'

export class ObsidianSyncError extends Error {
  kind: SyncErrorKind
  retryAfterMs: number | undefined

  constructor(message: string, kind: SyncErrorKind, retryAfterMs?: number) {
    super(message)
    this.name = 'ObsidianSyncError'
    this.kind = kind
    this.retryAfterMs = retryAfterMs
  }
}

export interface TreeEntry {
  path: string
  sha: string
}

export interface TreeListing {
  /** true = 304, das Repo ist unverändert (zählt nicht gegen das Rate-Limit). */
  notModified: boolean
  etag: string | null
  entries: TreeEntry[]
  truncated: boolean
}

/** `content: null` löscht den Pfad im neuen Commit. */
export interface TreeMutation {
  path: string
  content: string | null
}

function apiBase(settings: ObsidianSyncSettings): string {
  return `https://api.github.com/repos/${settings.username}/${settings.repo}`
}

function authHeaders(settings: ObsidianSyncSettings): Record<string, string> {
  return {
    Authorization: `Bearer ${settings.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export function requireSettings(): ObsidianSyncSettings {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError(
      'Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.',
      'config',
    )
  }
  return settings
}

async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new ObsidianSyncError('Keine Verbindung zu GitHub möglich (kein Internet?).', 'network')
  }
}

function retryAfterOf(res: Response): number | undefined {
  const retryAfter = res.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return seconds * 1000
  }
  const reset = res.headers.get('x-ratelimit-reset')
  if (reset) {
    const resetMs = Number(reset) * 1000 - Date.now()
    if (Number.isFinite(resetMs) && resetMs > 0) return resetMs
  }
  return undefined
}

/** Übersetzt einen Fehlerstatus in eine Meldung, die im Panel etwas taugt. */
async function failFor(res: Response, what: string): Promise<never> {
  if (res.status === 401) {
    throw new ObsidianSyncError('Token ungültig oder abgelaufen.', 'auth')
  }
  if (res.status === 403 || res.status === 429) {
    if (res.status === 429 || res.headers.get('x-ratelimit-remaining') === '0') {
      throw new ObsidianSyncError(
        'GitHub-Anfragelimit erreicht. Der nächste Versuch wartet ab.',
        'ratelimit',
        retryAfterOf(res),
      )
    }
    throw new ObsidianSyncError('Token ohne Schreibrechte für dieses Repo.', 'auth')
  }
  if (res.status === 404) {
    throw new ObsidianSyncError(
      'Repo oder Branch nicht gefunden. Benutzername, Repo-Name und Branch prüfen.',
      'config',
    )
  }
  if (res.status === 409 || res.status === 422) {
    throw new ObsidianSyncError(
      'Das Repo wurde zwischenzeitlich von anderer Seite geändert.',
      'conflict',
    )
  }
  throw new ObsidianSyncError(`GitHub-Fehler bei ${what} (${res.status}).`, 'server')
}

async function getJson(
  settings: ObsidianSyncSettings,
  path: string,
  what: string,
): Promise<unknown> {
  const res = await request(`${apiBase(settings)}${path}`, { headers: authHeaders(settings) })
  if (!res.ok) await failFor(res, what)
  return res.json()
}

async function sendJson(
  settings: ObsidianSyncSettings,
  path: string,
  body: unknown,
  what: string,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<unknown> {
  const res = await request(`${apiBase(settings)}${path}`, {
    method,
    headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await failFor(res, what)
  return res.json()
}

/**
 * Der eine Request, der einen Leerlauf ausmacht: listet den kompletten Baum mit Blob-SHAs.
 * Mit `If-None-Match` antwortet GitHub bei unverändertem Repo mit 304 - das zählt nicht
 * gegen das Rate-Limit.
 */
export async function listTree(
  settings: ObsidianSyncSettings,
  etag: string | null,
): Promise<TreeListing> {
  const headers: Record<string, string> = authHeaders(settings)
  if (etag) headers['If-None-Match'] = etag

  const res = await request(
    `${apiBase(settings)}/git/trees/${encodeURIComponent(settings.branch)}?recursive=1`,
    { headers },
  )

  if (res.status === 304) {
    return { notModified: true, etag, entries: [], truncated: false }
  }
  if (!res.ok) await failFor(res, 'dem Auflisten der Dateien')

  const data = (await res.json()) as {
    tree?: { path: string; sha: string; type: string }[]
    truncated?: boolean
  }
  const entries = (data.tree ?? [])
    .filter((entry) => entry.type === 'blob')
    .map((entry) => ({ path: entry.path, sha: entry.sha }))

  return {
    notModified: false,
    etag: res.headers.get('etag'),
    entries,
    truncated: data.truncated === true,
  }
}

/** Lädt einen Blob als Rohtext - spart die Base64-Dekodierung. */
export async function fetchBlobText(settings: ObsidianSyncSettings, sha: string): Promise<string> {
  const res = await request(`${apiBase(settings)}/git/blobs/${sha}`, {
    headers: { ...authHeaders(settings), Accept: 'application/vnd.github.raw' },
  })
  if (!res.ok) await failFor(res, 'dem Laden einer Datei')
  return res.text()
}

export async function getHeadCommitSha(settings: ObsidianSyncSettings): Promise<string> {
  const data = (await getJson(
    settings,
    `/git/ref/heads/${encodeURIComponent(settings.branch)}`,
    'dem Lesen des Branch-Stands',
  )) as { object: { sha: string } }
  return data.object.sha
}

/**
 * Schreibt beliebig viele Dateien in einen einzigen Commit.
 *
 * `POST /git/trees` nimmt den Inhalt direkt entgegen und legt die Blobs implizit an - egal
 * wie viele Dateien sich geändert haben, es bleibt bei drei Requests.
 *
 * Der Ref-Update läuft bewusst **ohne** `force`: hat ein anderes Gerät zwischenzeitlich
 * gepusht, ist auch unser `base_tree` veraltet, und ein Force würde dessen Commit
 * stillschweigend zurückrollen. Stattdessen gibt es einen `conflict`-Fehler, und der
 * Sync läuft komplett neu.
 */
export async function pushCommit(
  settings: ObsidianSyncSettings,
  headCommitSha: string,
  mutations: readonly TreeMutation[],
  message: string,
): Promise<string> {
  const baseCommit = (await getJson(
    settings,
    `/git/commits/${headCommitSha}`,
    'dem Lesen des letzten Commits',
  )) as { tree: { sha: string } }

  const tree = (await sendJson(
    settings,
    '/git/trees',
    {
      base_tree: baseCommit.tree.sha,
      tree: mutations.map((mutation) =>
        mutation.content === null
          ? { path: mutation.path, mode: '100644', type: 'blob', sha: null }
          : { path: mutation.path, mode: '100644', type: 'blob', content: mutation.content },
      ),
    },
    'dem Schreiben der Dateien',
  )) as { sha: string }

  const newCommit = (await sendJson(
    settings,
    '/git/commits',
    { message, tree: tree.sha, parents: [headCommitSha] },
    'dem Erstellen des Commits',
  )) as { sha: string }

  await sendJson(
    settings,
    `/git/refs/heads/${encodeURIComponent(settings.branch)}`,
    { sha: newCommit.sha, force: false },
    'dem Veröffentlichen des Commits',
    'PATCH',
  )

  return newCommit.sha
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

export async function testConnection(): Promise<ConnectionTestResult> {
  const settings = getSyncSettings()
  if (!settings) {
    return { ok: false, message: 'Bitte Benutzername, Repo-Name und Token ausfüllen.' }
  }
  try {
    await getJson(
      settings,
      `/branches/${encodeURIComponent(settings.branch)}`,
      'der Verbindungsprüfung',
    )
    return { ok: true, message: `Verbindung erfolgreich – Branch "${settings.branch}" erreichbar.` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof ObsidianSyncError ? err.message : 'Keine Verbindung möglich.',
    }
  }
}
