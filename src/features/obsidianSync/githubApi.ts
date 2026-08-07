import { getSyncSettings } from './settings'
import { utf8ToBase64, base64ToUtf8 } from './base64'

export class ObsidianSyncError extends Error {}

function apiBase(settings: { username: string; repo: string }): string {
  return `https://api.github.com/repos/${settings.username}/${settings.repo}`
}

/** Jedes Pfadsegment einzeln kodieren - die Schrägstriche müssen echte URL-Trenner bleiben. */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }
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

interface ContentsResponse {
  sha: string
  content?: string
  encoding?: string
  type?: string
}

async function getFileEntry(
  path: string,
  settings: { username: string; repo: string; token: string },
): Promise<ContentsResponse | null> {
  const res = await fetch(`${apiBase(settings)}/contents/${encodePath(path)}`, {
    headers: authHeaders(settings.token),
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new ObsidianSyncError(`Fehler beim Lesen von "${path}" (${res.status}).`)
  }
  return (await res.json()) as ContentsResponse
}

export interface RemoteFile {
  content: string
  sha: string
}

/** Liest eine Datei aus dem Vault-Repo. `null`, wenn sie dort (noch) nicht existiert. */
export async function readFile(path: string): Promise<RemoteFile | null> {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }

  let entry: ContentsResponse | null
  try {
    entry = await getFileEntry(path, settings)
  } catch (err) {
    if (err instanceof ObsidianSyncError) throw err
    throw new ObsidianSyncError('Keine Verbindung zu GitHub möglich (kein Internet?).')
  }
  if (!entry) return null
  if (entry.type !== 'file' || entry.encoding !== 'base64' || entry.content === undefined) {
    throw new ObsidianSyncError(`"${path}" ist keine einfache Textdatei im Vault.`)
  }
  // GitHub bricht base64 in Zeilen um - vor dem Dekodieren entfernen.
  return { content: base64ToUtf8(entry.content.replace(/\s/g, '')), sha: entry.sha }
}

/**
 * Legt eine Datei im Vault-Repo an oder aktualisiert sie. Ohne `knownSha` wird der
 * aktuelle SHA vorher geholt; mit `knownSha` schlägt GitHub fehl, falls die Datei
 * zwischenzeitlich verändert wurde (verhindert Überschreiben fremder Änderungen).
 */
export async function upsertFile(
  path: string,
  content: string,
  commitMessage: string,
  knownSha?: string | null,
): Promise<void> {
  const settings = getSyncSettings()
  if (!settings) {
    throw new ObsidianSyncError('Obsidian-Sync ist noch nicht eingerichtet. Bitte in den Einstellungen ausfüllen.')
  }

  let sha: string | null = knownSha ?? null
  if (knownSha === undefined) {
    try {
      sha = (await getFileEntry(path, settings))?.sha ?? null
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
