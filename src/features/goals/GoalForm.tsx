import { useState } from 'react'
import './GoalForm.css'
import { CATEGORIES, type Category } from '../../types/task'
import type { Goal, RecurrenceFrequency, SubStep } from '../../types/goal'
import { addGoal, updateGoal, deleteGoal } from './goalRepository'

interface Props {
  onClose: () => void
  goal?: Goal
  existingSubSteps?: SubStep[]
}

interface SubStepRow {
  id: string | null
  title: string
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

export default function GoalForm({ onClose, goal, existingSubSteps }: Props) {
  const isEdit = goal !== undefined

  const [title, setTitle] = useState(goal?.title ?? '')
  const [target, setTarget] = useState(goal?.target ?? '')
  const [category, setCategory] = useState<Category>(goal?.category ?? 'Sonstiges')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')

  const [subStepRows, setSubStepRows] = useState<SubStepRow[]>(
    existingSubSteps && existingSubSteps.length > 0
      ? existingSubSteps.map((s) => ({ id: s.id, title: s.title }))
      : [{ id: null, title: '' }],
  )
  const [removedIds, setRemovedIds] = useState<string[]>([])

  const [recurrenceType, setRecurrenceType] = useState<'none' | RecurrenceFrequency>(
    goal?.recurrence?.frequency ?? 'none',
  )
  const [weekday, setWeekday] = useState(goal?.recurrence?.weekday ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(goal?.recurrence?.dayOfMonth ?? 1)
  const [intervalDays, setIntervalDays] = useState(goal?.recurrence?.intervalDays ?? 2)
  const [reminderTime, setReminderTime] = useState(goal?.recurrence?.reminderTime ?? '')

  const updateSubStep = (index: number, value: string) => {
    setSubStepRows((rows) => rows.map((r, i) => (i === index ? { ...r, title: value } : r)))
  }

  const addSubStepField = () => setSubStepRows((rows) => [...rows, { id: null, title: '' }])

  const removeSubStepField = (index: number) => {
    setSubStepRows((rows) => {
      const row = rows[index]
      if (row.id) setRemovedIds((ids) => [...ids, row.id!])
      return rows.filter((_, i) => i !== index)
    })
  }

  const handleDelete = async () => {
    if (!goal) return
    if (!window.confirm(`"${goal.title}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return
    await deleteGoal(goal.id)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const recurrence =
      recurrenceType === 'none'
        ? null
        : {
            frequency: recurrenceType,
            weekday: recurrenceType === 'weekly' ? weekday : null,
            dayOfMonth: recurrenceType === 'monthly' ? dayOfMonth : null,
            intervalDays: recurrenceType === 'custom' ? intervalDays : null,
            reminderTime: reminderTime || null,
          }

    if (isEdit && goal) {
      const updated = subStepRows.filter((r) => r.id !== null).map((r) => ({ id: r.id!, title: r.title.trim() }))
      const added = subStepRows
        .filter((r) => r.id === null && r.title.trim().length > 0)
        .map((r) => r.title.trim())

      await updateGoal(
        goal.id,
        { title: title.trim(), target: target.trim(), category, targetDate: targetDate || null, recurrence },
        { updated, added, removedIds },
      )
    } else {
      await addGoal({
        title: title.trim(),
        target: target.trim(),
        category,
        targetDate: targetDate || null,
        subStepTitles: subStepRows.map((r) => r.title.trim()).filter((s) => s.length > 0),
        recurrence,
      })
    }

    onClose()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>{isEdit ? 'Ziel bearbeiten' : 'Neues Ziel'}</h2>
          <div className="sheet-header-actions">
            {isEdit && (
              <button
                type="button"
                className="sheet-delete"
                onClick={handleDelete}
                aria-label="Ziel löschen"
                title="Ziel löschen"
              >
                🗑️
              </button>
            )}
            <button type="button" className="sheet-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="recurrence-toggle">
          <button
            type="button"
            className={recurrenceType === 'none' ? 'active' : ''}
            onClick={() => setRecurrenceType('none')}
          >
            Einmalig
          </button>
          <button
            type="button"
            className={recurrenceType === 'daily' ? 'active' : ''}
            onClick={() => setRecurrenceType('daily')}
          >
            Täglich
          </button>
          <button
            type="button"
            className={recurrenceType === 'weekly' ? 'active' : ''}
            onClick={() => setRecurrenceType('weekly')}
          >
            Wöchentlich
          </button>
          <button
            type="button"
            className={recurrenceType === 'monthly' ? 'active' : ''}
            onClick={() => setRecurrenceType('monthly')}
          >
            Monatlich
          </button>
          <button
            type="button"
            className={recurrenceType === 'custom' ? 'active' : ''}
            onClick={() => setRecurrenceType('custom')}
          >
            Eigene Tage
          </button>
        </div>

        {recurrenceType === 'weekly' && (
          <div className="field">
            <label htmlFor="goalWeekday">Wochentag</label>
            <select id="goalWeekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        )}

        {recurrenceType === 'monthly' && (
          <div className="field">
            <label htmlFor="goalDayOfMonth">Tag im Monat</label>
            <input
              id="goalDayOfMonth"
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
            />
          </div>
        )}

        {recurrenceType === 'custom' && (
          <div className="field">
            <label htmlFor="goalIntervalDays">Alle wie viele Tage?</label>
            <input
              id="goalIntervalDays"
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
            />
          </div>
        )}

        {recurrenceType !== 'none' && (
          <div className="field">
            <label htmlFor="goalReminderTime">Erinnerung (optional)</label>
            <input
              id="goalReminderTime"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
            />
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="goalTitle">Titel</label>
            <input
              id="goalTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Wohnung renovieren"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label htmlFor="goalTarget">Ziel (kurz beschrieben)</label>
            <input
              id="goalTarget"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="z.B. Alle Zimmer neu gestrichen"
            />
          </div>

          <div className="field">
            <label>Kategorie</label>
            <div className="category-toggle">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={category === c ? 'active' : ''}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="targetDate">Zieldatum (optional)</label>
            <input
              id="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Teilschritte</label>
            {subStepRows.map((step, index) => (
              <div className="substep-row" key={step.id ?? `new-${index}`}>
                <input
                  value={step.title}
                  onChange={(e) => updateSubStep(index, e.target.value)}
                  placeholder={`Schritt ${index + 1}`}
                />
                {subStepRows.length > 1 && (
                  <button
                    type="button"
                    className="substep-remove"
                    onClick={() => removeSubStepField(index)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="substep-add" onClick={addSubStepField}>
              + Schritt hinzufügen
            </button>
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            {isEdit ? 'Änderungen speichern' : 'Ziel speichern'}
          </button>
        </form>
      </div>
    </div>
  )
}
