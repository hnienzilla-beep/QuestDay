import { db } from '../../db/db'
import type { BadgeDefinition, UnlockedBadge } from '../../types/gamification'
import { computeAggregatedStats } from './stats'

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first-task',
    label: 'Erste Aufgabe',
    description: 'Du hast deine erste Aufgabe erledigt.',
    icon: '✅',
    condition: (s) => s.tasksCompleted >= 1,
  },
  {
    id: 'ten-tasks',
    label: '10 Aufgaben erledigt',
    description: 'Du hast 10 Aufgaben abgeschlossen.',
    icon: '📋',
    condition: (s) => s.tasksCompleted >= 10,
  },
  {
    id: 'fifty-tasks',
    label: '50 Aufgaben erledigt',
    description: 'Du hast 50 Aufgaben abgeschlossen.',
    icon: '🗂️',
    condition: (s) => s.tasksCompleted >= 50,
  },
  {
    id: 'streak-3',
    label: '3-Tage-Streak',
    description: 'Drei Tage in Folge alles erledigt.',
    icon: '🔥',
    condition: (s) => s.currentStreak >= 3 || s.longestStreak >= 3,
  },
  {
    id: 'streak-7',
    label: '7-Tage-Streak',
    description: 'Sieben Tage in Folge alles erledigt.',
    icon: '🔥',
    condition: (s) => s.currentStreak >= 7 || s.longestStreak >= 7,
  },
  {
    id: 'first-goal',
    label: 'Erstes Ziel erreicht',
    description: 'Du hast dein erstes Langzeit-Ziel abgeschlossen.',
    icon: '🎯',
    condition: (s) => s.goalsCompleted >= 1,
  },
  {
    id: 'level-5',
    label: 'Level 5 erreicht',
    description: 'Du hast Level 5 erreicht.',
    icon: '⭐',
    condition: (s) => s.level >= 5,
  },
  {
    id: 'level-10',
    label: 'Level 10 erreicht',
    description: 'Du hast Level 10 erreicht.',
    icon: '🌟',
    condition: (s) => s.level >= 10,
  },
]

export async function evaluateBadges(): Promise<UnlockedBadge[]> {
  const stats = await computeAggregatedStats()
  const already = new Set((await db.unlockedBadges.toArray()).map((b) => b.badgeId))
  const newlyUnlocked: UnlockedBadge[] = []

  for (const def of BADGE_DEFINITIONS) {
    if (!already.has(def.id) && def.condition(stats)) {
      const record: UnlockedBadge = { badgeId: def.id, unlockedAt: new Date().toISOString() }
      await db.unlockedBadges.add(record)
      newlyUnlocked.push(record)
    }
  }
  return newlyUnlocked
}
