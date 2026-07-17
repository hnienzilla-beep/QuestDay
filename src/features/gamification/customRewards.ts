import { db } from '../../db/db'
import type { CustomReward } from '../../types/gamification'

export async function addCustomReward(text: string, conditionValue: number): Promise<CustomReward> {
  const reward: CustomReward = {
    id: crypto.randomUUID(),
    text,
    conditionValue,
    claimed: false,
    claimedAt: null,
    createdAt: new Date().toISOString(),
  }
  await db.customRewards.add(reward)
  return reward
}

export async function claimCustomReward(id: string): Promise<void> {
  await db.customRewards.update(id, { claimed: true, claimedAt: new Date().toISOString() })
}
