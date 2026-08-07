/**
 * Stand einer Vault-Datei nach dem letzten erfolgreichen Sync. Der Vergleich
 * "Baseline gegen aktuellen Vault-Inhalt" zeigt, was seitdem in Obsidian
 * geändert wurde – ohne ihn wäre eine Änderung im Vault nicht von einem
 * unveränderten alten Export zu unterscheiden.
 */
export interface SyncBaseline {
  /** Pfad im Vault-Repo, z. B. "20-Todos/To-dos.md". */
  path: string
  /** Exakt der Inhalt, der beim letzten Sync geschrieben bzw. gelesen wurde. */
  content: string
  syncedAt: string
}
