import './BottomNav.css'
import type { View } from '../App'

const ITEMS: { view: View; label: string }[] = [
  { view: 'overview', label: 'Übersicht' },
  { view: 'todos', label: 'ToDos' },
  { view: 'goals', label: 'Ziele' },
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
          {item.label}
        </button>
      ))}
    </nav>
  )
}
