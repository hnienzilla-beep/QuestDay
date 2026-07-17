import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { db } from '../../db/db'
import './themes.css'

interface ThemeContextValue {
  theme: string
  setTheme: (themeId: string) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'default',
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState('default')

  useEffect(() => {
    db.userStats.get('singleton').then((stats) => {
      if (stats) setThemeState(stats.selectedTheme)
    })
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = (themeId: string) => {
    setThemeState(themeId)
    db.userStats.get('singleton').then((stats) => {
      if (stats) db.userStats.put({ ...stats, selectedTheme: themeId })
    })
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
