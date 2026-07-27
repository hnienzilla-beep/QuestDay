import './CategoryDot.css'
import { useCategoriesMap } from '../features/categories/useCategories'

/** Kleiner Farbpunkt + Kategoriename. Rendert nichts, wenn keine Kategorie gesetzt ist. */
export default function CategoryDot({ categoryId }: { categoryId: string | null }) {
  const map = useCategoriesMap()
  if (!categoryId) return null
  const category = map?.get(categoryId)
  if (!category) return null
  return (
    <span className="category-badge">
      <span className="dot" style={{ background: category.color }} />
      {category.name}
    </span>
  )
}
