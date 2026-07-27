import { createEvent, createEvents, type EventAttributes, type DateArray, type DurationObject } from 'ics'
import type { Task, Appointment, OneOffTask, RecurringTask } from '../../types/task'
import { todayISODate } from '../../utils/dateUtils'

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function dateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number)
  return [y, m, d]
}

function timeParts(timeStr: string): [number, number] {
  const [h, mi] = timeStr.split(':').map(Number)
  return [h, mi]
}

function appointmentEvent(a: Appointment): EventAttributes {
  const [y, m, d] = dateParts(a.date)
  const [h, mi] = timeParts(a.startTime)
  let duration: DurationObject = { hours: 1 }
  if (a.endTime) {
    const [eh, em] = timeParts(a.endTime)
    const diff = Math.max(15, eh * 60 + em - (h * 60 + mi))
    duration = { hours: Math.floor(diff / 60), minutes: diff % 60 }
  }
  return { title: a.title, start: [y, m, d, h, mi], duration, location: a.location ?? undefined }
}

function oneoffEvent(t: OneOffTask): EventAttributes | null {
  if (!t.dueDate) return null
  const [y, m, d] = dateParts(t.dueDate)
  if (t.time) {
    const [h, mi] = timeParts(t.time)
    return { title: t.title, start: [y, m, d, h, mi], duration: { hours: 1 } }
  }
  // Ganztägig: nur Datum (3-elementiges start-Array).
  return { title: t.title, start: [y, m, d] as DateArray, duration: { days: 1 } }
}

function recurringEvent(t: RecurringTask): EventAttributes {
  const anchor = t.createdAt ? t.createdAt.slice(0, 10) : todayISODate()
  const [y, m, d] = dateParts(anchor)
  const days = t.weekdays.length > 0 ? [...t.weekdays].sort((a, b) => a - b) : [1]
  const rule =
    t.frequency === 'daily' ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${days.map((w) => BYDAY[w]).join(',')}`
  if (t.time) {
    const [h, mi] = timeParts(t.time)
    return { title: t.title, start: [y, m, d, h, mi], duration: { hours: 1 }, recurrenceRule: rule }
  }
  return { title: t.title, start: [y, m, d] as DateArray, duration: { days: 1 }, recurrenceRule: rule }
}

/** Baut einen Kalendereintrag für eine beliebige Aufgabe (oder null, wenn nicht exportierbar). */
export function toEventInput(task: Task): EventAttributes | null {
  if (task.type === 'appointment') return appointmentEvent(task)
  if (task.type === 'oneoff') return oneoffEvent(task)
  return recurringEvent(task)
}

/** Ob eine Aufgabe zum Kalender hinzugefügt werden kann (hat ein Datum oder wiederholt sich). */
export function isExportable(task: Task): boolean {
  if (task.type === 'appointment' || task.type === 'recurring') return true
  return task.dueDate !== null
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

function safeName(title: string): string {
  return title.replace(/[^\w-]+/g, '_') || 'aufgabe'
}

export async function exportTaskToIcs(task: Task) {
  const input = toEventInput(task)
  if (!input) return
  const { error, value } = createEvent(input)
  if (error || !value) throw error ?? new Error('ICS-Erstellung fehlgeschlagen')
  await shareOrDownload(value, `${safeName(task.title)}.ics`)
}

export async function exportTasksToIcs(tasks: Task[]) {
  const inputs = tasks.map(toEventInput).filter((e): e is EventAttributes => e !== null)
  if (inputs.length === 0) return
  const { error, value } = createEvents(inputs)
  if (error || !value) throw error ?? new Error('ICS-Erstellung fehlgeschlagen')
  await shareOrDownload(value, 'todo-kalender.ics')
}
