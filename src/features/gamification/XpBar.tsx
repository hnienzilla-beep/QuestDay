import { useLiveQuery } from 'dexie-react-hooks'
import './XpBar.css'
import { db } from '../../db/db'
import { levelFromTotalXp } from './level'

export default function XpBar() {
  const stats = useLiveQuery(() => db.userStats.get('singleton'))

  if (!stats) return null

  const { level, xpIntoLevel, xpForNext } = levelFromTotalXp(stats.xpTotal)
  const percent = Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100))

  return (
    <div className="xp-bar">
      <div className="xp-bar-top">
        <span className="xp-bar-level">Level {level}</span>
        <span className="xp-bar-value">
          {xpIntoLevel} / {xpForNext} XP
        </span>
      </div>
      <div className="xp-bar-track">
        <div className="xp-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {stats.currentStreak > 0 && (
        <div className="xp-bar-streak">🔥 {stats.currentStreak} Tage Streak</div>
      )}
    </div>
  )
}
