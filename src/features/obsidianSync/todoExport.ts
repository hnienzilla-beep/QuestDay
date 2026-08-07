import { db } from '../../db/db'
import type { Task, OneOffTask, RecurringTask, Appointment } from '../../types/task'
import { todayISODate } from '../../utils/dateUtils'
import { upsertFile } from './githubApi'
import { cleanTitle, frontmatter, section, WEEKDAY_NAMES } from './markdown'

export const TODO_FILE_PATH = '20-Todos/To-dos.md'

/** Erledigte Aufgaben werden nur für dieses Zeitfenster mit exportiert. */
const DONE_WINDOW_DAYS = 30

function recurrenceLabel(task: RecurringTask): string {
  if (task.frequency === 'daily') return 'täglich'
  const weekday = task.weekday === null ? null : WEEKDAY_NAMES[task.weekday]
  return weekday ? `wöchentlich (${weekday})` : 'wöchentlich'
}

function openLine(task: Task, suffix = ''): string {
  return `- [ ] ${cleanTitle(task.title)} (${task.category})${suffix}`
}

function oneOffLine(task: OneOffTask): string {
  return openLine(task, task.dueDate ? ` 📅 ${task.dueDate}` : '')
}

function appointmentLine(task: Appointment): string {
  const time = task.endTime ? `${task.startTime}–${task.endTime}` : task.startTime
  const place = task.location ? ` 📍 ${cleanTitle(task.location)}` : ''
  return openLine(task, ` 📅 ${task.date} 🕘 ${time}${place}`)
}

function recurringLine(task: RecurringTask, doneToday: boolean): string {
  const box = doneToday ? '[x]' : '[ ]'
  return `- ${box} ${cleanTitle(task.title)} (${task.category}) 🔁 ${recurrenceLabel(task)}`
}

function doneLine(task: Task): string {
  const date = task.completedAt ? task.completedAt.slice(0, 10) : ''
  return `- [x] ${cleanTitle(task.title)} (${task.category})${date ? ` ✅ ${date}` : ''}`
}

function byDueDate(a: OneOffTask, b: OneOffTask): number {
  return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
}

function byAppointmentStart(a: Appointment, b: Appointment): number {
  return `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
}

function isoDateDaysAgo(days: number, todayStr: string): string {
  const date = new Date(`${todayStr}T00:00:00`)
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

/** Exportiert alle To-dos (offen, Termine, wiederkehrend, kürzlich erledigt) als Markdown ins Vault-Repo. */
export async function syncTodos(): Promise<void> {
  const todayStr = todayISODate()
  const [tasks, todaysCompletions] = await Promise.all([
    db.tasks.toArray(),
    db.taskCompletions.where('completedDate').equals(todayStr).toArray(),
  ])
  const doneTodayIds = new Set(todaysCompletions.map((c) => c.taskId))

  const openOneOffs = tasks.filter((t): t is OneOffTask => t.type === 'oneoff' && !t.completed)
  const openAppointments = tasks
    .filter((t): t is Appointment => t.type === 'appointment' && !t.completed)
    .sort(byAppointmentStart)
  const recurring = tasks
    .filter((t): t is RecurringTask => t.type === 'recurring')
    .sort((a, b) => cleanTitle(a.title).localeCompare(cleanTitle(b.title)))

  const overdue = openOneOffs.filter((t) => t.dueDate !== null && t.dueDate < todayStr).sort(byDueDate)
  const today = openOneOffs.filter((t) => t.dueDate === todayStr)
  const upcoming = openOneOffs.filter((t) => t.dueDate !== null && t.dueDate > todayStr).sort(byDueDate)
  const undated = openOneOffs.filter((t) => t.dueDate === null)

  const cutoff = isoDateDaysAgo(DONE_WINDOW_DAYS, todayStr)
  const recentlyDone = tasks
    .filter((t) => t.type !== 'recurring' && t.completed && (t.completedAt ?? '').slice(0, 10) >= cutoff)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const head = frontmatter({
    typ: 'todos',
    aktualisiert: new Date().toISOString(),
    offen: openOneOffs.length + openAppointments.length,
    ueberfaellig: overdue.length,
    termine: openAppointments.length,
    wiederkehrend: recurring.length,
    erledigt_30_tage: recentlyDone.length,
  })

  const blocks = [
    '# To-dos',
    '',
    ...section('Überfällig', overdue.map(oneOffLine)),
    ...section('Heute', today.map(oneOffLine)),
    ...section('Demnächst', upcoming.map(oneOffLine)),
    ...section('Ohne Datum', undated.map(oneOffLine)),
    ...section('Termine', openAppointments.map(appointmentLine)),
    ...section(
      'Wiederkehrend',
      recurring.map((t) => recurringLine(t, doneTodayIds.has(t.id))),
    ),
    ...section(`Erledigt (letzte ${DONE_WINDOW_DAYS} Tage)`, recentlyDone.map(doneLine)),
  ]

  const hasContent = blocks.length > 2
  const body = hasContent ? blocks.join('\n') : '# To-dos\n\n_Keine To-dos vorhanden._\n'

  await upsertFile(TODO_FILE_PATH, head + body, `Sync ${todayStr}: To-dos`)
}
