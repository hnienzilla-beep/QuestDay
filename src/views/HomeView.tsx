import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import './HomeView.css'
import { db } from '../db/db'
import type { Task } from '../types/task'
import type { Goal, SubStep } from '../types/goal'
import { todayISODate } from '../utils/dateUtils'
import { tasksDueOnDate, isTaskDoneOnDate } from '../features/tasks/taskRepository'
import { useCompleteTask } from '../features/tasks/useCompleteTask'
import { BADGE_DEFINITIONS } from '../features/gamification/badges'
import XpBar from '../features/gamification/XpBar'
import NotificationPermissionBanner from '../features/notifications/NotificationPermissionBanner'
import TaskListItem from '../features/tasks/TaskListItem'
import TaskForm from '../features/tasks/TaskForm'
import GoalForm from '../features/goals/GoalForm'
import GoalCard from '../features/goals/GoalCard'

interface TodayItem {
  task: Task
  done: boolean
}

export default function HomeView() {
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState<{ goal: Goal; subSteps: SubStep[] } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const { completeTask, uncompleteTask } = useCompleteTask()
  const todayStr = todayISODate()

  const todayItems = useLiveQuery<TodayItem[]>(async () => {
    const tasks = await tasksDueOnDate(todayStr)
    const withDone = await Promise.all(
      tasks.map(async (task) => ({ task, done: await isTaskDoneOnDate(task, todayStr) })),
    )
    return withDone.sort((a, b) => {
      const aTime = a.task.type === 'appointment' ? a.task.startTime : '99:99'
      const bTime = b.task.type === 'appointment' ? b.task.startTime : '99:99'
      if (aTime !== bTime) return aTime.localeCompare(bTime)
      return a.task.title.localeCompare(b.task.title)
    })
  }, [todayStr])

  const goals = useLiveQuery(
    () => db.goals.toArray().then((list) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
  )

  const handleToggle = async (item: TodayItem) => {
    if (item.done) {
      await uncompleteTask(item.task)
      return
    }
    const result = await completeTask(item.task)
    if (result.newlyUnlockedBadges.length > 0) {
      const badge = BADGE_DEFINITIONS.find((b) => b.id === result.newlyUnlockedBadges[0].badgeId)
      if (badge) {
        setToast(`${badge.icon} Badge freigeschaltet: ${badge.label}`)
        window.setTimeout(() => setToast(null), 2800)
      }
    }
  }

  return (
    <div>
      {toast && <div className="badge-toast">{toast}</div>}

      <XpBar />
      <NotificationPermissionBanner />

      <div className="section-header">
        <h2 className="section-title">Heute</h2>
      </div>

      {todayItems && todayItems.length === 0 && (
        <div className="empty-state">Für heute ist nichts geplant. Genieß den Tag! ☀️</div>
      )}

      {todayItems?.map(({ task, done }) => (
        <TaskListItem key={task.id} task={task} done={done} onToggle={() => handleToggle({ task, done })} />
      ))}

      <div className="section-header">
        <h2 className="section-title">Ziele</h2>
        <button type="button" className="link-btn" onClick={() => setShowGoalForm(true)}>
          + Neues Ziel
        </button>
      </div>

      {goals && goals.length === 0 && (
        <div className="empty-state">Noch keine Langzeit-Ziele angelegt.</div>
      )}

      {goals?.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          onEdit={(g, subSteps) => setEditingGoal({ goal: g, subSteps })}
        />
      ))}

      <button type="button" className="fab" onClick={() => setShowTaskForm(true)} aria-label="Neue Aufgabe">
        +
      </button>

      {showTaskForm && (
        <TaskForm defaultDate={todayStr} onClose={() => setShowTaskForm(false)} />
      )}
      {showGoalForm && <GoalForm onClose={() => setShowGoalForm(false)} />}
      {editingGoal && (
        <GoalForm
          goal={editingGoal.goal}
          existingSubSteps={editingGoal.subSteps}
          onClose={() => setEditingGoal(null)}
        />
      )}
    </div>
  )
}
