import { useEffect, useState } from 'react'
import { DEFAULT_BRANCH, getSyncSettings, repoKeyOf, saveSyncSettings } from './settings'
import { testConnection } from './githubApi'
import { cleanUpLegacyFiles, restoreFromJson, runNow } from './syncScheduler'
import { useSyncScheduler } from './useSyncScheduler'
import { loadSyncState } from './syncState'
import { PREFIX } from './vaultPaths'
import './ObsidianSyncPanel.css'

type MessageType = 'idle' | 'busy' | 'success' | 'error'

function formatTime(timestamp: number | null): string {
  if (!timestamp) return 'noch nie'
  const date = new Date(timestamp)
  return `${date.toLocaleDateString('de-DE')}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}

export default function ObsidianSyncPanel() {
  const status = useSyncScheduler()
  const [username, setUsername] = useState('')
  const [repo, setRepo] = useState('obsidian-vault')
  const [branch, setBranch] = useState(DEFAULT_BRANCH)
  const [token, setToken] = useState('')
  const [message, setMessage] = useState<{ type: MessageType; text: string }>({ type: 'idle', text: '' })
  const [quarantined, setQuarantined] = useState<string[]>([])

  useEffect(() => {
    const existing = getSyncSettings()
    if (existing) {
      setUsername(existing.username)
      setRepo(existing.repo)
      setBranch(existing.branch)
      setToken(existing.token)
    }
  }, [])

  useEffect(() => {
    const settings = getSyncSettings()
    if (!settings) return
    setQuarantined(Object.keys(loadSyncState(repoKeyOf(settings)).quarantine))
  }, [status.lastSyncAt, status.phase])

  function persist() {
    saveSyncSettings({
      username: username.trim(),
      repo: repo.trim() || 'obsidian-vault',
      branch: branch.trim() || DEFAULT_BRANCH,
      token: token.trim(),
    })
  }

  async function handleTest() {
    persist()
    setMessage({ type: 'busy', text: 'Prüfe Verbindung…' })
    const result = await testConnection()
    setMessage({ type: result.ok ? 'success' : 'error', text: result.message })
  }

  async function handleSync() {
    persist()
    setMessage({ type: 'busy', text: 'Gleiche ab…' })
    const result = await runNow()
    if (!result) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      setMessage({
        type: 'error',
        text: status.lastError ?? (offline ? 'Kein Internet – der Abgleich holt das später nach.' : 'Abgleich nicht möglich.'),
      })
      return
    }
    const parts: string[] = []
    if (result.imported > 0) parts.push(`${result.imported} übernommen`)
    if (result.deleted > 0) parts.push(`${result.deleted} gelöscht`)
    if (result.pushed > 0) parts.push(`${result.pushed} geschrieben`)
    setMessage({
      type: 'success',
      text: parts.length > 0 ? `Abgeglichen: ${parts.join(', ')}.` : 'Alles aktuell – nichts zu tun.',
    })
  }

  async function handleAction(action: () => Promise<unknown>, busyText: string, doneText: string) {
    setMessage({ type: 'busy', text: busyText })
    try {
      await action()
      setMessage({ type: 'success', text: doneText })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unbekannter Fehler.' })
    }
  }

  const busy = message.type === 'busy' || status.phase === 'running'
  const warnings = status.lastResult?.warnings ?? []

  return (
    <div className="obsidian-sync-panel">
      {/* Die Überschrift kommt aus SettingsView ("Synchronisierung"). */}
      <p className="obsidian-sync-hint">
        Schreibt deinen Bestand als Markdown nach <code>{PREFIX}/</code> in ein privates GitHub-Repo und
        übernimmt umgekehrt, was du in Obsidian änderst.
      </p>

      <div className="obsidian-sync-fields">
        <label>
          GitHub-Benutzername
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="dein-github-name"
          />
        </label>
        <label>
          Repo-Name
          <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="obsidian-vault" />
        </label>
        <label>
          Branch
          <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={DEFAULT_BRANCH} />
        </label>
        <label>
          Personal Access Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_..."
          />
        </label>
      </div>

      <div className="obsidian-sync-actions">
        <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={busy}>
          Verbindung testen
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSync} disabled={busy}>
          Jetzt abgleichen
        </button>
      </div>

      {message.text && (
        <div className={`obsidian-sync-status obsidian-sync-status--${message.type}`}>{message.text}</div>
      )}

      <dl className="obsidian-sync-facts">
        <div>
          <dt>Letzter Abgleich</dt>
          <dd>{formatTime(status.lastSyncAt)}</dd>
        </div>
        {status.nextAttemptAt !== null && (
          <div>
            <dt>Nächster Versuch</dt>
            <dd>{formatTime(status.nextAttemptAt)}</dd>
          </div>
        )}
      </dl>

      {warnings.length > 0 && (
        <ul className="obsidian-sync-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {quarantined.length > 0 && (
        <div className="obsidian-sync-warnings">
          <strong>Nicht lesbar – unverändert gelassen:</strong>
          <ul>
            {quarantined.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="obsidian-sync-more">
        <summary>Mehr</summary>
        <div className="obsidian-sync-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              handleAction(restoreFromJson, 'Stelle aus questday-data.json wieder her…', 'Wiederhergestellt.')
            }
          >
            Aus JSON wiederherstellen
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              handleAction(cleanUpLegacyFiles, 'Entferne alte 10-Quests-Dateien…', 'Alte Dateien entfernt.')
            }
          >
            Alte 10-Quests-Dateien entfernen
          </button>
        </div>
        <p className="obsidian-sync-hint">
          „Aus JSON wiederherstellen“ überschreibt den lokalen Bestand mit dem Stand aus dem Repo – für ein
          neues Gerät gedacht.
        </p>
      </details>
    </div>
  )
}
