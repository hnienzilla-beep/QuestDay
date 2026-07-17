import type { RewardDefinition } from '../../types/gamification'

export const REWARD_DEFINITIONS: RewardDefinition[] = [
  {
    id: 'trophy-first-task',
    kind: 'trophy',
    label: 'Starter-Trophäe',
    description: 'Für deine erste erledigte Aufgabe.',
    requiredBadgeId: 'first-task',
  },
  {
    id: 'trophy-streak-7',
    kind: 'trophy',
    label: 'Durchhalte-Trophäe',
    description: 'Für eine 7-Tage-Streak.',
    requiredBadgeId: 'streak-7',
  },
  {
    id: 'trophy-first-goal',
    kind: 'trophy',
    label: 'Ziel-Trophäe',
    description: 'Für dein erstes abgeschlossenes Ziel.',
    requiredBadgeId: 'first-goal',
  },
  {
    id: 'theme-default',
    kind: 'theme',
    label: 'Standard',
    description: 'Das Standard-Farbdesign.',
    requiredLevel: 1,
  },
  {
    id: 'theme-forest',
    kind: 'theme',
    label: 'Wald',
    description: 'Freigeschaltet ab Level 3.',
    requiredLevel: 3,
  },
  {
    id: 'theme-sunset',
    kind: 'theme',
    label: 'Sonnenuntergang',
    description: 'Freigeschaltet ab Level 5.',
    requiredLevel: 5,
  },
  {
    id: 'theme-ocean',
    kind: 'theme',
    label: 'Ozean',
    description: 'Freigeschaltet ab Level 8.',
    requiredLevel: 8,
  },
]
