import './BottomNav.css'
import type { View } from '../App'

const ITEMS: { view: View; label: string; icon: string }[] = [
  { view: 'home', label: 'Heute', icon: '🏠' },
  { view: 'week', label: 'Woche', icon: '📅' },
  { view: 'stats', label: 'Statistik', icon: '📊' },
  { view: 'profile', label: 'Profil', icon: '👤' },
]

interface Props {
  active: View
  onChange: (view: View) => void
}

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <button
          key={item.view}
          type="button"
          className={`bottom-nav-item${active === item.view ? ' active' : ''}`}
          onClick={() => onChange(item.view)}
        >
          <span className="icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
