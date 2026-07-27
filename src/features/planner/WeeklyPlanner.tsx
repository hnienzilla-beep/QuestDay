import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { startOfWeek, addWeeks, addDays, format, isSameDay } from 'date-fns'
import { de } from 'date-fns/locale'
import './WeeklyPlanner.css'
import { db } from '../../db/db'
import type { Task } from '../../types/task'
import type { Goal } from '../../types/goal'
import { tasksDueOnDate, isTaskDoneOnDate, setTaskDate } from '../tasks/taskRepository'
import { goalsDueOnDate, isGoalCycleDoneOnDate } from '../goals/goalRepository'
import { isoDateOf, todayISODate } from '../../utils/dateUtils'
import { exportAppointmentsToIcs } from '../calendarExport/exportIcs'
import { useDragPlanner } from './useDragPlanner'
import CategoryDot from '../../components/CategoryDot'
import { ChevronLeftIcon, ChevronRightIcon, ExportIcon } from '../../components/icons'

interface PlanTask {
  task: Task
  done: boolean
}
interface PlanDay {
  date: Date
  dateStr: string
  tasks: PlanTask[]
  goals: { goal: Goal; done: boolean; missed: boolean }[]
}

const WEEKDAY_LABEL = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export default function WeeklyPlanner() {
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 })
  const weekKey = isoDateOf(monday)
  const todayStr = todayISODate()

  const { ghost, onPointerDown } = useDragPlanner((taskId, dayDate) => {
    setTaskDate(taskId, dayDate)
  })

  const days = useLiveQuery<PlanDay[]>(async () => {
    const result: PlanDay[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i)
      const dateStr = isoDateOf(date)
      const tasks = await tasksDueOnDate(dateStr)
      const planTasks = await Promise.all(
        tasks.map(async (task) => ({ task, done: await isTaskDoneOnDate(task, dateStr) })),
      )
      planTasks.sort((a, b) => {
        const at = a.task.type === 'appointment' ? a.task.startTime : '99:99'
        const bt = b.task.type === 'appointment' ? b.task.startTime : '99:99'
        return at.localeCompare(bt) || a.task.title.localeCompare(b.task.title)
      })
      const goalsDue = await goalsDueOnDate(dateStr)
      const goals = await Promise.all(
        goalsDue.map(async (goal) => ({
          goal,
          done: await isGoalCycleDoneOnDate(goal.id, dateStr),
          missed: dateStr < todayStr,
        })),
      )
      result.push({ date, dateStr, tasks: planTasks, goals })
    }
    return result
  }, [weekKey])

  // Ungeplante, offene einmalige Aufgaben (ohne Datum).
  const unplanned = useLiveQuery<Task[]>(
    () =>
      db.tasks
        .filter((t) => t.type === 'oneoff' && t.dueDate === null && !t.completed)
        .toArray(),
    [],
  )

  const handleExport = () => {
    const appointments = (days ?? [])
      .flatMap((d) => d.tasks.map((t) => t.task))
      .filter((t): t is Extract<Task, { type: 'appointment' }> => t.type === 'appointment')
    if (appointments.length > 0) exportAppointmentsToIcs(appointments)
  }

  const draggable = (task: Task) => task.type === 'oneoff' || task.type === 'appointment'

  return (
    <div className="planner">
      <div className="planner-head">
        <button type="button" className="planner-nav" onClick={() => setWeekOffset((o) => o - 1)} aria-label="Vorige Woche">
          <ChevronLeftIcon size={18} />
        </button>
        <div className="planner-range">
          {format(monday, 'd. MMM', { locale: de })} – {format(addDays(monday, 6), 'd. MMM', { locale: de })}
        </div>
        <button type="button" className="planner-nav" onClick={() => setWeekOffset((o) => o + 1)} aria-label="Nächste Woche">
          <ChevronRightIcon size={18} />
        </button>
        <button type="button" className="planner-export" onClick={handleExport} aria-label="Woche exportieren">
          <ExportIcon size={18} />
        </button>
      </div>

      <div className="planner-strip">
        {days?.map((day) => {
          const isToday = isSameDay(day.date, new Date())
          return (
            <div
              key={day.dateStr}
              className={`planner-day${isToday ? ' is-today' : ''}`}
              data-plan-day={day.dateStr}
            >
              <div className="planner-day-head">
                <span className="planner-day-name">{WEEKDAY_LABEL[day.date.getDay()]}</span>
                <span className="planner-day-num">{format(day.date, 'd')}</span>
              </div>
              <div className="planner-day-items">
                {day.tasks.length === 0 && day.goals.length === 0 && (
                  <div className="planner-day-empty">–</div>
                )}
                {day.tasks.map(({ task, done }) => (
                  <div
                    key={task.id}
                    className={`plan-chip${done ? ' done' : ''}${draggable(task) ? ' draggable' : ' locked'}`}
                    onPointerDown={draggable(task) ? (e) => onPointerDown(e, task.id, task.title) : undefined}
                  >
                    <CategoryDot categoryId={task.categoryId} />
                    <span className="plan-chip-title">
                      {task.type === 'appointment' ? `${task.startTime} ` : ''}
                      {task.title}
                    </span>
                  </div>
                ))}
                {day.goals.map(({ goal, done, missed }) => (
                  <div key={goal.id} className={`plan-chip goal${done ? ' done' : ''}${missed && !done ? ' missed' : ''}`}>
                    <span className="plan-chip-title">🎯 {goal.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="planner-tray" data-plan-tray>
        <div className="planner-tray-label">Ungeplant</div>
        <div className="planner-tray-items">
          {unplanned && unplanned.length === 0 && (
            <span className="planner-tray-empty">Keine ungeplanten Aufgaben</span>
          )}
          {unplanned?.map((task) => (
            <div
              key={task.id}
              className="plan-chip draggable"
              onPointerDown={(e) => onPointerDown(e, task.id, task.title)}
            >
              <CategoryDot categoryId={task.categoryId} />
              <span className="plan-chip-title">{task.title}</span>
            </div>
          ))}
        </div>
      </div>

      {ghost && (
        <div className="plan-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.title}
        </div>
      )}
    </div>
  )
}
