export type Category = 'Haushalt' | 'Arbeit' | 'Hobby' | 'Sonstiges'

export const CATEGORIES: Category[] = ['Haushalt', 'Arbeit', 'Hobby', 'Sonstiges']

export type TaskType = 'oneoff' | 'recurring' | 'appointment'

interface BaseTask {
  id: string
  title: string
  category: Category
  createdAt: string
  /** Nur für oneoff/appointment maßgeblich. Recurring-Tasks werden über taskCompletions ausgewertet. */
  completed: boolean
  completedAt: string | null
  reminderTime: string | null
  reminderFired: boolean
}

export interface OneOffTask extends BaseTask {
  type: 'oneoff'
  dueDate: string | null
}

export interface RecurringTask extends BaseTask {
  type: 'recurring'
  frequency: 'daily' | 'weekly'
  /** 0 = Sonntag ... 6 = Samstag, erforderlich wenn frequency === 'weekly' */
  weekday: number | null
}

export interface Appointment extends BaseTask {
  type: 'appointment'
  date: string
  startTime: string
  endTime: string | null
  location: string | null
}

export type Task = OneOffTask | RecurringTask | Appointment

export interface TaskCompletion {
  id: string
  taskId: string
  taskType: TaskType
  category: Category
  completedDate: string
  completedAt: string
  xpAwarded: number
}
