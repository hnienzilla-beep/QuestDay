import { useState } from 'react'
import './CheckOffAnimation.css'

interface Props {
  checked: boolean
  onToggle: () => void
}

/** Kreis-Checkbox mit kurzer "Pop"-Animation beim Abhaken. */
export default function CheckOffAnimation({ checked, onToggle }: Props) {
  const [popping, setPopping] = useState(false)

  const handleClick = () => {
    if (!checked) {
      setPopping(true)
      window.setTimeout(() => setPopping(false), 350)
    }
    onToggle()
  }

  return (
    <button
      type="button"
      aria-pressed={checked}
      className={`check-circle${checked ? ' checked' : ''}${popping ? ' pop' : ''}`}
      onClick={handleClick}
    >
      {checked ? '✓' : ''}
    </button>
  )
}
