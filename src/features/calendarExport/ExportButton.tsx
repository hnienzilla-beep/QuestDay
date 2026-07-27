import type { Task } from '../../types/task'
import { exportTaskToIcs, isExportable } from './exportIcs'
import { ExportIcon } from '../../components/icons'

/** Fügt eine Aufgabe zum (Apple-)Kalender hinzu. Nur sichtbar, wenn exportierbar. */
export default function ExportButton({ task }: { task: Task }) {
  if (!isExportable(task)) return null
  return (
    <button
      type="button"
      className="export-btn"
      title="Zum Kalender hinzufügen"
      aria-label="Zum Kalender hinzufügen"
      onClick={(e) => {
        e.stopPropagation()
        exportTaskToIcs(task)
      }}
    >
      <ExportIcon size={18} />
    </button>
  )
}
