import type { ReactNode } from 'react'
import './AppHeader.css'
import { GearIcon } from './icons'

interface Props {
  children: ReactNode
  onOpenSettings: () => void
}

/** Gemeinsame Kopfzeile mit Zahnrad-Button (öffnet Einstellungen) rechts oben. */
export default function AppHeader({ children, onOpenSettings }: Props) {
  return (
    <div className="app-header">
      <div className="app-header-main">{children}</div>
      <button
        type="button"
        className="app-header-gear"
        onClick={onOpenSettings}
        aria-label="Einstellungen"
      >
        <GearIcon size={22} />
      </button>
    </div>
  )
}
