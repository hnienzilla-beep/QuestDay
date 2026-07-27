import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getThemeSettings, saveThemeSettings, type ThemeMode } from '../../db/settingsStore'

interface ThemeContextValue {
  mode: ThemeMode
  accent: string
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: string) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  accent: '#4f6df5',
  setMode: () => {},
  setAccent: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

/** Leitet eine transluzente "light"-Variante der Akzentfarbe für Hintergründe ab. */
function applyAccent(accent: string) {
  const root = document.documentElement
  root.style.setProperty('--color-primary', accent)
  root.style.setProperty('--color-primary-light', `color-mix(in srgb, ${accent} 18%, transparent)`)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => getThemeSettings())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme-mode', settings.mode)
    applyAccent(settings.accent)
    saveThemeSettings(settings)
  }, [settings])

  const setMode = (mode: ThemeMode) => setSettings((s) => ({ ...s, mode }))
  const setAccent = (accent: string) => setSettings((s) => ({ ...s, accent }))

  return (
    <ThemeContext.Provider value={{ mode: settings.mode, accent: settings.accent, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}
