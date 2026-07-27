export type ThemeMode = 'dark' | 'light'

export interface ThemeSettings {
  mode: ThemeMode
  /** Akzentfarbe als Hex, frei wählbar. */
  accent: string
}

const STORAGE_KEY = 'todo-theme'

export const DEFAULT_ACCENT = '#4f6df5'
const DEFAULT_SETTINGS: ThemeSettings = { mode: 'dark', accent: DEFAULT_ACCENT }

export function getThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>
    return {
      mode: parsed.mode === 'light' ? 'light' : 'dark',
      accent: typeof parsed.accent === 'string' && parsed.accent ? parsed.accent : DEFAULT_ACCENT,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveThemeSettings(settings: ThemeSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
