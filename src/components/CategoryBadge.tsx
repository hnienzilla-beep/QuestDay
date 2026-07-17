import './CategoryBadge.css'
import type { Category } from '../types/task'

export default function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`category-badge ${category}`}>
      <span className="dot" />
      {category}
    </span>
  )
}
