import { db } from '../../db/db'
import type { SyncBaseline } from './baselineTypes'

export type { SyncBaseline }

export async function getBaseline(path: string): Promise<SyncBaseline | undefined> {
  return db.syncBaselines.get(path)
}

export async function saveBaseline(path: string, content: string): Promise<void> {
  await db.syncBaselines.put({ path, content, syncedAt: new Date().toISOString() })
}
