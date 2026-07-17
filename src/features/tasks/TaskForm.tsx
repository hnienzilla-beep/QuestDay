import { useState } from 'react'
import './TaskForm.css'
import { CATEGORIES, type Category, type TaskType } from '../../types/task'
import { addOneOffTask, addRecurringTask, addAppointment } from './taskRepository'

interface Props {
  onClose: () => void
  defaultDate?: string
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

export default function TaskForm({ onClose, defaultDate }: Props) {
  const [taskType, setTaskType] = useState<TaskType>('oneoff')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('Sonstiges')
  const [reminderTime, setReminderTime] = useState('')

  const [dueDate, setDueDate] = useState(defaultDate ?? '')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [weekday, setWeekday] = useState(1)
  const [apptDate, setApptDate] = useState(defaultDate ?? '')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const reminder = reminderTime ? new Date(reminderTime).toISOString() : null

    if (taskType === 'oneoff') {
      await addOneOffTask({
        title: title.trim(),
        category,
        dueDate: dueDate || null,
        reminderTime: reminder,
      })
    } else if (taskType === 'recurring') {
      await addRecurringTask({
        title: title.trim(),
        category,
        frequency,
        weekday: frequency === 'weekly' ? weekday : null,
        reminderTime: reminder,
      })
    } else {
      if (!apptDate || !startTime) return
      await addAppointment({
        title: title.trim(),
        category,
        date: apptDate,
        startTime,
        endTime: endTime || null,
        location: location || null,
        reminderTime: reminder,
      })
    }

    onClose()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>Neue Aufgabe</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="type-toggle">
          <button
            type="button"
            className={taskType === 'oneoff' ? 'active' : ''}
            onClick={() => setTaskType('oneoff')}
          >
            Einmalig
          </button>
          <button
            type="button"
            className={taskType === 'recurring' ? 'active' : ''}
            onClick={() => setTaskType('recurring')}
          >
            Wiederkehrend
          </button>
          <button
            type="button"
            className={taskType === 'appointment' ? 'active' : ''}
            onClick={() => setTaskType('appointment')}
          >
            Termin
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="title">Titel</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Wäsche waschen"
              autoFocus
              required
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

          {taskType === 'oneoff' && (
            <div className="field">
              <label htmlFor="dueDate">Fällig am (optional)</label>
              <input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}

          {taskType === 'recurring' && (
            <>
              <div className="field">
                <label>Häufigkeit</label>
                <div className="category-toggle">
                  <button
                    type="button"
                    className={frequency === 'daily' ? 'active' : ''}
                    onClick={() => setFrequency('daily')}
                  >
                    Täglich
                  </button>
                  <button
                    type="button"
                    className={frequency === 'weekly' ? 'active' : ''}
                    onClick={() => setFrequency('weekly')}
                  >
                    Wöchentlich
                  </button>
                </div>
              </div>
              {frequency === 'weekly' && (
                <div className="field">
                  <label htmlFor="weekday">Wochentag</label>
                  <select
                    id="weekday"
                    value={weekday}
                    onChange={(e) => setWeekday(Number(e.target.value))}
                  >
                    {WEEKDAYS.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {taskType === 'appointment' && (
            <>
              <div className="field">
                <label htmlFor="apptDate">Datum</label>
                <input
                  id="apptDate"
                  type="date"
                  value={apptDate}
                  onChange={(e) => setApptDate(e.target.value)}
                  required
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="startTime">Startzeit</label>
                  <input
                    id="startTime"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="endTime">Endzeit (optional)</label>
                  <input
                    id="endTime"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="location">Ort (optional)</label>
                <input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="z.B. Zuhause"
                />
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="reminderTime">Erinnerung (optional)</label>
            <input
              id="reminderTime"
              type="datetime-local"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            Aufgabe speichern
          </button>
        </form>
      </div>
    </div>
  )
}
