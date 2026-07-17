import { useLiveQuery } from 'dexie-react-hooks'
import './GoalCard.css'
import { db } from '../../db/db'
import type { Goal } from '../../types/goal'
import CategoryBadge from '../../components/CategoryBadge'
import ProgressBar from '../../components/ProgressBar'
import CheckOffAnimation from '../../components/CheckOffAnimation'
import { useCompleteTask } from '../tasks/useCompleteTask'

export default function GoalCard({ goal }: { goal: Goal }) {
  const subSteps = useLiveQuery(
    () => db.subSteps.where('goalId').equals(goal.id).sortBy('order'),
    [goal.id],
  )
  const { completeSubStep } = useCompleteTask()

  if (!subSteps) return null

  const doneCount = subSteps.filter((s) => s.completed).length
  const percent = subSteps.length > 0 ? (doneCount / subSteps.length) * 100 : 0
  const isDone = goal.completedAt !== null

  return (
    <div className={`goal-card${isDone ? ' done' : ''}`}>
      <div className="goal-card-top">
        <span className="goal-card-title">{isDone ? '🏆 ' : ''}{goal.title}</span>
        <CategoryBadge category={goal.category} />
      </div>
      {goal.target && <div className="goal-card-target">{goal.target}</div>}

      <ProgressBar percent={percent} />
      <div className="goal-card-progress-label">
        <span>
          {doneCount} / {subSteps.length} Schritte
        </span>
        {isDone && <span>Abgeschlossen 🎉</span>}
      </div>

      <div className="substep-list">
        {subSteps.map((step) => (
          <div key={step.id} className={`substep-item${step.completed ? ' done' : ''}`}>
            <CheckOffAnimation
              checked={step.completed}
              onToggle={() => {
                if (!step.completed) {
                  const isLast = doneCount + 1 === subSteps.length
                  completeSubStep(step, isLast)
                }
              }}
            />
            <span>{step.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
