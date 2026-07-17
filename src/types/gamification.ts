export interface UserStats {
  id: 'singleton'
  xpTotal: number
  level: number
  currentStreak: number
  longestStreak: number
  lastStreakCheckDate: string
  selectedTheme: string
}

export interface AggregatedStats {
  tasksCompleted: number
  appointmentsAttended: number
  goalsCompleted: number
  currentStreak: number
  longestStreak: number
  level: number
  xpTotal: number
}

export interface BadgeDefinition {
  id: string
  label: string
  description: string
  icon: string
  condition: (stats: AggregatedStats) => boolean
}

export interface UnlockedBadge {
  badgeId: string
  unlockedAt: string
}

export type RewardKind = 'trophy' | 'theme'

export interface RewardDefinition {
  id: string
  kind: RewardKind
  label: string
  description: string
  requiredLevel?: number
  requiredBadgeId?: string
}

export interface CustomReward {
  id: string
  text: string
  conditionValue: number
  claimed: boolean
  claimedAt: string | null
  createdAt: string
}
