import { useEffect, useState } from 'react'
import { getSyncSettings, saveSyncSettings } from './settings'
import { testConnection } from './githubApi'
import { syncQuestsHeute } from './questExport'
import './ObsidianSyncPanel.css'

type StatusType = 'idle' | 'busy' | 'success' | 'error'

export default function ObsidianSyncPanel() {
  const [username, setUsername] = useState('')
  const [repo, setRepo] = useState('obsidian-vault')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({ type: 'idle', message: '' })

  useEffect(() => {
    const existing = getSyncSettings()
    if (existing) {
      setUsername(existing.username)
      setRepo(existing.repo || 'obsidian-vault')
      setToken(existing.token)
    }
  }, [])

  function persist() {
    saveSyncSettings({
      username: username.trim(),
      repo: repo.trim() || 'obsidian-vault',
      token: token.trim(),
    })
  }

  async function handleTest() {
    persist()
    setStatus({ type: 'busy', message: 'Prüfe Verbindung…' })
    const result = await testConnection()
    setStatus({ type: result.ok ? 'success' : 'error', message: result.message })
  }

  async function handleSync() {
    persist()
    setStatus({ type: 'busy', message: 'Synchronisiere…' })
    try {
      await syncQuestsHeute()
      setStatus({ type: 'success', message: 'Synchronisiert ✅' })
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unbekannter Fehler beim Sync.',
      })
    }
  }

  const busy = status.type === 'busy'

  return (
    <div className="obsidian-sync-panel">
      <div className="section-title">Obsidian-Sync</div>
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
      </div>
      <div className="obsidian-sync-actions">
        <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={busy}>
          Verbindung testen
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSync} disabled={busy}>
          Jetzt synchronisieren
        </button>
      </div>
      {status.message && (
        <div className={`obsidian-sync-status obsidian-sync-status--${status.type}`}>{status.message}</div>
      )}
    </div>
  )
}
