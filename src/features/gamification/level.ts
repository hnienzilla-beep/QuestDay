/** XP-Bedarf, um von Level L auf L+1 zu kommen: L * 100 (kumulativ, linear wachsend). */
export function xpRequiredForLevel(level: number): number {
  return level * 100
}

export interface LevelInfo {
  level: number
  xpIntoLevel: number
  xpForNext: number
}

export function levelFromTotalXp(totalXp: number): LevelInfo {
  let level = 1
  let remaining = totalXp
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level)
    level += 1
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpRequiredForLevel(level) }
}
