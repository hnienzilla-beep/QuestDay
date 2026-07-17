import Dexie, { type Table } from 'dexie'
import type { Task, TaskCompletion } from '../types/task'
import type { Goal, SubStep } from '../types/goal'
import type { UserStats, UnlockedBadge, CustomReward } from '../types/gamification'

class QuestDayDB extends Dexie {
  tasks!: Table<Task, string>
  taskCompletions!: Table<TaskCompletion, string>
  goals!: Table<Goal, string>
  subSteps!: Table<SubStep, string>
  userStats!: Table<UserStats, string>
  unlockedBadges!: Table<UnlockedBadge, string>
  customRewards!: Table<CustomReward, string>

  constructor() {
    super('questday')
    this.version(1).stores({
      tasks: 'id, type, category, dueDate, date, completed, reminderTime',
      taskCompletions: 'id, taskId, completedDate',
      goals: 'id, category, completedAt',
      subSteps: 'id, goalId, order',
      userStats: 'id',
      unlockedBadges: 'badgeId',
      customRewards: 'id, claimed',
    })
  }
}

export const db = new QuestDayDB()
