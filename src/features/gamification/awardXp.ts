import { db } from '../../db/db'
import { levelFromTotalXp } from './level'

export async function awardXp(delta: number): Promise<void> {
  const stats = await db.userStats.get('singleton')
  if (!stats) return
  const xpTotal = Math.max(0, stats.xpTotal + delta)
  const { level } = levelFromTotalXp(xpTotal)
  await db.userStats.put({ ...stats, xpTotal, level })
}
