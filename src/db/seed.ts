import { db } from './db'
import type { UserStats } from '../types/gamification'
import { addOneOffTask } from '../features/tasks/taskRepository'

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

const SETUP_TODOS_SEEDED_KEY = 'setup-todos-v1-seeded'

/** Legt einmalig die offenen Setup-Todos aus der Obsidian-Vault-Einrichtung als Aufgaben an. */
const SETUP_TODOS: string[] = [
  'Obsidian auf dem iPhone einrichten (Working Copy + Obsidian App, obsidian-vault klonen)',
  'Dateien nach OneDrive umziehen (Google Drive, iCloud, GMX-Cloud -> 99-Eingang)',
  'OneDrive-Zugriff auf dem iPhone aktivieren',
  '99-Eingang von Cowork aufräumen lassen',
]

export async function ensureSetupTodos() {
  if (localStorage.getItem(SETUP_TODOS_SEEDED_KEY)) return
  for (const title of SETUP_TODOS) {
    await addOneOffTask({
      title,
      category: 'Sonstiges',
      dueDate: null,
      reminderTime: null,
    })
  }
  localStorage.setItem(SETUP_TODOS_SEEDED_KEY, 'true')
}
