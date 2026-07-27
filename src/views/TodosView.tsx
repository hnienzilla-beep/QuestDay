import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays } from 'date-fns'
import './TodosView.css'
import type { Task } from '../types/task'
import { todayISODate, isoDateOf } from '../utils/dateUtils'
import { isTaskDoneOnDate } from '../features/tasks/taskRepository'
import { db } from '../db/db'
import { useCompleteTask } from '../features/tasks/useCompleteTask'
import AppHeader from '../components/AppHeader'
import TaskListItem from '../features/tasks/TaskListItem'
import TaskForm from '../features/tasks/TaskForm'
import QuickAddRow from '../features/tasks/QuickAddRow'
import CategoryFilterChips, { type CategoryFilter } from '../features/categories/CategoryFilterChips'
import { PlusIcon } from '../components/icons'

type Bucket = 'today' | 'tomorrow' | 'later' | 'none' | 'recurring'

const BUCKET_ORDER: Bucket[] = ['today', 'tomorrow', 'later', 'none', 'recurring']
const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'Heute',
  tomorrow: 'Morgen',
  later: 'Später',
  none: 'Ohne Datum',
  recurring: 'Wiederkehrend',
}

interface Row {
  task: Task
  done: boolean
}

function bucketOf(task: Task, todayStr: string, tomorrowStr: string): Bucket {
  if (task.type === 'recurring') return 'recurring'
  const d = task.type === 'appointment' ? task.date : task.dueDate
  if (!d) return 'none'
  if (d <= todayStr) return 'today'
  if (d === tomorrowStr) return 'tomorrow'
  return 'later'
}

function matchesFilter(task: Task, filter: CategoryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'none') return task.categoryId === null
  return task.categoryId === filter
}

interface Props {
  onOpenSettings: () => void
}

export default function TodosView({ onOpenSettings }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const { completeTask, uncompleteTask } = useCompleteTask()

  const todayStr = todayISODate()
  const tomorrowStr = isoDateOf(addDays(new Date(), 1))

  const groups = useLiveQuery(async () => {
    const all = await db.tasks.toArray()
    const rows: Row[] = await Promise.all(
      all.map(async (task) => ({ task, done: await isTaskDoneOnDate(task, todayStr) })),
    )
    const map: Record<Bucket, Row[]> = { today: [], tomorrow: [], later: [], none: [], recurring: [] }
    for (const row of rows) {
      map[bucketOf(row.task, todayStr, tomorrowStr)].push(row)
    }
    for (const b of BUCKET_ORDER) {
      map[b].sort((a, z) => {
        const at = a.task.type === 'appointment' ? a.task.startTime : '99:99'
        const zt = z.task.type === 'appointment' ? z.task.startTime : '99:99'
        return at.localeCompare(zt) || a.task.title.localeCompare(z.task.title)
      })
    }
    return map
  }, [todayStr, tomorrowStr])

  if (!groups) return null

  const totalCount = BUCKET_ORDER.reduce((n, b) => n + groups[b].length, 0)

  return (
    <div>
      <AppHeader onOpenSettings={onOpenSettings}>
        <div className="page-title">ToDos</div>
      </AppHeader>

      <QuickAddRow />
      <CategoryFilterChips value={filter} onChange={setFilter} />

      {totalCount === 0 && <div className="empty-state">Noch keine Aufgaben. Leg oben deine erste an.</div>}

      {BUCKET_ORDER.map((bucket) => {
        const rows = groups[bucket]
          .filter((r) => matchesFilter(r.task, filter))
          .filter((r) => showCompleted || !r.done)
        if (rows.length === 0) return null
        return (
          <div key={bucket}>
            <div className="section-header">
              <h2 className="section-title">{BUCKET_LABEL[bucket]}</h2>
            </div>
            {rows.map(({ task, done }) => (
              <TaskListItem
                key={task.id}
                task={task}
                done={done}
                onToggle={() => (done ? uncompleteTask(task) : completeTask(task))}
              />
            ))}
          </div>
        )
      })}

      {totalCount > 0 && (
        <button type="button" className="todos-toggle-completed" onClick={() => setShowCompleted((v) => !v)}>
          {showCompleted ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}
        </button>
      )}

      <button type="button" className="fab" onClick={() => setShowForm(true)} aria-label="Neue Aufgabe">
        <PlusIcon size={26} />
      </button>

      {showForm && <TaskForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
