import { createEvent, createEvents, type EventAttributes, type DurationObject } from 'ics'
import type { Appointment } from '../../types/task'

function toEventInput(appt: Appointment): EventAttributes {
  const [year, month, day] = appt.date.split('-').map(Number)
  const [startHour, startMinute] = appt.startTime.split(':').map(Number)

  let duration: DurationObject = { hours: 1 }
  if (appt.endTime) {
    const [endHour, endMinute] = appt.endTime.split(':').map(Number)
    const startTotal = startHour * 60 + startMinute
    const endTotal = endHour * 60 + endMinute
    const diffMinutes = Math.max(15, endTotal - startTotal)
    duration = { hours: Math.floor(diffMinutes / 60), minutes: diffMinutes % 60 }
  }

  return {
    title: appt.title,
    start: [year, month, day, startHour, startMinute],
    duration,
    location: appt.location ?? undefined,
  }
}

async function shareOrDownload(value: string, filename: string) {
  const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' })
  const file = new File([blob], filename, { type: 'text/calendar' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch {
      // Nutzer hat das Sharesheet abgebrochen - auf Download zurückfallen
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportAppointmentToIcs(appt: Appointment) {
  const { error, value } = createEvent(toEventInput(appt))
  if (error || !value) throw error ?? new Error('ICS-Erstellung fehlgeschlagen')
  await shareOrDownload(value, `${appt.title.replace(/[^\w-]+/g, '_')}.ics`)
}

export async function exportAppointmentsToIcs(appts: Appointment[]) {
  const { error, value } = createEvents(appts.map(toEventInput))
  if (error || !value) throw error ?? new Error('ICS-Erstellung fehlgeschlagen')
  await shareOrDownload(value, 'questday-termine.ics')
}
