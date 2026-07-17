import { useEffect } from 'react'
import { db } from '../../db/db'
import { isGoalDueOnDate } from '../goals/goalCycles'
import { todayISODate, combineDateAndTime } from '../../utils/dateUtils'

function describeTask(task: { type: string }): string {
  switch (task.type) {
    case 'appointment':
      return 'Termin steht an'
    case 'recurring':
      return 'Wiederkehrende Aufgabe fällig'
    default:
      return 'Aufgabe fällig'
  }
}

async function checkDueReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (!('serviceWorker' in navigator)) return

  const now = new Date().toISOString()
  const due = await db.tasks
    .where('reminderTime')
    .belowOrEqual(now)
    .and((t) => t.reminderTime !== null && !t.reminderFired && !t.completed)
    .toArray()

  if (due.length === 0) return

  const registration = await navigator.serviceWorker.ready
  for (const task of due) {
    await registration.showNotification(task.title, {
      body: describeTask(task),
      tag: task.id,
      icon: '/icons/icon-192.png',
    })
    await db.tasks.update(task.id, { reminderFired: true })
  }
}

async function checkDueGoalReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (!('serviceWorker' in navigator)) return

  const todayStr = todayISODate()
  const now = new Date()
  const goals = await db.goals.toArray()
  const due = goals.filter((g) => {
    const r = g.recurrence
    if (!r || r.stoppedAt || !r.reminderTime) return false
    if (r.lastReminderFiredDate === todayStr) return false
    if (!isGoalDueOnDate(r, todayStr)) return false
    return now >= combineDateAndTime(todayStr, r.reminderTime)
  })

  if (due.length === 0) return

  const registration = await navigator.serviceWorker.ready
  for (const goal of due) {
    await registration.showNotification(goal.title, {
      body: 'Wiederkehrendes Ziel heute fällig',
      tag: `goal-${goal.id}-${todayStr}`,
      icon: '/icons/icon-192.png',
    })
    await db.goals.update(goal.id, { recurrence: { ...goal.recurrence!, lastReminderFiredDate: todayStr } })
  }
}

/** Prüft beim Start, alle 60s während die App offen ist, und bei Rückkehr in den Vordergrund. */
export function useReminderScheduler() {
  useEffect(() => {
    checkDueReminders()
    checkDueGoalReminders()

    const intervalId = window.setInterval(() => {
      checkDueReminders()
      checkDueGoalReminders()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        checkDueReminders()
        checkDueGoalReminders()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
