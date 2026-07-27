import { db } from '../../db/db'
import { startOfWeek, addDays, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { todayISODate, isoDateOf } from '../../utils/dateUtils'
import { tasksDueOnDate, isTaskDoneOnDate } from '../tasks/taskRepository'
import { goalsDueOnDate, isGoalCycleDoneOnDate } from '../goals/goalRepository'
import { upsertFile } from './githubApi'

function cleanTitle(title: string): string {
  return title.replace(/\r?\n/g, ' ').trim()
}

async function categoryNames(): Promise<Map<string, string>> {
  const cats = await db.categories.toArray()
  return new Map(cats.map((c) => [c.id, c.name]))
}

function catSuffix(categoryId: string | null, names: Map<string, string>): string {
  if (!categoryId) return ''
  const name = names.get(categoryId)
  return name ? ` (${name})` : ''
}

/** Exportiert Heute-Aufgaben, Ziele und den Wochenplan als Markdown ins Vault-Repo. */
export async function syncQuestsHeute(): Promise<void> {
  const dateStr = todayISODate()
  const names = await categoryNames()

  // --- Heute ---
  const dueTasks = await tasksDueOnDate(dateStr)
  const doneFlags = await Promise.all(dueTasks.map((t) => isTaskDoneOnDate(t, dateStr)))
  const erledigt = doneFlags.filter(Boolean).length
  const offen = dueTasks.length - erledigt

  const heuteLines =
    dueTasks.length > 0
      ? dueTasks.map((task, i) => `- [${doneFlags[i] ? 'x' : ' '}] ${cleanTitle(task.title)}${catSuffix(task.categoryId, names)}`).join('\n')
      : '_Heute keine Aufgaben fällig._'

  // --- Ziele ---
  const goals = await db.goals.toArray()
  const zieleLines: string[] = []
  for (const goal of goals) {
    const steps = await db.subSteps.where('goalId').equals(goal.id).toArray()
    const isRecurring = goal.recurrence !== null
    let doneCount: number
    if (isRecurring) {
      const rows = await db.subStepCycleCompletions.where('goalId').equals(goal.id).and((r) => r.cycleDueDate === dateStr).toArray()
      const doneIds = new Set(rows.map((r) => r.subStepId))
      doneCount = steps.filter((s) => doneIds.has(s.id)).length
    } else {
      doneCount = steps.filter((s) => s.completed).length
    }
    const suffix = isRecurring ? ' 🔁' : ''
    zieleLines.push(`- ${cleanTitle(goal.title)} — ${doneCount}/${steps.length}${catSuffix(goal.categoryId, names)}${suffix}`)
  }
  const zieleBlock = zieleLines.length > 0 ? zieleLines.join('\n') : '_Noch keine Ziele._'

  // --- Wochenplan (Mo–So) ---
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const wochenLines: string[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i)
    const dStr = isoDateOf(date)
    const tasks = await tasksDueOnDate(dStr)
    const flags = await Promise.all(tasks.map((t) => isTaskDoneOnDate(t, dStr)))
    const goalsDue = await goalsDueOnDate(dStr)
    const goalFlags = await Promise.all(goalsDue.map((g) => isGoalCycleDoneOnDate(g.id, dStr)))

    wochenLines.push(`### ${format(date, 'EEEE, d. MMMM', { locale: de })}`)
    if (tasks.length === 0 && goalsDue.length === 0) {
      wochenLines.push('_Nichts geplant._')
    } else {
      tasks.forEach((t, idx) => wochenLines.push(`- [${flags[idx] ? 'x' : ' '}] ${cleanTitle(t.title)}${catSuffix(t.categoryId, names)}`))
      goalsDue.forEach((g, idx) => wochenLines.push(`- [${goalFlags[idx] ? 'x' : ' '}] 🎯 ${cleanTitle(g.title)}${catSuffix(g.categoryId, names)}`))
    }
    wochenLines.push('')
  }

  const frontmatter = ['---', 'typ: todo', `datum: ${dateStr}`, `erledigt: ${erledigt}`, `offen: ${offen}`, '---', ''].join('\n')

  const body = [
    '## Heute',
    heuteLines,
    '',
    '## Ziele',
    zieleBlock,
    '',
    '## Wochenplan',
    wochenLines.join('\n').trimEnd(),
    '',
  ].join('\n')

  await upsertFile(`10-Quests/${dateStr}.md`, frontmatter + body, `Sync ${dateStr}: ToDo`)
}
