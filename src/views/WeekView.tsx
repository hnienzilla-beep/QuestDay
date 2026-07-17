import { useLiveQuery } from 'dexie-react-hooks'
import { startOfWeek, addDays, format, isSameDay } from 'date-fns'
import { de } from 'date-fns/locale'
import './WeekView.css'
import type { Task } from '../types/task'
import { tasksDueOnDate, isTaskDoneOnDate } from '../features/tasks/taskRepository'
import { isoDateOf } from '../utils/dateUtils'
import { exportAppointmentsToIcs } from '../features/calendarExport/exportIcs'
import { useCompleteTask } from '../features/tasks/useCompleteTask'
import TaskListItem from '../features/tasks/TaskListItem'

interface DayItems {
  date: Date
  items: { task: Task; done: boolean }[]
}

export default function WeekView() {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const weekKey = isoDateOf(monday)

  const { completeTask, uncompleteTask } = useCompleteTask()

  const days = useLiveQuery<DayItems[]>(async () => {
    const results: DayItems[] = []
    for (const date of weekDates) {
      const dateStr = isoDateOf(date)
      const tasks = await tasksDueOnDate(dateStr)
      const items = await Promise.all(
        tasks.map(async (task) => ({ task, done: await isTaskDoneOnDate(task, dateStr) })),
      )
      items.sort((a, b) => {
        const aTime = a.task.type === 'appointment' ? a.task.startTime : '99:99'
        const bTime = b.task.type === 'appointment' ? b.task.startTime : '99:99'
        return aTime.localeCompare(bTime) || a.task.title.localeCompare(b.task.title)
      })
      results.push({ date, items })
    }
    return results
  }, [weekKey])

  const handleExportWeek = () => {
    const appointments = (days ?? [])
      .flatMap((d) => d.items.map((i) => i.task))
      .filter((t): t is Extract<Task, { type: 'appointment' }> => t.type === 'appointment')
    if (appointments.length > 0) exportAppointmentsToIcs(appointments)
  }

  return (
    <div>
      <div className="week-header">
        <div>
          <div className="page-title">Woche</div>
          <div className="page-subtitle">
            {format(monday, 'd. MMM', { locale: de })} –{' '}
            {format(addDays(monday, 6), 'd. MMM', { locale: de })}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleExportWeek}>
          📤 Export
        </button>
      </div>

      {days?.map((day) => {
        const isToday = isSameDay(day.date, new Date())
        return (
          <div className={`week-day${isToday ? ' week-day-today' : ''}`} key={isoDateOf(day.date)}>
            <div className="week-day-header">
              <span className="week-day-name">{format(day.date, 'EEEE', { locale: de })}</span>
              <span className="week-day-date">{format(day.date, 'd. MMMM', { locale: de })}</span>
            </div>
            {day.items.length === 0 ? (
              <div className="week-day-empty">Nichts geplant</div>
            ) : (
              day.items.map(({ task, done }) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  done={done}
                  onToggle={() => (done ? uncompleteTask(task) : completeTask(task))}
                />
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
