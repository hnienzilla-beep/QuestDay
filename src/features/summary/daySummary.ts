import { db } from '../../db/db'
import type { Category, Task } from '../../types/task'
import { todayISODate } from '../../utils/dateUtils'
import { tasksDueOnDate, isTaskDoneOnDate } from '../tasks/taskRepository'
import { goalsDueOnDate, isGoalCycleDoneOnDate } from '../goals/goalRepository'

export interface SummaryTask {
  id: string
  title: string
  category: Category
  type: Task['type']
  /** Startzeit bei Terminen, sonst null. */
  time: string | null
  /** Nur bei Terminen gesetzt. */
  location: string | null
  done: boolean
  /** Einmalige Aufgabe ohne Fälligkeitsdatum - taucht an jedem Tag als "offen" auf. */
  undated: boolean
}

export interface SummaryGoal {
  id: string
  title: string
  category: Category
  reminderTime: string | null
  done: boolean
}

export interface DaySummary {
  dateStr: string
  isToday: boolean
  tasks: SummaryTask[]
  goals: SummaryGoal[]
  doneCount: number
  openCount: number
  totalCount: number
  /** An diesem Tag gesammelte XP (nur für vergangene/heutige Tage sinnvoll). */
  xpOnDate: number
  level: number
  xpTotal: number
  currentStreak: number
}

function sortByTime(a: SummaryTask, b: SummaryTask): number {
  const aTime = a.time ?? '99:99'
  const bTime = b.time ?? '99:99'
  if (aTime !== bTime) return aTime.localeCompare(bTime)
  return a.title.localeCompare(b.title)
}

function toSummaryTask(task: Task, done: boolean): SummaryTask {
  return {
    id: task.id,
    title: task.title,
    category: task.category,
    type: task.type,
    time: task.type === 'appointment' ? task.startTime : null,
    location: task.type === 'appointment' ? task.location : null,
    done,
    undated: task.type === 'oneoff' && task.dueDate === null,
  }
}

/**
 * Stellt alles zusammen, was an einem Tag ansteht: fällige Aufgaben, Termine und
 * Zyklen wiederkehrender Ziele - jeweils mit Erledigt-Status.
 *
 * Für zukünftige Tage werden bereits erledigte einmalige Aufgaben und Termine
 * ausgeblendet: sie sind abgehakt und stehen morgen nicht mehr an.
 */
export async function buildDaySummary(dateStr: string): Promise<DaySummary> {
  const today = todayISODate()
  const isToday = dateStr === today
  const isFuture = dateStr > today

  const dueTasks = await tasksDueOnDate(dateStr)
  const withDone = await Promise.all(
    dueTasks.map(async (task) => toSummaryTask(task, await isTaskDoneOnDate(task, dateStr))),
  )
  const tasks = withDone.filter((t) => !(isFuture && t.done && t.type !== 'recurring')).sort(sortByTime)

  const dueGoals = await goalsDueOnDate(dateStr)
  const goals: SummaryGoal[] = await Promise.all(
    dueGoals.map(async (goal) => ({
      id: goal.id,
      title: goal.title,
      category: goal.category,
      reminderTime: goal.recurrence?.reminderTime ?? null,
      done: await isGoalCycleDoneOnDate(goal.id, dateStr),
    })),
  )
  goals.sort((a, b) => (a.reminderTime ?? '99:99').localeCompare(b.reminderTime ?? '99:99') || a.title.localeCompare(b.title))

  const [completions, stats] = await Promise.all([
    db.taskCompletions.where('completedDate').equals(dateStr).toArray(),
    db.userStats.get('singleton'),
  ])

  const doneCount = tasks.filter((t) => t.done).length + goals.filter((g) => g.done).length
  const totalCount = tasks.length + goals.length

  return {
    dateStr,
    isToday,
    tasks,
    goals,
    doneCount,
    openCount: totalCount - doneCount,
    totalCount,
    xpOnDate: completions.reduce((sum, c) => sum + c.xpAwarded, 0),
    level: stats?.level ?? 1,
    xpTotal: stats?.xpTotal ?? 0,
    currentStreak: stats?.currentStreak ?? 0,
  }
}
