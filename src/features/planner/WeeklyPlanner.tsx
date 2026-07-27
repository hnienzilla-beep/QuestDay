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
import { useCategoriesMap } from '../categories/useCategories'
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

/** Wochentag-Index Mo=0 … So=6 */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

export default function WeeklyPlanner() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(() => mondayIndex(new Date()))
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
  const categoriesMap = useCategoriesMap()

  // Ungeplante nach Kategorie gruppieren (Kategorien alphabetisch, "Ohne Kategorie" zuletzt).
  const unplannedGroups = (() => {
    if (!unplanned) return []
    const byCat = new Map<string | null, Task[]>()
    for (const t of unplanned) {
      const arr = byCat.get(t.categoryId) ?? []
      arr.push(t)
      byCat.set(t.categoryId, arr)
    }
    return [...byCat.entries()]
      .map(([catId, tasks]) => ({
        catId,
        category: catId ? categoriesMap?.get(catId) : undefined,
        tasks: tasks.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => {
        if (a.catId === null) return 1
        if (b.catId === null) return -1
        return (a.category?.name ?? '').localeCompare(b.category?.name ?? '')
      })
  })()

  const handleExport = () => {
    const tasks = (days ?? []).flatMap((d) => d.tasks.map((t) => t.task))
    if (tasks.length > 0) exportTasksToIcs(tasks)
  }

  const selected = days?.[selectedIndex]

  const renderChip = ({ task, done }: PlanTask) => {
    const inner = (
      <>
        <CategoryDot categoryId={task.categoryId} />
        <span className="plan-chip-title">
          {chipTimePrefix(task)}
          {task.title}
        </span>
      </>
    )
    return draggable(task) ? (
      <DraggableItem key={task.id} id={task.id} data={{ title: task.title }} className={`plan-chip draggable${done ? ' done' : ''}`}>
        {inner}
      </DraggableItem>
    ) : (
      <div key={task.id} className={`plan-chip locked${done ? ' done' : ''}`}>
        {inner}
      </div>
    )
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

      <div className="weekbar">
        {days?.map((day, i) => {
          const isToday = isSameDay(day.date, new Date())
          const hasItems = day.tasks.length > 0 || day.goals.length > 0
          return (
            <DroppableArea
              key={day.dateStr}
              id={`day:${day.dateStr}`}
              className={`weekbar-day${isToday ? ' is-today' : ''}${i === selectedIndex ? ' is-selected' : ''}`}
            >
              <button type="button" className="weekbar-day-btn" onClick={() => setSelectedIndex(i)}>
                <span className="weekbar-dow">{WEEKDAY_LABEL[day.date.getDay()]}</span>
                <span className="weekbar-num">{format(day.date, 'd')}</span>
                <span className={`weekbar-dot${hasItems ? ' on' : ''}`} />
              </button>
            </DroppableArea>
          )
        })}
      </div>

      {selected && (
        <DroppableArea id={`dayfull:${selected.dateStr}`} className="planner-selected">
          <div className="planner-selected-head">{format(selected.date, 'EEEE, d. MMMM', { locale: de })}</div>
          <div className="planner-selected-items">
            {selected.tasks.length === 0 && selected.goals.length === 0 && (
              <div className="planner-day-empty">Nichts geplant</div>
            )}
            {selected.tasks.map(renderChip)}
            {selected.goals.map(({ goal, done, missed }) => (
              <div key={goal.id} className={`plan-chip goal${done ? ' done' : ''}${missed && !done ? ' missed' : ''}`}>
                <span className="plan-chip-title">🎯 {goal.title}</span>
              </div>
            ))}
          </div>
        </DroppableArea>
      )}

      <DroppableArea id="tray" className="planner-tray">
        <div className="planner-tray-label">Ungeplant</div>
        {unplannedGroups.length === 0 && <span className="planner-tray-empty">Keine ungeplanten Aufgaben</span>}
        {unplannedGroups.map((group) => (
          <div className="tray-group" key={group.catId ?? 'none'}>
            <div className="tray-group-head">
              {group.category && <span className="tray-group-dot" style={{ background: group.category.color }} />}
              {group.category?.name ?? 'Ohne Kategorie'}
            </div>
            <div className="planner-tray-items">
              {group.tasks.map((task) => (
                <DraggableItem key={task.id} id={task.id} data={{ title: task.title }} className="plan-chip draggable">
                  <span className="plan-chip-title">{task.title}</span>
                </DraggableItem>
              ))}
            </div>
          </div>
        ))}
      </DroppableArea>
    </div>
  )
}
