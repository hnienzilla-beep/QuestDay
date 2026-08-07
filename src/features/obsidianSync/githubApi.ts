import { getSyncSettings } from './settings'
import { utf8ToBase64, base64ToUtf8 } from './base64'

export class ObsidianSyncError extends Error {}

function apiBase(settings: { username: string; repo: string }): string {
  return `https://api.github.com/repos/${settings.username}/${settings.repo}`
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }
}

/** Pfadsegmente einzeln kodieren – die "/" zwischen Ordnern müssen erhalten bleiben. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

/** Prüft, ob Repo mit den gespeicherten Zugangsdaten erreichbar ist. */
export async function testConnection(): Promise<ConnectionTestResult> {
  const settings = getSyncSettings()
  if (!settings) {
    return { ok: false, message: 'Bitte Benutzername, Repo-Name und Token ausfüllen.' }
  }
  try {
    const res = await fetch(apiBase(settings), { headers: authHeaders(settings.token) })
    if (res.status === 404) {
      return { ok: false, message: 'Repo nicht gefunden. Benutzername und Repo-Name prüfen.' }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Token ungültig oder ohne Schreibrechte für dieses Repo.' }
    }
    if (!res.ok) {
      return { ok: false, message: `Unerwarteter Fehler von GitHub (${res.status}).` }
    }
    return { ok: true, message: 'Verbindung erfolgreich – Repo erreichbar.' }
  } catch {
    return { ok: false, message: 'Keine Verbindung möglich (kein Internet oder Repo nicht erreichbar).' }
  }
}

export interface RemoteFile {
  content: string
  sha: string
  /** Zeitpunkt des letzten Commits, der diese Datei geändert hat (ISO), oder null. */
  lastModified: string | null
}

function requireSettings() {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }
  return settings
}

/** Zeitpunkt des letzten Commits auf diese Datei – die "Vault-Seite" beim Konfliktvergleich. */
async function fetchLastModified(
  path: string,
  settings: { username: string; repo: string; token: string },
): Promise<string | null> {
  const url = `${apiBase(settings)}/commits?path=${encodeURIComponent(path)}&per_page=1`
  const res = await fetch(url, { headers: authHeaders(settings.token) })
  if (!res.ok) return null
  const commits = (await res.json()) as { commit?: { committer?: { date?: string } } }[]
  return commits[0]?.commit?.committer?.date ?? null
}

/** Liest eine Datei aus dem Vault-Repo. `null`, wenn sie dort (noch) nicht existiert. */
export async function fetchFile(path: string): Promise<RemoteFile | null> {
  const settings = requireSettings()

  let res: Response
  try {
    res = await fetch(`${apiBase(settings)}/contents/${encodePath(path)}`, {
      headers: authHeaders(settings.token),
    })
  } catch {
    throw new ObsidianSyncError('Keine Verbindung zu GitHub möglich (kein Internet?).')
  }

  if (res.status === 404) return null
  if (res.status === 401 || res.status === 403) {
    throw new ObsidianSyncError('Token ungültig oder ohne Leserechte.')
  }
  if (!res.ok) {
    throw new ObsidianSyncError(`Fehler beim Lesen von "${path}" (${res.status}).`)
  }

  const data = (await res.json()) as { sha: string; content?: string; encoding?: string }
  if (data.encoding !== 'base64' || data.content === undefined) {
    throw new ObsidianSyncError(`Datei "${path}" ist zu groß oder in einem unerwarteten Format.`)
  }

  return {
    // Die Contents-API bricht Base64 in Zeilen um.
    content: base64ToUtf8(data.content.replace(/\s/g, '')),
    sha: data.sha,
    lastModified: await fetchLastModified(path, settings),
  }
}

async function getFileSha(path: string, settings: { username: string; repo: string; token: string }): Promise<string | null> {
  const res = await fetch(`${apiBase(settings)}/contents/${encodePath(path)}`, {
    headers: authHeaders(settings.token),
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new ObsidianSyncError(`Fehler beim Lesen von "${path}" (${res.status}).`)
  }
  const data = (await res.json()) as { sha: string }
  return data.sha
}

/**
 * Legt eine Datei im Vault-Repo an oder aktualisiert sie. `knownSha` überspringt den
 * zusätzlichen GET – `undefined` heißt "SHA selbst holen", `null` heißt "Datei ist neu".
 */
export async function upsertFile(
  path: string,
  content: string,
  commitMessage: string,
  knownSha?: string | null,
): Promise<void> {
  const settings = requireSettings()

  let sha: string | null = knownSha ?? null
  if (knownSha === undefined) {
    try {
      sha = await getFileSha(path, settings)
    } catch (err) {
      if (err instanceof ObsidianSyncError) throw err
      throw new ObsidianSyncError('Keine Verbindung zu GitHub möglich (kein Internet?).')
    }
  }

  let res: Response
  try {
    res = await fetch(`${apiBase(settings)}/contents/${encodePath(path)}`, {
      method: 'PUT',
      headers: { ...authHeaders(settings.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: commitMessage,
        content: utf8ToBase64(content),
        ...(sha ? { sha } : {}),
      }),
    })
  } catch {
    throw new ObsidianSyncError('Keine Verbindung zu GitHub möglich (kein Internet?).')
  }

  if (res.status === 401 || res.status === 403) {
    throw new ObsidianSyncError('Token ungültig oder ohne Schreibrechte.')
  }
  if (res.status === 409) {
    throw new ObsidianSyncError('Konflikt: Datei wurde zwischenzeitlich geändert. Bitte erneut synchronisieren.')
  }
  if (!res.ok) {
    throw new ObsidianSyncError(`GitHub-Fehler beim Speichern von "${path}" (${res.status}).`)
  }
}
