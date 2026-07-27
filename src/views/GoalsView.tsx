import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Goal, SubStep } from '../types/goal'
import AppHeader from '../components/AppHeader'
import GoalCard from '../features/goals/GoalCard'
import GoalForm from '../features/goals/GoalForm'
import { PlusIcon } from '../components/icons'

interface Props {
  onOpenSettings: () => void
}

export default function GoalsView({ onOpenSettings }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<{ goal: Goal; subSteps: SubStep[] } | null>(null)

  const goals = useLiveQuery(
    () => db.goals.toArray().then((list) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
  )

  return (
    <div>
      <AppHeader onOpenSettings={onOpenSettings}>
        <div className="page-title">Ziele</div>
      </AppHeader>

      {goals && goals.length === 0 && (
        <div className="empty-state">
          Noch keine Ziele. Tippe auf +, um dein erstes Ziel mit Teilschritten anzulegen.
        </div>
      )}

      {goals?.map((goal) => (
        <GoalCard key={goal.id} goal={goal} onEdit={(g, subSteps) => setEditing({ goal: g, subSteps })} />
      ))}

      <button type="button" className="fab" onClick={() => setShowForm(true)} aria-label="Neues Ziel">
        <PlusIcon size={26} />
      </button>

      {showForm && <GoalForm onClose={() => setShowForm(false)} />}
      {editing && (
        <GoalForm goal={editing.goal} existingSubSteps={editing.subSteps} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
