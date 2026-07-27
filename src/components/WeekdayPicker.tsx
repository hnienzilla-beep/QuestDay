import './WeekdayPicker.css'

interface Props {
  /** 0 = Sonntag ... 6 = Samstag */
  value: number[]
  onChange: (weekdays: number[]) => void
}

// Angezeigt in Mo–So-Reihenfolge, Werte bleiben 0=So..6=Sa.
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const LABELS: Record<number, string> = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 0: 'So' }

/** Mehrfachauswahl von Wochentagen. */
export default function WeekdayPicker({ value, onChange }: Props) {
  const toggle = (day: number) => {
    if (value.includes(day)) onChange(value.filter((d) => d !== day))
    else onChange([...value, day].sort((a, b) => a - b))
  }

  return (
    <div className="weekday-picker">
      {ORDER.map((day) => (
        <button
          key={day}
          type="button"
          className={value.includes(day) ? 'active' : ''}
          onClick={() => toggle(day)}
        >
          {LABELS[day]}
        </button>
      ))}
    </div>
  )
}
