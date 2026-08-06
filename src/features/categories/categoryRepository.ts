import { db } from '../../db/db'
import type { Category } from '../../types/category'
import { triggerAutoSync } from '../obsidianSync/syncScheduler'

/** Standard-Farbpalette für neue Kategorien. */
export const CATEGORY_COLOR_PALETTE = [
  '#2a78d6',
  '#008300',
  '#e87ba4',
  '#eda100',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#f97316',
]

export async function listCategories(): Promise<Category[]> {
  const cats = await db.categories.toArray()
  return cats.sort((a, b) => a.name.localeCompare(b.name))
}

export async function addCategory(name: string, color: string): Promise<Category> {
  const category: Category = {
    id: crypto.randomUUID(),
    name: name.trim(),
    color,
    createdAt: new Date().toISOString(),
  }
  await db.categories.add(category)
  triggerAutoSync()
  return category
}

export async function updateCategory(id: string, patch: { name: string; color: string }): Promise<void> {
  await db.categories.update(id, { name: patch.name.trim(), color: patch.color })
  triggerAutoSync()
}

/** Löscht eine Kategorie und setzt sie auf allen Aufgaben/Zielen auf null. */
export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id)
  await db.tasks.where('categoryId').equals(id).modify({ categoryId: null })
  await db.goals.where('categoryId').equals(id).modify({ categoryId: null })
  triggerAutoSync()
}
