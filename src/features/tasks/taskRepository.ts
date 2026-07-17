import { db } from '../../db/db'
import type { Task, OneOffTask, RecurringTask, Appointment, Category } from '../../types/task'

function newId(): string {
  return crypto.randomUUID()
}

export async function addOneOffTask(input: {
  title: string
  category: Category
  dueDate: string | null
  reminderTime: string | null
}): Promise<OneOffTask> {
  const task: OneOffTask = {
    id: newId(),
    type: 'oneoff',
    title: input.title,
    category: input.category,
    dueDate: input.dueDate,
    reminderTime: input.reminderTime,
    reminderFired: false,
    createdAt: new Date().toISOString(),
    completed: false,
    completedAt: null,
  }
  await db.tasks.add(task)
  return task
}

export async function addRecurringTask(input: {
  title: string
  category: Category
  frequency: 'daily' | 'weekly'
  weekday: number | null
  reminderTime: string | null
}): Promise<RecurringTask> {
  const task: RecurringTask = {
    id: newId(),
    type: 'recurring',
    title: input.title,
    category: input.category,
    frequency: input.frequency,
    weekday: input.frequency === 'weekly' ? input.weekday : null,
    reminderTime: input.reminderTime,
    reminderFired: false,
    createdAt: new Date().toISOString(),
    completed: false,
    completedAt: null,
  }
  await db.tasks.add(task)
  return task
}

export async function addAppointment(input: {
  title: string
  category: Category
  date: string
  startTime: string
  endTime: string | null
  location: string | null
  reminderTime: string | null
}): Promise<Appointment> {
  const task: Appointment = {
    id: newId(),
    type: 'appointment',
    title: input.title,
    category: input.category,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    reminderTime: input.reminderTime,
    reminderFired: false,
    createdAt: new Date().toISOString(),
    completed: false,
    completedAt: null,
  }
  await db.tasks.add(task)
  return task
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
  await db.taskCompletions.where('taskId').equals(id).delete()
}

export async function allTasks(): Promise<Task[]> {
  return db.tasks.toArray()
}

function isDueOnDate(task: Task, dateStr: string, weekday: number): boolean {
  if (task.type === 'oneoff') return task.dueDate === dateStr || task.dueDate === null
  if (task.type === 'appointment') return task.date === dateStr
  if (task.frequency === 'daily') return true
  return task.weekday === weekday
}

export async function tasksDueOnDate(dateStr: string): Promise<Task[]> {
  const weekday = new Date(`${dateStr}T00:00:00`).getDay()
  const all = await db.tasks.toArray()
  return all.filter((t) => isDueOnDate(t, dateStr, weekday))
}

export async function isTaskDoneOnDate(task: Task, dateStr: string): Promise<boolean> {
  if (task.type === 'recurring') {
    const entry = await db.taskCompletions
      .where('taskId')
      .equals(task.id)
      .and((c) => c.completedDate === dateStr)
      .first()
    return entry !== undefined
  }
  return task.completed
}
