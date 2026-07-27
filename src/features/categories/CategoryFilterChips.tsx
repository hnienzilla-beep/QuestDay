import './CategoryFilterChips.css'
import { useCategoriesList } from './useCategories'

/** Filterwert: 'all' = alle, 'none' = ohne Kategorie, sonst eine categoryId. */
export type CategoryFilter = 'all' | 'none' | string

interface Props {
  value: CategoryFilter
  onChange: (value: CategoryFilter) => void
}

export default function CategoryFilterChips({ value, onChange }: Props) {
  const categories = useCategoriesList()

  // Nur anzeigen, wenn es überhaupt Kategorien gibt.
  if (!categories || categories.length === 0) return null

  return (
    <div className="category-filter">
      <button type="button" className={value === 'all' ? 'active' : ''} onClick={() => onChange('all')}>
        Alle
      </button>
      {categories.map((c) => (
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
      <button type="button" className={value === 'none' ? 'active' : ''} onClick={() => onChange('none')}>
        Ohne
      </button>
    </div>
  )
}
