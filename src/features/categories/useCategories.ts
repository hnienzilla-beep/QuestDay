import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Category } from '../../types/category'

/** Reaktive, alphabetisch sortierte Kategorienliste. */
export function useCategoriesList(): Category[] | undefined {
  return useLiveQuery(async () => {
    const cats = await db.categories.toArray()
    return cats.sort((a, b) => a.name.localeCompare(b.name))
  }, [])
}

/** Reaktive Zuordnung id -> Kategorie (zum Auflösen von categoryId). */
export function useCategoriesMap(): Map<string, Category> | undefined {
  return useLiveQuery(async () => {
    const cats = await db.categories.toArray()
    return new Map(cats.map((c) => [c.id, c]))
  }, [])
}
