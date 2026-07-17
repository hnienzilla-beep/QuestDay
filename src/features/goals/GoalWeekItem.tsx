import './GoalWeekItem.css'
import type { Goal } from '../../types/goal'
import CategoryBadge from '../../components/CategoryBadge'

interface Props {
  goal: Goal
  done: boolean
  missed: boolean
}

export default function GoalWeekItem({ goal, done, missed }: Props) {
  const statusLabel = done ? 'Erledigt' : missed ? 'Verpasst' : 'Fällig'
  const statusClass = done ? 'done' : missed ? 'missed' : 'due'

  return (
    <div className={`goal-week-item${done ? ' done' : ''}`}>
      <div className="goal-week-item-body">
        <div className="goal-week-item-title">🎯 {goal.title}</div>
        <div className="goal-week-item-meta">
          <CategoryBadge category={goal.category} />
          <span className={`goal-week-item-status ${statusClass}`}>{statusLabel}</span>
        </div>
      </div>
    </div>
  )
}
