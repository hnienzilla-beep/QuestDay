import { addDays } from 'date-fns'
import { db } from '../../db/db'
import { isoDateOf, todayISODate } from '../../utils/dateUtils'
import { tasksDueOnDate, isTaskDoneOnDate } from '../tasks/taskRepository'
import { buildDaySummary } from '../summary/daySummary'
import { summaryLines } from '../summary/summaryText'
import { upsertFile } from './githubApi'

function cleanTitle(title: string): string {
  return title.replace(/\r?\n/g, ' ').trim()
}

/** Exportiert die heutigen Quests (erledigt + offen) als Markdown-Checkliste ins Vault-Repo. */
export async function syncQuestsHeute(): Promise<void> {
  const dateStr = todayISODate()
  const dueTasks = await tasksDueOnDate(dateStr)
  const doneFlags = await Promise.all(dueTasks.map((t) => isTaskDoneOnDate(t, dateStr)))

  const erledigt = doneFlags.filter(Boolean).length
  const offen = dueTasks.length - erledigt

  const [todaysCompletions, stats] = await Promise.all([
    db.taskCompletions.where('completedDate').equals(dateStr).toArray(),
    db.userStats.get('singleton'),
  ])
  const xpHeute = todaysCompletions.reduce((sum, c) => sum + c.xpAwarded, 0)

  const frontmatter = [
    '---',
    'typ: quests',
    `datum: ${dateStr}`,
    `erledigt: ${erledigt}`,
    `offen: ${offen}`,
    `xp_heute: ${xpHeute}`,
    `xp_gesamt: ${stats?.xpTotal ?? 0}`,
    `level: ${stats?.level ?? 1}`,
    `streak: ${stats?.currentStreak ?? 0}`,
    '---',
    '',
  ].join('\n')

  const lines = dueTasks.map((task, i) => {
    const box = doneFlags[i] ? '[x]' : '[ ]'
    return `- ${box} ${cleanTitle(task.title)} (${task.category})`
  })
  const body = lines.length > 0 ? lines.join('\n') + '\n' : '_Heute keine Aufgaben fällig._\n'

  const [summaryHeute, summaryMorgen] = await Promise.all([
    buildDaySummary(dateStr),
    buildDaySummary(isoDateOf(addDays(new Date(), 1))),
  ])
  const summarySection = [
    '',
    '## Zusammenfassung heute',
    ...summaryLines(summaryHeute).map((l) => `- ${l}`),
    '',
    '## Ausblick morgen',
    ...summaryLines(summaryMorgen).map((l) => `- ${l}`),
    '',
  ].join('\n')

  await upsertFile(`10-Quests/${dateStr}.md`, frontmatter + body + summarySection, `Sync ${dateStr}: Quests`)
}
