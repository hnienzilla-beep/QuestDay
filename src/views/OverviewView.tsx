import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import './OverviewView.css'
import type { View } from '../App'
import { db } from '../db/db'
import type { Task } from '../types/task'
import { todayISODate } from '../utils/dateUtils'
import { tasksDueOnDate, isTaskDoneOnDate, taskSortTime, setTaskDate } from '../features/tasks/taskRepository'
import { triggerAutoSync } from '../features/obsidianSync/autoSync'
import { useCompleteTask } from '../features/tasks/useCompleteTask'
import AppHeader from '../components/AppHeader'
import ProgressRing from '../components/ProgressRing'
import NotificationPermissionBanner from '../features/notifications/NotificationPermissionBanner'
import TaskListItem from '../features/tasks/TaskListItem'
import TaskForm from '../features/tasks/TaskForm'
import WeeklyPlanner from '../features/planner/WeeklyPlanner'
import GoalSummaryItem from '../features/goals/GoalSummaryItem'
import DraggableItem from '../features/dnd/DraggableItem'
import { PlusIcon } from '../components/icons'

function isDraggable(task: Task): boolean {
  return task.type === 'oneoff' || task.type === 'appointment'
}

interface TodayItem {
  task: Task
  done: boolean
}

interface Props {
  onOpenSettings: () => void
  onNavigate: (view: View) => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Hallo'
  return 'Guten Abend'
}

export default function OverviewView({ onOpenSettings, onNavigate }: Props) {
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [dragLabel, setDragLabel] = useState<string | null>(null)
  const { completeTask, uncompleteTask } = useCompleteTask()
  const todayStr = todayISODate()

  // Ziehen erst nach kurzem Halten/Bewegen aktivieren, damit Tippen/Scrollen erhalten bleibt.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 160, tolerance: 8 } }))

  const handleDragStart = (e: DragStartEvent) => {
    setDragLabel((e.active.data.current?.title as string) ?? '')
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setDragLabel(null)
    const overId = e.over?.id
    if (typeof overId !== 'string') return
    const taskId = String(e.active.id)
    if (overId.startsWith('day:')) {
      setTaskDate(taskId, overId.slice(4)).then(triggerAutoSync)
    } else if (overId.startsWith('dayfull:')) {
      setTaskDate(taskId, overId.slice(8)).then(triggerAutoSync)
    } else if (overId === 'tray') {
      setTaskDate(taskId, null).then(triggerAutoSync)
    }
  }

  const todayItems = useLiveQuery<TodayItem[]>(async () => {
    const tasks = await tasksDueOnDate(todayStr)
    const withDone = await Promise.all(
      tasks.map(async (task) => ({ task, done: await isTaskDoneOnDate(task, todayStr) })),
    )
    return withDone.sort((a, b) => {
      const aTime = taskSortTime(a.task)
      const bTime = taskSortTime(b.task)
      if (aTime !== bTime) return aTime.localeCompare(bTime)
      return a.task.title.localeCompare(b.task.title)
    })
  }, [todayStr])

  const goals = useLiveQuery(
    () => db.goals.toArray().then((list) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
  )

  const total = todayItems?.length ?? 0
  const done = todayItems?.filter((i) => i.done).length ?? 0
  const percent = total > 0 ? (done / total) * 100 : 0

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <AppHeader onOpenSettings={onOpenSettings}>
        <div className="overview-greeting">{greeting()}</div>
        <div className="overview-date">{format(new Date(), 'EEEE, d. MMMM', { locale: de })}</div>
      </AppHeader>

      <NotificationPermissionBanner />

      <div className="overview-progress">
        <ProgressRing percent={percent} size={56} stroke={5} label={total === 0 ? '–' : undefined} />
        <div className="overview-progress-text">
          {total === 0 ? (
            <>
              <strong>Nichts für heute geplant</strong>
              <span>Genieß den Tag.</span>
            </>
          ) : (
            <>
              <strong>
                {done} von {total} erledigt
              </strong>
              <span>{done === total ? 'Alles geschafft!' : 'Du schaffst das.'}</span>
            </>
          )}
        </div>
      </div>

      <div className="section-header">
        <h2 className="section-title">Heute</h2>
      </div>
      {todayItems?.map(({ task, done }) => {
        const item = (
          <TaskListItem
            key={task.id}
            task={task}
            done={done}
            onToggle={() => (done ? uncompleteTask(task) : completeTask(task))}
            onEdit={() => setEditingTask(task)}
          />
        )
        return isDraggable(task) ? (
          <DraggableItem key={task.id} id={task.id} data={{ title: task.title }}>
            {item}
          </DraggableItem>
        ) : (
          item
        )
      })}

      <div className="section-header">
        <h2 className="section-title">Woche planen</h2>
      </div>
      <WeeklyPlanner />

      <div className="section-header">
        <h2 className="section-title">Ziele</h2>
        <button type="button" className="link-btn" onClick={() => onNavigate('goals')}>
          Alle ansehen
        </button>
      </div>
      {goals && goals.length === 0 && <div className="empty-state">Noch keine Ziele angelegt.</div>}
      {goals?.slice(0, 4).map((goal) => (
        <GoalSummaryItem key={goal.id} goal={goal} onClick={() => onNavigate('goals')} />
      ))}

      <button type="button" className="fab" onClick={() => setShowTaskForm(true)} aria-label="Neue Aufgabe">
        <PlusIcon size={26} />
      </button>

      {showTaskForm && <TaskForm onClose={() => setShowTaskForm(false)} />}
      {editingTask && <TaskForm task={editingTask} onClose={() => setEditingTask(null)} />}

      <DragOverlay>
        {dragLabel !== null ? <div className="plan-ghost">{dragLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}
