import type { Category } from './task'

export interface SubStep {
  id: string
  goalId: string
  title: string
  completed: boolean
  completedAt: string | null
  order: number
}

export interface Goal {
  id: string
  title: string
  target: string
  category: Category
  createdAt: string
  targetDate: string | null
  completedAt: string | null
}
