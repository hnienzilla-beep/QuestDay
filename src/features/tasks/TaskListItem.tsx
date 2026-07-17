import './TaskListItem.css'
import type { Task } from '../../types/task'
import CheckOffAnimation from '../../components/CheckOffAnimation'
import CategoryBadge from '../../components/CategoryBadge'
import ExportButton from '../calendarExport/ExportButton'

interface Props {
  task: Task
  done: boolean
  onToggle: () => void
}

export default function TaskListItem({ task, done, onToggle }: Props) {
  return (
    <div className={`task-item${done ? ' done' : ''}`}>
      <CheckOffAnimation checked={done} onToggle={onToggle} />
      <div className="task-item-body">
        <div className="task-item-title">{task.title}</div>
        <div className="task-item-meta">
          <CategoryBadge category={task.category} />
          {task.type === 'appointment' && (
            <span className="task-item-time">
              {task.startTime}
              {task.endTime ? `–${task.endTime}` : ''}
            </span>
          )}
          {task.type === 'recurring' && (
            <span className="task-item-time">
              {task.frequency === 'daily' ? 'Täglich' : 'Wöchentlich'}
            </span>
          )}
        </div>
      </div>
      {task.type === 'appointment' && <ExportButton appointment={task} />}
    </div>
  )
}
