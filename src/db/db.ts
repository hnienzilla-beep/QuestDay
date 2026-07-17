import Dexie, { type Table } from 'dexie'
import type { Task, TaskCompletion } from '../types/task'
import type { Goal, SubStep, GoalCycleCompletion, SubStepCycleCompletion } from '../types/goal'
import type { UserStats, UnlockedBadge, CustomReward } from '../types/gamification'

class QuestDayDB extends Dexie {
  tasks!: Table<Task, string>
  taskCompletions!: Table<TaskCompletion, string>
  goals!: Table<Goal, string>
  subSteps!: Table<SubStep, string>
  goalCycleCompletions!: Table<GoalCycleCompletion, string>
  subStepCycleCompletions!: Table<SubStepCycleCompletion, string>
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

    this.version(2)
      .stores({
        tasks: 'id, type, category, dueDate, date, completed, reminderTime',
        taskCompletions: 'id, taskId, completedDate',
        goals: 'id, category, completedAt',
        subSteps: 'id, goalId, order',
        goalCycleCompletions: 'id, goalId, cycleDueDate, [goalId+cycleDueDate]',
        subStepCycleCompletions: 'id, subStepId, goalId, cycleDueDate, [goalId+cycleDueDate]',
        userStats: 'id',
        unlockedBadges: 'badgeId',
        customRewards: 'id, claimed',
      })
      .upgrade(async (tx) => {
        // Bestehende Goal-Zeilen haben noch kein `recurrence`-Feld (undefined, nicht null) -
        // einmalig auf null backfillen, damit der Rest des Codes strikt `=== null` prüfen kann.
        await tx
          .table('goals')
          .toCollection()
          .modify((g) => {
            g.recurrence = null
          })
      })
  }
}

export const db = new QuestDayDB()
