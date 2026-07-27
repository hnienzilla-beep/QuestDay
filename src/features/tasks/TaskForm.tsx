import { useState } from 'react'
import { format } from 'date-fns'
import './TaskForm.css'
import type { Task, TaskType } from '../../types/task'
import {
  addOneOffTask,
  addRecurringTask,
  addAppointment,
  updateOneOffTask,
  updateRecurringTask,
  updateAppointment,
  deleteTask,
} from './taskRepository'
import CategoryPicker from '../categories/CategoryPicker'
import WeekdayPicker from '../../components/WeekdayPicker'
import { CloseIcon, TrashIcon } from '../../components/icons'

interface Props {
  onClose: () => void
  defaultDate?: string
  /** Wenn gesetzt: Bearbeiten-Modus. */
  task?: Task
}

const TYPE_LABEL: Record<TaskType, string> = {
  oneoff: 'Einmalig',
  recurring: 'Wiederkehrend',
  appointment: 'Termin',
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
  } catch {
    return ''
  }
}

export default function TaskForm({ onClose, defaultDate, task }: Props) {
  const isEdit = task !== undefined

  const [taskType, setTaskType] = useState<TaskType>(task?.type ?? 'oneoff')
  const [title, setTitle] = useState(task?.title ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(task?.categoryId ?? null)
  const [reminderTime, setReminderTime] = useState(isoToLocalInput(task?.reminderTime ?? null))

  const [dueDate, setDueDate] = useState(
    task?.type === 'oneoff' ? (task.dueDate ?? '') : (defaultDate ?? ''),
  )
  const [time, setTime] = useState(
    task && (task.type === 'oneoff' || task.type === 'recurring') ? (task.time ?? '') : '',
  )
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>(
    task?.type === 'recurring' ? task.frequency : 'daily',
  )
  const [weekdays, setWeekdays] = useState<number[]>(
    task?.type === 'recurring' && task.weekdays.length > 0 ? task.weekdays : [1],
  )
  const [apptDate, setApptDate] = useState(
    task?.type === 'appointment' ? task.date : (defaultDate ?? ''),
  )
  const [startTime, setStartTime] = useState(task?.type === 'appointment' ? task.startTime : '')
  const [endTime, setEndTime] = useState(task?.type === 'appointment' ? (task.endTime ?? '') : '')
  const [location, setLocation] = useState(task?.type === 'appointment' ? (task.location ?? '') : '')

  const handleDelete = async () => {
    if (!task) return
    if (!window.confirm(`"${task.title}" wirklich löschen?`)) return
    await deleteTask(task.id)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const reminder = reminderTime ? new Date(reminderTime).toISOString() : null

    if (taskType === 'oneoff') {
      const patch = { title: title.trim(), categoryId, dueDate: dueDate || null, time: time || null, reminderTime: reminder }
      if (isEdit && task) await updateOneOffTask(task.id, patch)
      else await addOneOffTask(patch)
    } else if (taskType === 'recurring') {
      if (frequency === 'weekly' && weekdays.length === 0) return
      const patch = {
        title: title.trim(),
        categoryId,
        frequency,
        weekdays: frequency === 'weekly' ? weekdays : [],
        time: time || null,
        reminderTime: reminder,
      }
      if (isEdit && task) await updateRecurringTask(task.id, patch)
      else await addRecurringTask(patch)
    } else {
      if (!apptDate || !startTime) return
      const patch = {
        title: title.trim(),
        categoryId,
        date: apptDate,
        startTime,
        endTime: endTime || null,
        location: location || null,
        reminderTime: reminder,
      }
      if (isEdit && task) await updateAppointment(task.id, patch)
      else await addAppointment(patch)
    }

    onClose()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>{isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>
          <div className="sheet-header-actions">
            {isEdit && (
              <button
                type="button"
                className="sheet-delete"
                onClick={handleDelete}
                aria-label="Aufgabe löschen"
                title="Aufgabe löschen"
              >
                <TrashIcon size={18} />
              </button>
            )}
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Schließen">
              <CloseIcon />
            </button>
          </div>
        </div>

        {isEdit ? (
          <div className="type-badge">{TYPE_LABEL[taskType]}</div>
        ) : (
          <div className="type-toggle">
            <button type="button" className={taskType === 'oneoff' ? 'active' : ''} onClick={() => setTaskType('oneoff')}>
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
        )}

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
            <label>Kategorie (optional)</label>
            <CategoryPicker value={categoryId} onChange={setCategoryId} />
          </div>

          {taskType === 'oneoff' && (
            <div className="field-row">
              <div className="field">
                <div className="field-label-row">
                  <label htmlFor="dueDate">Fällig am (optional)</label>
                  {dueDate && (
                    <button type="button" className="field-clear" onClick={() => setDueDate('')}>
                      Leeren
                    </button>
                  )}
                </div>
                <input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="field">
                <div className="field-label-row">
                  <label htmlFor="time">Uhrzeit (optional)</label>
                  {time && (
                    <button type="button" className="field-clear" onClick={() => setTime('')}>
                      Leeren
                    </button>
                  )}
                </div>
                <input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
          )}

          {taskType === 'recurring' && (
            <>
              <div className="field">
                <label>Häufigkeit</label>
                <div className="category-toggle">
                  <button type="button" className={frequency === 'daily' ? 'active' : ''} onClick={() => setFrequency('daily')}>
                    Täglich
                  </button>
                  <button
                    type="button"
                    className={frequency === 'weekly' ? 'active' : ''}
                    onClick={() => setFrequency('weekly')}
                  >
                    An Wochentagen
                  </button>
                </div>
              </div>
              {frequency === 'weekly' && (
                <div className="field">
                  <label>Wochentage</label>
                  <WeekdayPicker value={weekdays} onChange={setWeekdays} />
                </div>
              )}
              <div className="field">
                <div className="field-label-row">
                  <label htmlFor="rtime">Uhrzeit (optional)</label>
                  {time && (
                    <button type="button" className="field-clear" onClick={() => setTime('')}>
                      Leeren
                    </button>
                  )}
                </div>
                <input id="rtime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </>
          )}

          {taskType === 'appointment' && (
            <>
              <div className="field">
                <label htmlFor="apptDate">Datum</label>
                <input id="apptDate" type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} required />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="startTime">Startzeit</label>
                  <input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="endTime">Endzeit (optional)</label>
                  <input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="location">Ort (optional)</label>
                <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z.B. Zuhause" />
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
            {isEdit ? 'Änderungen speichern' : 'Aufgabe speichern'}
          </button>
        </form>
      </div>
    </div>
  )
}
