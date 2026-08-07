import { db } from '../../db/db'
import { todayISODate } from '../../utils/dateUtils'
import { tasksDueOnDate, isTaskDoneOnDate } from '../tasks/taskRepository'
import { cleanTitle, frontmatter } from './markdown'

export function questFilePath(dateStr: string): string {
  return `10-Quests/${dateStr}.md`
}

/**
 * Rendert die heutigen Quests (erledigt + offen) als Markdown-Checkliste.
 * Reiner Tagesbericht – diese Datei wird nicht zurückgelesen.
 */
export async function renderQuestFile(): Promise<{ path: string; content: string }> {
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

  const head = frontmatter({
    typ: 'quests',
    datum: dateStr,
    erledigt,
    offen,
    xp_heute: xpHeute,
    xp_gesamt: stats?.xpTotal ?? 0,
    level: stats?.level ?? 1,
    streak: stats?.currentStreak ?? 0,
  })

  const lines = dueTasks.map((task, i) => {
    const box = doneFlags[i] ? '[x]' : '[ ]'
    return `- ${box} ${cleanTitle(task.title)} (${task.category})`
  })
  const body = lines.length > 0 ? lines.join('\n') + '\n' : '_Heute keine Aufgaben fällig._\n'

  return { path: questFilePath(dateStr), content: head + body }
}
