import { useState, Suspense, lazy } from 'react'
import './SettingsView.css'
import AccentThemePicker from '../features/theme/AccentThemePicker'
import CategoryManager from '../features/categories/CategoryManager'
import ObsidianSyncPanel from '../features/obsidianSync/ObsidianSyncPanel'
import { CloseIcon, ChevronLeftIcon, ChartIcon, ChevronRightIcon } from '../components/icons'

const StatsView = lazy(() => import('./StatsView'))

interface Props {
  onClose: () => void
}

export default function SettingsView({ onClose }: Props) {
  const [statsOpen, setStatsOpen] = useState(false)

  if (statsOpen) {
    return (
      <div className="settings-view">
        <div className="settings-head">
          <button type="button" className="settings-back" onClick={() => setStatsOpen(false)} aria-label="Zurück">
            <ChevronLeftIcon size={22} />
          </button>
          <h2>Statistik</h2>
          <span className="settings-head-spacer" />
        </div>
        <div className="settings-body">
          <Suspense fallback={null}>
            <StatsView />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-view">
      <div className="settings-head">
        <h2>Einstellungen</h2>
        <button type="button" className="settings-close" onClick={onClose} aria-label="Schließen">
          <CloseIcon size={22} />
        </button>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <h3 className="settings-section-title">Darstellung</h3>
          <AccentThemePicker />
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Kategorien</h3>
          <CategoryManager />
        </section>

        <section className="settings-section">
          <button type="button" className="settings-link-row" onClick={() => setStatsOpen(true)}>
            <span className="settings-link-icon">
              <ChartIcon size={20} />
            </span>
            <span className="settings-link-text">Statistik</span>
            <ChevronRightIcon size={18} />
          </button>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Synchronisierung</h3>
          <ObsidianSyncPanel />
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Erinnerungen</h3>
          <p className="settings-hint">
            Aufgaben und Termine können eine Erinnerungszeit haben. Benachrichtigungen kommen an, solange die
            App geöffnet oder kürzlich aktiv war.
          </p>
        </section>
      </div>
    </div>
  )
}
