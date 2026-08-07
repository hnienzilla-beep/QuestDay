import { db } from '../../db/db'
import type { Goal, GoalRecurrence, SubStep } from '../../types/goal'
import { todayISODate } from '../../utils/dateUtils'
import { mostRecentDueDateOnOrBefore } from '../goals/goalCycles'
import { upsertFile } from './githubApi'
import { cleanTitle, frontmatter, section, WEEKDAY_NAMES } from './markdown'

export const GOAL_FILE_PATH = '30-Ziele/Ziele.md'

function recurrenceLabel(recurrence: GoalRecurrence): string {
  switch (recurrence.frequency) {
    case 'daily':
      return 'täglich'
    case 'weekly': {
      const weekday = recurrence.weekday === null ? null : WEEKDAY_NAMES[recurrence.weekday]
      return weekday ? `wöchentlich (${weekday})` : 'wöchentlich'
    }
    case 'monthly':
      return recurrence.dayOfMonth ? `monatlich (am ${recurrence.dayOfMonth}.)` : 'monatlich'
    case 'custom':
      return recurrence.intervalDays ? `alle ${recurrence.intervalDays} Tage` : 'benutzerdefiniert'
  }
}

function checkboxLine(step: SubStep, done: boolean): string {
  return `- [${done ? 'x' : ' '}] ${cleanTitle(step.title)}`
}

function goalBlock(goal: Goal, facts: string[], stepLines: string[]): string[] {
  const lines = [`### ${cleanTitle(goal.title)}`, '', ...facts.map((f) => `- ${f}`)]
  if (stepLines.length > 0) lines.push('', ...stepLines)
  lines.push('')
  return lines
}

function baseFacts(goal: Goal): string[] {
  const facts = [`Kategorie: ${goal.category}`]
  const target = cleanTitle(goal.target)
  if (target) facts.push(`Ziel: ${target}`)
  if (goal.targetDate) facts.push(`Zieldatum: ${goal.targetDate}`)
  return facts
}

function oneOffGoalBlock(goal: Goal, steps: SubStep[]): string[] {
  const done = steps.filter((s) => s.completed).length
  const facts = baseFacts(goal)
  if (steps.length > 0) facts.push(`Fortschritt: ${done}/${steps.length} Teilschritte`)
  if (goal.completedAt) facts.push(`Erledigt am: ${goal.completedAt.slice(0, 10)}`)
  return goalBlock(
    goal,
    facts,
    steps.map((s) => checkboxLine(s, s.completed)),
  )
}

async function recurringGoalBlock(goal: Goal, steps: SubStep[], todayStr: string): Promise<string[]> {
  const recurrence = goal.recurrence!
  const facts = baseFacts(goal)
  facts.push(`Wiederholung: ${recurrenceLabel(recurrence)}`)
  if (recurrence.reminderTime) facts.push(`Erinnerung: ${recurrence.reminderTime} Uhr`)

  const cycleDueDate = mostRecentDueDateOnOrBefore(recurrence, todayStr)
  let stepLines: string[]
  if (cycleDueDate) {
    const [cycleCompletion, completionCount, stepCompletions] = await Promise.all([
      db.goalCycleCompletions.where('[goalId+cycleDueDate]').equals([goal.id, cycleDueDate]).first(),
      db.goalCycleCompletions.where('goalId').equals(goal.id).count(),
      db.subStepCycleCompletions.where('[goalId+cycleDueDate]').equals([goal.id, cycleDueDate]).toArray(),
    ])
    const isComplete = cycleCompletion !== undefined
    const state = isComplete ? 'erledigt' : cycleDueDate < todayStr ? 'verpasst' : 'offen'
    facts.push(`${recurrence.stoppedAt ? 'Letzter' : 'Aktueller'} Zyklus: ${cycleDueDate} – ${state}`)
    facts.push(`Abgeschlossene Zyklen: ${completionCount}`)

    const doneStepIds = new Set(stepCompletions.map((c) => c.subStepId))
    stepLines = steps.map((s) => checkboxLine(s, doneStepIds.has(s.id)))
  } else {
    facts.push(`Aktueller Zyklus: noch nicht gestartet (ab ${recurrence.anchorDate})`)
    stepLines = steps.map((s) => checkboxLine(s, false))
  }

  if (recurrence.stoppedAt) facts.push(`Wiederholung beendet am: ${recurrence.stoppedAt.slice(0, 10)}`)
  return goalBlock(goal, facts, stepLines)
}

/** Exportiert alle Ziele samt Teilschritten und Zyklus-Status als Markdown ins Vault-Repo. */
export async function syncGoals(): Promise<void> {
  const todayStr = todayISODate()
  const [goals, allSteps] = await Promise.all([db.goals.toArray(), db.subSteps.toArray()])

  const stepsByGoal = new Map<string, SubStep[]>()
  for (const step of allSteps) {
    const list = stepsByGoal.get(step.goalId)
    if (list) list.push(step)
    else stepsByGoal.set(step.goalId, [step])
  }
  stepsByGoal.forEach((list) => list.sort((a, b) => a.order - b.order))
  const stepsOf = (goalId: string) => stepsByGoal.get(goalId) ?? []

  const sortByTitle = (a: Goal, b: Goal) => cleanTitle(a.title).localeCompare(cleanTitle(b.title))
  const openGoals = goals.filter((g) => g.recurrence === null && g.completedAt === null).sort(sortByTitle)
  const doneGoals = goals
    .filter((g) => g.recurrence === null && g.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  const activeRecurring = goals.filter((g) => g.recurrence !== null && !g.recurrence.stoppedAt).sort(sortByTitle)
  const stoppedRecurring = goals.filter((g) => g.recurrence !== null && g.recurrence.stoppedAt).sort(sortByTitle)

  const openBlocks = openGoals.map((g) => oneOffGoalBlock(g, stepsOf(g.id)))
  const doneBlocks = doneGoals.map((g) => oneOffGoalBlock(g, stepsOf(g.id)))
  const [activeBlocks, stoppedBlocks] = await Promise.all([
    Promise.all(activeRecurring.map((g) => recurringGoalBlock(g, stepsOf(g.id), todayStr))),
    Promise.all(stoppedRecurring.map((g) => recurringGoalBlock(g, stepsOf(g.id), todayStr))),
  ])

  const head = frontmatter({
    typ: 'ziele',
    aktualisiert: new Date().toISOString(),
    gesamt: goals.length,
    offen: openGoals.length,
    erledigt: doneGoals.length,
    wiederkehrend_aktiv: activeRecurring.length,
  })

  const blocks = [
    '# Ziele',
    '',
    ...section('Offene Ziele', openBlocks.flat()),
    ...section('Wiederkehrende Ziele', activeBlocks.flat()),
    ...section('Beendete Wiederholungen', stoppedBlocks.flat()),
    ...section('Erledigte Ziele', doneBlocks.flat()),
  ]

  const body = blocks.length > 2 ? blocks.join('\n') : '# Ziele\n\n_Keine Ziele vorhanden._\n'

  await upsertFile(GOAL_FILE_PATH, head + body, `Sync ${todayStr}: Ziele`)
}
