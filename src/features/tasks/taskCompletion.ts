import { db } from '../../db/db'
import type { Task } from '../../types/task'
import { todayISODate } from '../../utils/dateUtils'
import { completionIdFor } from '../obsidianSync/import/ids'

/**
 * Erledigungen für einen beliebigen Tag setzen und zurücknehmen.
 *
 * Die App arbeitete bisher ausschließlich auf "heute". Zum Nachtragen vergangener und
 * zum Vorabhaken künftiger Tage führt derselbe Weg, nur mit ausdrücklichem Datum.
 *
 * Bewusst ohne React und ohne Sync-Aufruf: so nutzen UI und Tests dieselbe Logik.
 */

/**
 * Zeitstempel der Erledigung. Für einen fremden Tag wäre "jetzt" irreführend - Mittag
 * dieses Tages ist neutral und fällt auf jedem Gerät gleich aus, was der Abgleich braucht.
 */
function completedAtFor(dateStr: string): string {
  return dateStr === todayISODate() ? new Date().toISOString() : `${dateStr}T12:00:00.000Z`
}

export async function completeTaskOnDate(task: Task, dateStr: string): Promise<void> {
  const completedAt = completedAtFor(dateStr)

  await db.taskCompletions.put({
    // Abgeleitete ID statt Zufalls-UUID: zwei Geräte erzeugen für dieselbe Erledigung
    // denselben Datensatz, und der Abgleich konvergiert sofort.
    id: completionIdFor(task.id, dateStr),
    taskId: task.id,
    taskType: task.type,
    categoryId: task.categoryId,
    completedDate: dateStr,
    completedAt,
  })

  if (task.type !== 'recurring') {
    await db.tasks.update(task.id, { completed: true, completedAt })
  }
}

export async function uncompleteTaskOnDate(task: Task, dateStr: string): Promise<void> {
  const entries = await db.taskCompletions.where('taskId').equals(task.id).toArray()
  // Wiederkehrende Aufgaben werden pro Tag ausgewertet. Einmalige Aufgaben und Termine
  // haben genau eine Erledigung, deren Datum nicht der angetippte Tag sein muss - sonst
  // ließe sich eine an einem anderen Tag abgehakte Aufgabe nie wieder öffnen.
  const betroffen =
    task.type === 'recurring' ? entries.filter((c) => c.completedDate === dateStr) : entries

  for (const entry of betroffen) await db.taskCompletions.delete(entry.id)

  if (task.type !== 'recurring') {
    await db.tasks.update(task.id, { completed: false, completedAt: null })
  }
}
