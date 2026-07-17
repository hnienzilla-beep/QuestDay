import type { Appointment } from '../../types/task'
import { exportAppointmentToIcs } from './exportIcs'

export default function ExportButton({ appointment }: { appointment: Appointment }) {
  return (
    <button
      type="button"
      className="export-btn"
      title="Zum Kalender hinzufügen"
      onClick={(e) => {
        e.stopPropagation()
        exportAppointmentToIcs(appointment)
      }}
    >
      📤
    </button>
  )
}
