import Dexie, { type Table } from 'dexie'
import type { Task, TaskCompletion } from '../types/task'
import type { Goal, SubStep, GoalCycleCompletion, SubStepCycleCompletion } from '../types/goal'
import type { Category } from '../types/category'

/** Farben der alten fixen Kategorien – bei der Migration in echte Kategorie-Zeilen übernommen. */
const LEGACY_CATEGORY_COLORS: Record<string, string> = {
  Haushalt: '#eda100',
  Arbeit: '#2a78d6',
  Hobby: '#008300',
  Sonstiges: '#e87ba4',
}

class ToDoDB extends Dexie {
  tasks!: Table<Task, string>
  taskCompletions!: Table<TaskCompletion, string>
  goals!: Table<Goal, string>
  subSteps!: Table<SubStep, string>
  goalCycleCompletions!: Table<GoalCycleCompletion, string>
  subStepCycleCompletions!: Table<SubStepCycleCompletion, string>
  categories!: Table<Category, string>

  constructor() {
    // DB-Name bleibt 'questday', damit bestehende Installationen ihre Daten behalten.
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

    this.version(2).stores({
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

    // Version 3: Gamification entfernt, Kategorien zu eigener Tabelle, weekday -> weekdays[].
    this.version(3)
      .stores({
        tasks: 'id, type, categoryId, dueDate, date, completed, reminderTime',
        taskCompletions: 'id, taskId, completedDate',
        goals: 'id, categoryId, completedAt',
        subSteps: 'id, goalId, order',
        goalCycleCompletions: 'id, goalId, cycleDueDate, [goalId+cycleDueDate]',
        subStepCycleCompletions: 'id, subStepId, goalId, cycleDueDate, [goalId+cycleDueDate]',
        categories: 'id, name',
        // Gamification-Tabellen löschen:
        userStats: null,
        unlockedBadges: null,
        customRewards: null,
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString()
        const tasksTable = tx.table('tasks')
        const goalsTable = tx.table('goals')
        const categoriesTable = tx.table('categories')

        // 1. Distinct Kategorie-Namen aus Tasks + Zielen sammeln.
        const names = new Set<string>()
        await tasksTable.toCollection().each((t) => {
          if (t.category) names.add(t.category)
        })
        await goalsTable.toCollection().each((g) => {
          if (g.category) names.add(g.category)
        })

        // 2. Pro Name eine Kategorie-Zeile anlegen.
        const idByName = new Map<string, string>()
        for (const name of names) {
          const id = crypto.randomUUID()
          idByName.set(name, id)
          await categoriesTable.add({
            id,
            name,
            color: LEGACY_CATEGORY_COLORS[name] ?? '#8a8a8a',
            createdAt: now,
          })
        }

        // 3. Tasks remappen: category -> categoryId, weekday -> weekdays[].
        await tasksTable.toCollection().modify((t) => {
          t.categoryId = t.category ? (idByName.get(t.category) ?? null) : null
          delete t.category
          if (t.type === 'recurring') {
            t.weekdays = t.weekday != null ? [t.weekday] : []
            delete t.weekday
          }
        })

        // 4. Ziele remappen: category -> categoryId, recurrence.weekday -> recurrence.weekdays[].
        await goalsTable.toCollection().modify((g) => {
          g.categoryId = g.category ? (idByName.get(g.category) ?? null) : null
          delete g.category
          if (g.recurrence) {
            g.recurrence.weekdays = g.recurrence.weekday != null ? [g.recurrence.weekday] : []
            delete g.recurrence.weekday
          }
        })

        // 5. Completion-Tabellen: xpAwarded entfernen, category -> categoryId.
        await tx
          .table('taskCompletions')
          .toCollection()
          .modify((c) => {
            c.categoryId = c.category ? (idByName.get(c.category) ?? null) : null
            delete c.category
            delete c.xpAwarded
          })
        await tx
          .table('goalCycleCompletions')
          .toCollection()
          .modify((c) => {
            c.categoryId = c.category ? (idByName.get(c.category) ?? null) : null
            delete c.category
            delete c.xpAwarded
          })
      })

    // Version 4: optionale Uhrzeit (time) für einmalige & wiederkehrende Aufgaben.
    this.version(4)
      .stores({
        tasks: 'id, type, categoryId, dueDate, date, completed, reminderTime',
      })
      .upgrade(async (tx) => {
        await tx
          .table('tasks')
          .toCollection()
          .modify((t) => {
            if ((t.type === 'oneoff' || t.type === 'recurring') && t.time === undefined) {
              t.time = null
            }
          })
      })
  }
}

export const db = new ToDoDB()
