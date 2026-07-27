import './GoalSummaryItem.css'
import type { Goal } from '../../types/goal'
import ProgressRing from '../../components/ProgressRing'
import CategoryDot from '../../components/CategoryDot'
import { useGoalProgress } from './useGoalProgress'

/** Kompakte, nicht-editierbare Ziel-Zeile für die Übersicht. */
export default function GoalSummaryItem({ goal, onClick }: { goal: Goal; onClick?: () => void }) {
  const progress = useGoalProgress(goal)
  if (!progress) return null

  return (
    <button type="button" className="goal-summary-item" onClick={onClick}>
      <ProgressRing percent={progress.percent} size={40} stroke={4} />
      <div className="goal-summary-body">
        <div className="goal-summary-title">{goal.title}</div>
        <div className="goal-summary-meta">
          <span>
            {progress.done} / {progress.total} Schritte
          </span>
          <CategoryDot categoryId={goal.categoryId} />
          {progress.isMissed && <span className="goal-summary-missed">Verpasst</span>}
        </div>
      </div>
    </button>
  )
}
