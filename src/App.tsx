import { useState, Suspense } from 'react'
import BottomNav from './components/BottomNav'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { useReminderScheduler } from './features/notifications/useReminderScheduler'
import OverviewView from './views/OverviewView'
import TodosView from './views/TodosView'
import GoalsView from './views/GoalsView'
import SettingsView from './views/SettingsView'

export type View = 'overview' | 'todos' | 'goals'

function AppShell() {
  const [activeView, setActiveView] = useState<View>('overview')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useReminderScheduler()

  const openSettings = () => setSettingsOpen(true)

  return (
    <>
      <main className="app-main">
        {activeView === 'overview' && (
          <OverviewView onOpenSettings={openSettings} onNavigate={setActiveView} />
        )}
        {activeView === 'todos' && <TodosView onOpenSettings={openSettings} />}
        {activeView === 'goals' && <GoalsView onOpenSettings={openSettings} />}
      </main>
      <BottomNav active={activeView} onChange={setActiveView} />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsView onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
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
