import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getSyncSettings,
  saveSyncSettings,
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_OPTIONS,
} from './settings'
import { testConnection } from './githubApi'
import { runSync } from './runSync'
import { getSyncStatus, subscribeSyncStatus, setSyncStatus } from './syncStatus'
import './ObsidianSyncPanel.css'

function intervalLabel(minutes: number): string {
  if (minutes === 0) return 'Nur manuell'
  if (minutes < 60) return `Alle ${minutes} Minuten`
  const hours = minutes / 60
  return hours === 1 ? 'Jede Stunde' : `Alle ${hours} Stunden`
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Noch kein Sync gelaufen.'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Noch kein Sync gelaufen.'
  return `Zuletzt synchronisiert: ${date.toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`
}

export default function ObsidianSyncPanel() {
  const [username, setUsername] = useState('')
  const [repo, setRepo] = useState('obsidian-vault')
  const [token, setToken] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState<number>(DEFAULT_INTERVAL_MINUTES)
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)

  useEffect(() => {
    const existing = getSyncSettings()
    if (existing) {
      setUsername(existing.username)
      setRepo(existing.repo || 'obsidian-vault')
      setToken(existing.token)
      setIntervalMinutes(existing.intervalMinutes)
    }
  }, [])

  function persist(nextIntervalMinutes = intervalMinutes) {
    saveSyncSettings({
      username: username.trim(),
      repo: repo.trim() || 'obsidian-vault',
      token: token.trim(),
      intervalMinutes: nextIntervalMinutes,
    })
  }

  function handleIntervalChange(value: number) {
    setIntervalMinutes(value)
    persist(value)
  }

  async function handleTest() {
    persist()
    setSyncStatus({ phase: 'running', message: 'Prüfe Verbindung…' })
    const result = await testConnection()
    setSyncStatus({ phase: result.ok ? 'success' : 'error', message: result.message })
  }

  async function handleSync() {
    persist()
    try {
      await runSync()
    } catch {
      // Fehlermeldung steht bereits im Sync-Status.
    }
  }

  const busy = status.phase === 'running'

  return (
    <div className="obsidian-sync-panel">
      <div className="section-title">Obsidian-Sync</div>
      <div className="obsidian-sync-hint">
        Gleicht To-dos und Ziele in beide Richtungen mit deinem Vault-Repo ab: Änderungen aus Obsidian
        werden übernommen, Änderungen aus der App zurückgeschrieben. Bei einer Änderung auf beiden Seiten
        gewinnt die jüngere. Die Quest-Datei ist ein reiner Tagesbericht und wird nicht zurückgelesen.
      </div>
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
          Personal Access Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_..."
          />
        </label>
        <label>
          Automatisch synchronisieren
          <select value={intervalMinutes} onChange={(e) => handleIntervalChange(Number(e.target.value))}>
            {INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {intervalLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="obsidian-sync-actions">
        <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={busy}>
          Verbindung testen
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSync} disabled={busy}>
          Jetzt synchronisieren
        </button>
      </div>
      <div className="obsidian-sync-last">{formatLastSync(status.lastSyncAt)}</div>
      {status.message && (
        <div className={`obsidian-sync-status obsidian-sync-status--${status.phase}`}>{status.message}</div>
      )}
    </div>
  )
}
