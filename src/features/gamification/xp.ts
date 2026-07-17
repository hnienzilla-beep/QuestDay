import { endOfDay, differenceInHours, isBefore, parseISO } from 'date-fns'
import type { OneOffTask, RecurringTask, Appointment } from '../../types/task'
import { combineDateAndTime } from '../../utils/dateUtils'

/**
 * Alle XP-Werte sind nie negativ: verspätetes Erledigen wird geringer,
 * aber nicht mit Punktabzug bestraft.
 */

export function xpForOneOff(task: OneOffTask, completedAt: Date): number {
  if (!task.dueDate) return 10
  const dueEnd = endOfDay(parseISO(task.dueDate))
  const hoursEarly = differenceInHours(dueEnd, completedAt)
  if (hoursEarly >= 24) return 15
  if (hoursEarly >= 0) return 10
  return 5
}

export function xpForRecurring(task: RecurringTask, completedAt: Date): number {
  const base = 8
  const reminderBonus =
    task.reminderTime && isBefore(completedAt, parseISO(task.reminderTime)) ? 3 : 0
  return base + reminderBonus
}

export function xpForAppointment(appt: Appointment, completedAt: Date): number {
  const start = combineDateAndTime(appt.date, appt.startTime)
  return isBefore(completedAt, start) ? 15 : 12
}

export function xpForSubStep(isLastStep: boolean): number {
  return isLastStep ? 5 + 20 : 5
}
