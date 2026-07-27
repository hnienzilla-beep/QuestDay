import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { startOfWeek, addWeeks, addDays, format, isSameDay } from 'date-fns'
import { de } from 'date-fns/locale'
import './WeeklyPlanner.css'
import { db } from '../../db/db'
import type { Task } from '../../types/task'
import type { Goal } from '../../types/goal'
import { tasksDueOnDate, isTaskDoneOnDate, taskSortTime } from '../tasks/taskRepository'
import { goalsDueOnDate, isGoalCycleDoneOnDate } from '../goals/goalRepository'
import { isoDateOf, todayISODate } from '../../utils/dateUtils'
import { exportTasksToIcs } from '../calendarExport/exportIcs'
import CategoryDot from '../../components/CategoryDot'
import DraggableItem from '../dnd/DraggableItem'
import DroppableArea from '../dnd/DroppableArea'
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

function draggable(task: Task): boolean {
  return task.type === 'oneoff' || task.type === 'appointment'
}

function chipTimePrefix(task: Task): string {
  if (task.type === 'appointment') return `${task.startTime} `
  if ((task.type === 'oneoff' || task.type === 'recurring') && task.time) return `${task.time} `
  return ''
}

export default function WeeklyPlanner() {
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 })
  const weekKey = isoDateOf(monday)
  const todayStr = todayISODate()

  const days = useLiveQuery<PlanDay[]>(async () => {
    const result: PlanDay[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i)
      const dateStr = isoDateOf(date)
      const tasks = await tasksDueOnDate(dateStr)
      const planTasks = await Promise.all(
        tasks.map(async (task) => ({ task, done: await isTaskDoneOnDate(task, dateStr) })),
      )
      planTasks.sort(
        (a, b) => taskSortTime(a.task).localeCompare(taskSortTime(b.task)) || a.task.title.localeCompare(b.task.title),
      )
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
    () => db.tasks.filter((t) => t.type === 'oneoff' && t.dueDate === null && !t.completed).toArray(),
    [],
  )

  const handleExport = () => {
    const tasks = (days ?? []).flatMap((d) => d.tasks.map((t) => t.task))
    if (tasks.length > 0) exportTasksToIcs(tasks)
  }

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
        <button type="button" className="planner-export" onClick={handleExport} aria-label="Woche zum Kalender">
          <ExportIcon size={18} />
        </button>
      </div>

      <div className="planner-strip">
        {days?.map((day) => {
          const isToday = isSameDay(day.date, new Date())
          return (
            <DroppableArea key={day.dateStr} id={`day:${day.dateStr}`} className={`planner-day${isToday ? ' is-today' : ''}`}>
              <div className="planner-day-head">
                <span className="planner-day-name">{WEEKDAY_LABEL[day.date.getDay()]}</span>
                <span className="planner-day-num">{format(day.date, 'd')}</span>
              </div>
              <div className="planner-day-items">
                {day.tasks.length === 0 && day.goals.length === 0 && <div className="planner-day-empty">–</div>}
                {day.tasks.map(({ task, done }) => {
                  const chip = (
                    <>
                      <CategoryDot categoryId={task.categoryId} />
                      <span className="plan-chip-title">
                        {chipTimePrefix(task)}
                        {task.title}
                      </span>
                    </>
                  )
                  return draggable(task) ? (
                    <DraggableItem
                      key={task.id}
                      id={task.id}
                      data={{ title: task.title }}
                      className={`plan-chip draggable${done ? ' done' : ''}`}
                    >
                      {chip}
                    </DraggableItem>
                  ) : (
                    <div key={task.id} className={`plan-chip locked${done ? ' done' : ''}`}>
                      {chip}
                    </div>
                  )
                })}
                {day.goals.map(({ goal, done, missed }) => (
                  <div key={goal.id} className={`plan-chip goal${done ? ' done' : ''}${missed && !done ? ' missed' : ''}`}>
                    <span className="plan-chip-title">🎯 {goal.title}</span>
                  </div>
                ))}
              </div>
            </DroppableArea>
          )
        })}
      </div>

      <DroppableArea id="tray" className="planner-tray">
        <div className="planner-tray-label">Ungeplant</div>
        <div className="planner-tray-items">
          {unplanned && unplanned.length === 0 && (
            <span className="planner-tray-empty">Keine ungeplanten Aufgaben</span>
          )}
          {unplanned?.map((task) => (
            <DraggableItem key={task.id} id={task.id} data={{ title: task.title }} className="plan-chip draggable">
              <CategoryDot categoryId={task.categoryId} />
              <span className="plan-chip-title">{task.title}</span>
            </DraggableItem>
          ))}
        </div>
      </DroppableArea>
    </div>
  )
}
