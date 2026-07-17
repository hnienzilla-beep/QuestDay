import { db } from './db'
import type { UserStats } from '../types/gamification'

const DEFAULT_STATS: UserStats = {
  id: 'singleton',
  xpTotal: 0,
  level: 1,
  currentStreak: 0,
  longestStreak: 0,
  lastStreakCheckDate: new Date().toISOString().slice(0, 10),
  selectedTheme: 'default',
}

export async function ensureSeedData() {
  const existing = await db.userStats.get('singleton')
  if (!existing) {
    await db.userStats.put(DEFAULT_STATS)
  }
}
