import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { parseISO } from '../../utils/dateUtils'
import type { DaySummary, SummaryGoal, SummaryTask } from './daySummary'

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

function taskLabel(task: SummaryTask): string {
  if (task.time) {
    const location = task.location ? `, ${task.location}` : ''
    return `${task.time} Uhr: ${task.title}${location}`
  }
  if (task.undated) return `${task.title} (ohne Datum)`
  return task.title
}

function goalLabel(goal: SummaryGoal): string {
  return goal.reminderTime ? `${goal.title} (${goal.reminderTime} Uhr)` : goal.title
}

export function formatSummaryDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, d. MMMM yyyy', { locale: de })
}

/**
 * Baut die Zusammenfassung als Textzeilen - identisch für Anzeige, Sprachausgabe
 * und Export, damit Vorgelesenes und Geschriebenes nie auseinanderlaufen.
 */
export function summaryLines(summary: DaySummary): string[] {
  const lines: string[] = []
  const dateLabel = formatSummaryDate(summary.dateStr)
  lines.push(summary.isToday ? `Heute ist ${dateLabel}.` : `Morgen, ${dateLabel}.`)

  if (summary.totalCount === 0) {
    lines.push(
      summary.isToday
        ? 'Für heute ist nichts geplant - der Tag gehört dir.'
        : 'Für morgen ist bisher nichts geplant.',
    )
  } else if (summary.isToday) {
    lines.push(
      `Insgesamt ${summary.totalCount} ${plural(summary.totalCount, 'Punkt', 'Punkte')}: ` +
        `${summary.doneCount} erledigt, ${summary.openCount} offen.`,
    )
  } else {
    lines.push(`Geplant sind ${summary.totalCount} ${plural(summary.totalCount, 'Punkt', 'Punkte')}.`)
  }

  const appointments = summary.tasks.filter((t) => t.time !== null)
  if (appointments.length > 0) {
    lines.push(`Termine: ${appointments.map(taskLabel).join('; ')}.`)
  }

  const openTasks = summary.tasks.filter((t) => !t.done && t.time === null)
  if (openTasks.length > 0) {
    lines.push(`Offene Aufgaben: ${openTasks.map(taskLabel).join('; ')}.`)
  }

  const openGoals = summary.goals.filter((g) => !g.done)
  if (openGoals.length > 0) {
    lines.push(`Ziele: ${openGoals.map(goalLabel).join('; ')}.`)
  }

  if (summary.isToday) {
    const doneTasks = summary.tasks.filter((t) => t.done && t.time === null)
    const doneGoals = summary.goals.filter((g) => g.done)
    const doneLabels = [...doneTasks.map((t) => t.title), ...doneGoals.map((g) => g.title)]
    if (doneLabels.length > 0) {
      lines.push(`Schon erledigt: ${doneLabels.join('; ')}.`)
    }
    lines.push(
      `Heute ${summary.xpOnDate} XP gesammelt. Level ${summary.level}, ` +
        `${summary.currentStreak} ${plural(summary.currentStreak, 'Tag', 'Tage')} Streak.`,
    )
    if (summary.openCount === 0 && summary.totalCount > 0) {
      lines.push('Alles abgehakt - starker Tag!')
    }
  } else if (summary.totalCount > 0) {
    const firstAppointment = appointments[0]
    const firstGoal = summary.goals.find((g) => g.reminderTime !== null)
    if (firstAppointment) {
      lines.push(`Der erste Termin ist um ${firstAppointment.time} Uhr.`)
    } else if (firstGoal) {
      lines.push(`Erste Erinnerung um ${firstGoal.reminderTime} Uhr.`)
    }
  }

  return lines
}

/** Fließtext für Sprachausgabe und Export. */
export function summaryPlainText(summary: DaySummary): string {
  return summaryLines(summary).join(' ')
}

/** Mehrzeiliger Text für Datei-Export bzw. Teilen. */
export function summaryExportText(today: DaySummary, tomorrow: DaySummary): string {
  return [
    `QuestDay - Zusammenfassung ${formatSummaryDate(today.dateStr)}`,
    '',
    'HEUTE',
    ...summaryLines(today).map((l) => `- ${l}`),
    '',
    'MORGEN',
    ...summaryLines(tomorrow).map((l) => `- ${l}`),
    '',
  ].join('\n')
}
