import { format, parseISO, startOfDay, endOfDay, isBefore, differenceInHours } from 'date-fns'

export function todayISODate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isoDateOf(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  return parseISO(`${dateStr}T${timeStr}:00`)
}

export { parseISO, startOfDay, endOfDay, isBefore, differenceInHours }
