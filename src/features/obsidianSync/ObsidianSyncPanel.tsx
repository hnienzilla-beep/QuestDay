import { useEffect, useState } from 'react'
import { getSyncSettings, saveSyncSettings, DEFAULT_INBOX_PATH } from './settings'
import { testConnection } from './githubApi'
import { syncQuestsHeute } from './questExport'
import { importInbox, type InboxImportResult } from './inboxImport'
import './ObsidianSyncPanel.css'

type StatusType = 'idle' | 'busy' | 'success' | 'error'

function describeImport(result: InboxImportResult): string {
  if (result.fileMissing) return `Keine Inbox-Datei im Vault gefunden`
  const count = result.importedTasks + result.importedGoals
  if (count === 0) return 'Nichts Neues in der Inbox'
  const parts: string[] = []
  if (result.importedTasks > 0) {
    parts.push(`${result.importedTasks} ${result.importedTasks === 1 ? 'Aufgabe' : 'Aufgaben'}`)
  }
  if (result.importedGoals > 0) {
    parts.push(`${result.importedGoals} ${result.importedGoals === 1 ? 'Ziel' : 'Ziele'}`)
  }
  return `${parts.join(' und ')} importiert`
}

export default function ObsidianSyncPanel() {
  const [username, setUsername] = useState('')
  const [repo, setRepo] = useState('obsidian-vault')
  const [token, setToken] = useState('')
  const [inboxPath, setInboxPath] = useState(DEFAULT_INBOX_PATH)
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({ type: 'idle', message: '' })
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    const existing = getSyncSettings()
    if (existing) {
      setUsername(existing.username)
      setRepo(existing.repo || 'obsidian-vault')
      setToken(existing.token)
      setInboxPath(existing.inboxPath || DEFAULT_INBOX_PATH)
    }
  }, [])

  function persist() {
    saveSyncSettings({
      username: username.trim(),
      repo: repo.trim() || 'obsidian-vault',
      token: token.trim(),
      inboxPath: inboxPath.trim() || DEFAULT_INBOX_PATH,
    })
  }

  async function handleTest() {
    persist()
    setWarnings([])
    setStatus({ type: 'busy', message: 'Prüfe Verbindung…' })
    const result = await testConnection()
    setStatus({ type: result.ok ? 'success' : 'error', message: result.message })
  }

  /** Beide Richtungen: erst neue Einträge aus dem Vault holen, dann die Quests exportieren. */
  async function handleSync() {
    persist()
    setWarnings([])
    setStatus({ type: 'busy', message: 'Lese Inbox aus dem Vault…' })
    try {
      const imported = await importInbox()
      setWarnings(imported.warnings)
      setStatus({ type: 'busy', message: 'Exportiere Quests…' })
      await syncQuestsHeute()
      setStatus({ type: 'success', message: `${describeImport(imported)} · Quests exportiert ✅` })
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
        <label>
          Inbox-Datei im Vault
          <input
            type="text"
            value={inboxPath}
            onChange={(e) => setInboxPath(e.target.value)}
            placeholder={DEFAULT_INBOX_PATH}
          />
        </label>
      </div>
      <p className="obsidian-sync-hint">
        Neue Einträge in dieser Datei werden beim Synchronisieren in die App übernommen und dort unter
        „## Importiert“ abgehakt. Format je Zeile:
        <br />
        <code>- [ ] Titel #Hobby @2026-08-10 !07:00</code>
        <br />
        <code>- [ ] Zahnarzt @morgen 14:30-15:30 ort:Praxis</code>
        <br />
        <code>- [ ] Ziel: Vakuum #Hobby täglich !07:00</code>
      </p>
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
      {warnings.length > 0 && (
        <ul className="obsidian-sync-warnings">
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
