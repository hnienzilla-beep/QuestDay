import './CategoryPicker.css'
import { useCategoriesList } from './useCategories'

interface Props {
  value: string | null
  onChange: (categoryId: string | null) => void
}

/** Auswahl einer optionalen Kategorie (Chips). "Keine" ist immer möglich. */
export default function CategoryPicker({ value, onChange }: Props) {
  const categories = useCategoriesList()

  return (
    <div className="category-picker">
      <button
        type="button"
        className={value === null ? 'active' : ''}
        onClick={() => onChange(null)}
      >
        Keine
      </button>
      {categories?.map((c) => (
        <button
          key={c.id}
          type="button"
          className={value === c.id ? 'active' : ''}
          onClick={() => onChange(c.id)}
        >
          <span className="cat-dot" style={{ background: c.color }} />
          {c.name}
        </button>
      ))}
      {categories && categories.length === 0 && (
        <span className="category-picker-hint">Kategorien legst du in den Einstellungen an.</span>
      )}
    </div>
  )
}
