import { useEffect, useState, Suspense, lazy } from 'react'
import BottomNav from './components/BottomNav'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { ensureSeedData, ensureSetupTodos } from './db/seed'
import { evaluateStreakOnAppOpen } from './features/gamification/streaks'
import { evaluateBadges } from './features/gamification/badges'
import { useReminderScheduler } from './features/notifications/useReminderScheduler'
import HomeView from './views/HomeView'
import WeekView from './views/WeekView'
import ProfileView from './views/ProfileView'

const StatsView = lazy(() => import('./views/StatsView'))

export type View = 'home' | 'week' | 'stats' | 'profile'

function AppShell() {
  const [activeView, setActiveView] = useState<View>('home')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await ensureSeedData()
      await ensureSetupTodos()
      await evaluateStreakOnAppOpen()
      await evaluateBadges()
      setReady(true)
    }
    init()
  }, [])

  useReminderScheduler()

  if (!ready) return null

  return (
    <>
      <main className="app-main">
        {activeView === 'home' && <HomeView />}
        {activeView === 'week' && <WeekView />}
        {activeView === 'stats' && (
          <Suspense fallback={null}>
            <StatsView />
          </Suspense>
        )}
        {activeView === 'profile' && <ProfileView />}
      </main>
      <BottomNav active={activeView} onChange={setActiveView} />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  )
}
