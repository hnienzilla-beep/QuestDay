import './TaskListItem.css'
import type { Task } from '../../types/task'
import CheckOffAnimation from '../../components/CheckOffAnimation'
import CategoryDot from '../../components/CategoryDot'
import ExportButton from '../calendarExport/ExportButton'

interface Props {
  task: Task
  done: boolean
  onToggle: () => void
  onEdit?: () => void
}

const WEEKDAY_SHORT: Record<number, string> = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 0: 'So' }
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function recurringLabel(task: Extract<Task, { type: 'recurring' }>): string {
  const base =
    task.frequency === 'daily'
      ? 'Täglich'
      : task.weekdays.length === 0
        ? 'Wöchentlich'
        : WEEKDAY_ORDER.filter((d) => task.weekdays.includes(d))
            .map((d) => WEEKDAY_SHORT[d])
            .join(', ')
  return task.time ? `${base} · ${task.time}` : base
}

export default function TaskListItem({ task, done, onToggle, onEdit }: Props) {
  const body = (
    <>
      <div className="task-item-title">{task.title}</div>
      <div className="task-item-meta">
        <CategoryDot categoryId={task.categoryId} />
        {task.type === 'appointment' && (
          <span className="task-item-time">
            {task.startTime}
            {task.endTime ? `–${task.endTime}` : ''}
          </span>
        )}
        {task.type === 'oneoff' && task.time && <span className="task-item-time">{task.time}</span>}
        {task.type === 'recurring' && <span className="task-item-time">{recurringLabel(task)}</span>}
      </div>
    </>
  )

  return (
    <div className={`task-item${done ? ' done' : ''}`}>
      <CheckOffAnimation checked={done} onToggle={onToggle} />
      {onEdit ? (
        <button type="button" className="task-item-body" onClick={onEdit}>
          {body}
        </button>
      ) : (
        <div className="task-item-body">{body}</div>
      )}
      <ExportButton task={task} />
    </div>
  )
}
