import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Goal, SubStep } from '../types/goal'
import AppHeader from '../components/AppHeader'
import GoalCard from '../features/goals/GoalCard'
import GoalForm from '../features/goals/GoalForm'
import { PlusIcon, ChevronRightIcon } from '../components/icons'
import { isGoalArchived } from '../features/goals/goalRepository'
import './GoalsView.css'

interface Props {
  onOpenSettings: () => void
}

export default function GoalsView({ onOpenSettings }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<{ goal: Goal; subSteps: SubStep[] } | null>(null)
  const [archivOffen, setArchivOffen] = useState(false)

  const goals = useLiveQuery(
    () => db.goals.toArray().then((list) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
  )

  const aktive = goals?.filter((g) => !isGoalArchived(g)) ?? []
  // Zuletzt Abgeschlossenes zuerst - danach sucht man im Archiv am ehesten.
  const archiviert = (goals?.filter(isGoalArchived) ?? []).sort((a, b) =>
    (b.completedAt ?? b.recurrence?.stoppedAt ?? '').localeCompare(a.completedAt ?? a.recurrence?.stoppedAt ?? ''),
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

      {aktive.map((goal) => (
        <GoalCard key={goal.id} goal={goal} onEdit={(g, subSteps) => setEditing({ goal: g, subSteps })} />
      ))}

      {goals && goals.length > 0 && aktive.length === 0 && (
        <div className="empty-state">Alle Ziele erledigt. Sie liegen im Archiv.</div>
      )}

      {archiviert.length > 0 && (
        <>
          <button
            type="button"
            className={`archive-toggle${archivOffen ? ' open' : ''}`}
            onClick={() => setArchivOffen((o) => !o)}
            aria-expanded={archivOffen}
          >
            <ChevronRightIcon size={16} />
            <span>Archiv</span>
            <span className="archive-count">{archiviert.length}</span>
          </button>

          {archivOffen &&
            archiviert.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                compact
                onEdit={(g, subSteps) => setEditing({ goal: g, subSteps })}
              />
            ))}
        </>
      )}

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
