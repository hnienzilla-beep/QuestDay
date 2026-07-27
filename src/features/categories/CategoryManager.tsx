import { useState } from 'react'
import './CategoryManager.css'
import { useCategoriesList } from './useCategories'
import { addCategory, updateCategory, deleteCategory, CATEGORY_COLOR_PALETTE } from './categoryRepository'
import { TrashIcon } from '../../components/icons'

export default function CategoryManager() {
  const categories = useCategoriesList()
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLOR_PALETTE[0])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await addCategory(name, color)
    setName('')
    setColor(CATEGORY_COLOR_PALETTE[(CATEGORY_COLOR_PALETTE.indexOf(color) + 1) % CATEGORY_COLOR_PALETTE.length])
  }

  const handleDelete = async (id: string, catName: string) => {
    if (!window.confirm(`Kategorie "${catName}" löschen? Zugeordnete Aufgaben/Ziele verlieren die Kategorie.`)) return
    await deleteCategory(id)
  }

  return (
    <div className="category-manager">
      <form className="category-add" onSubmit={handleAdd}>
        <label className="category-add-color" style={{ background: color }}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <input
          className="category-add-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Neue Kategorie…"
        />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          Anlegen
        </button>
      </form>

      <div className="category-palette">
        {CATEGORY_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`category-palette-dot${color.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Farbe ${c}`}
          />
        ))}
      </div>

      {categories && categories.length === 0 && (
        <div className="category-manager-empty">Noch keine Kategorien angelegt.</div>
      )}

      <div className="category-list">
        {categories?.map((cat) => (
          <div key={cat.id} className="category-row">
            <label className="category-row-color" style={{ background: cat.color }}>
              <input
                type="color"
                value={cat.color}
                onChange={(e) => updateCategory(cat.id, { name: cat.name, color: e.target.value })}
              />
            </label>
            <input
              className="category-row-name"
              defaultValue={cat.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== cat.name) updateCategory(cat.id, { name: v, color: cat.color })
              }}
            />
            <button
              type="button"
              className="category-row-delete"
              onClick={() => handleDelete(cat.id, cat.name)}
              aria-label="Kategorie löschen"
            >
              <TrashIcon size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
