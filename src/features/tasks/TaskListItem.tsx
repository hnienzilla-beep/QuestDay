import './TaskListItem.css'
import type { Task } from '../../types/task'
import CheckOffAnimation from '../../components/CheckOffAnimation'
import CategoryDot from '../../components/CategoryDot'
import ExportButton from '../calendarExport/ExportButton'

interface Props {
  task: Task
  done: boolean
  onToggle: () => void
}

const WEEKDAY_SHORT: Record<number, string> = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 0: 'So' }
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function recurringLabel(task: Extract<Task, { type: 'recurring' }>): string {
  if (task.frequency === 'daily') return 'Täglich'
  if (task.weekdays.length === 0) return 'Wöchentlich'
  return WEEKDAY_ORDER.filter((d) => task.weekdays.includes(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ')
}

export default function TaskListItem({ task, done, onToggle }: Props) {
  return (
    <div className={`task-item${done ? ' done' : ''}`}>
      <CheckOffAnimation checked={done} onToggle={onToggle} />
      <div className="task-item-body">
        <div className="task-item-title">{task.title}</div>
        <div className="task-item-meta">
          <CategoryDot categoryId={task.categoryId} />
          {task.type === 'appointment' && (
            <span className="task-item-time">
              {task.startTime}
              {task.endTime ? `–${task.endTime}` : ''}
            </span>
          )}
          {task.type === 'recurring' && <span className="task-item-time">{recurringLabel(task)}</span>}
        </div>
      </div>
      {task.type === 'appointment' && <ExportButton appointment={task} />}
    </div>
  )
}
