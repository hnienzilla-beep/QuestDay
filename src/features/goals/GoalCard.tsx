import { useLiveQuery } from 'dexie-react-hooks'
import './GoalCard.css'
import { db } from '../../db/db'
import type { Goal, SubStep } from '../../types/goal'
import CategoryDot from '../../components/CategoryDot'
import ProgressRing from '../../components/ProgressRing'
import CheckOffAnimation from '../../components/CheckOffAnimation'
import { useCompleteTask } from '../tasks/useCompleteTask'
import { useCompleteGoalCycle } from './useCompleteGoalCycle'
import { currentCycleStatus, stopGoalRecurrence } from './goalRepository'

interface Props {
  goal: Goal
  onEdit: (goal: Goal, subSteps: SubStep[]) => void
}

export default function GoalCard({ goal, onEdit }: Props) {
  const subSteps = useLiveQuery(
    () => db.subSteps.where('goalId').equals(goal.id).sortBy('order'),
    [goal.id],
  )
  const { completeSubStep, uncompleteSubStep } = useCompleteTask()
  const { completeCycleSubStep, uncompleteCycleSubStep } = useCompleteGoalCycle()

  const isRecurring = goal.recurrence !== null
  const cycleStatus = useLiveQuery(
    () => currentCycleStatus(goal),
    [goal.id, JSON.stringify(goal.recurrence)],
  )

  const completedSubStepIds = useLiveQuery(async () => {
    if (!isRecurring || !cycleStatus?.cycleDueDate) return null
    const rows = await db.subStepCycleCompletions
      .where('[goalId+cycleDueDate]')
      .equals([goal.id, cycleStatus.cycleDueDate])
      .toArray()
    return new Set(rows.map((r) => r.subStepId))
  }, [goal.id, cycleStatus?.cycleDueDate])

  if (!subSteps) return null

  const isChecked = (step: SubStep) => (isRecurring ? (completedSubStepIds?.has(step.id) ?? false) : step.completed)
  const doneCount = isRecurring ? subSteps.filter(isChecked).length : subSteps.filter((s) => s.completed).length
  const percent = subSteps.length > 0 ? (doneCount / subSteps.length) * 100 : 0
  const isDone = !isRecurring && goal.completedAt !== null

  const handleToggle = (step: SubStep) => {
    if (isChecked(step)) {
      // Abhaken rückgängig machen.
      if (isRecurring && cycleStatus?.cycleDueDate) {
        uncompleteCycleSubStep(step, goal, cycleStatus.cycleDueDate)
      } else {
        uncompleteSubStep(step)
      }
      return
    }
    const isLast = doneCount + 1 === subSteps.length
    if (isRecurring && cycleStatus?.cycleDueDate) {
      completeCycleSubStep(step, goal, cycleStatus.cycleDueDate, subSteps.length, isLast)
    } else {
      completeSubStep(step, isLast)
    }
  }

  return (
    <div className={`goal-card${isDone ? ' done' : ''}`} onClick={() => onEdit(goal, subSteps)}>
      <div className="goal-card-top">
        <div className="goal-card-heading">
          <span className="goal-card-title">{goal.title}</span>
          <CategoryDot categoryId={goal.categoryId} />
        </div>
        <ProgressRing percent={percent} size={46} />
      </div>
      {goal.target && <div className="goal-card-target">{goal.target}</div>}

      <div className="goal-card-progress-label">
        <span>
          {doneCount} / {subSteps.length} Schritte
        </span>
        {isDone && <span className="goal-done-label">Abgeschlossen</span>}
        {isRecurring && cycleStatus?.isMissed && <span className="goal-missed-badge">Verpasst</span>}
      </div>

      {isRecurring && (
        <div className="goal-cycle-row" onClick={(e) => e.stopPropagation()}>
          <span className="goal-cycle-count">{cycleStatus?.completionCount ?? 0}× erledigt</span>
          {!goal.recurrence!.stoppedAt ? (
            <button type="button" className="goal-stop-btn" onClick={() => stopGoalRecurrence(goal.id)}>
              Wiederholung stoppen
            </button>
          ) : (
            <span className="goal-stopped-label">Gestoppt</span>
          )}
        </div>
      )}

      <div className="substep-list" onClick={(e) => e.stopPropagation()}>
        {subSteps.map((step) => (
          <div key={step.id} className={`substep-item${isChecked(step) ? ' done' : ''}`}>
            <CheckOffAnimation checked={isChecked(step)} onToggle={() => handleToggle(step)} />
            <span>{step.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
