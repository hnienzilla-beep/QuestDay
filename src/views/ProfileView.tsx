import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import './ProfileView.css'
import { db } from '../db/db'
import { levelFromTotalXp } from '../features/gamification/level'
import { BADGE_DEFINITIONS } from '../features/gamification/badges'
import { REWARD_DEFINITIONS } from '../features/gamification/rewards'
import { addCustomReward, claimCustomReward } from '../features/gamification/customRewards'
import { THEMES } from '../features/theme/themes'
import { useTheme } from '../features/theme/ThemeProvider'
import XpBar from '../features/gamification/XpBar'

export default function ProfileView() {
  const [showRewardForm, setShowRewardForm] = useState(false)
  const [rewardText, setRewardText] = useState('')
  const [rewardLevel, setRewardLevel] = useState(5)

  const stats = useLiveQuery(() => db.userStats.get('singleton'))
  const unlockedBadges = useLiveQuery(() => db.unlockedBadges.toArray())
  const customRewards = useLiveQuery(() =>
    db.customRewards.toArray().then((list) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  )
  const { theme, setTheme } = useTheme()

  if (!stats || !unlockedBadges || !customRewards) return null

  const { level } = levelFromTotalXp(stats.xpTotal)
  const unlockedBadgeIds = new Set(unlockedBadges.map((b) => b.badgeId))
  const trophies = REWARD_DEFINITIONS.filter((r) => r.kind === 'trophy')

  const handleAddReward = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rewardText.trim()) return
    await addCustomReward(rewardText.trim(), rewardLevel)
    setRewardText('')
    setRewardLevel(5)
    setShowRewardForm(false)
  }

  return (
    <div>
      <div className="page-title">Profil</div>
      <div className="page-subtitle">Dein Fortschritt, Badges und Belohnungen</div>

      <XpBar />

      <div className="profile-streaks">
        <div className="stat-tile" style={{ flex: 1 }}>
          <div className="stat-tile-value">{stats.currentStreak}</div>
          <div className="stat-tile-label">Aktuelle Streak</div>
        </div>
        <div className="stat-tile" style={{ flex: 1 }}>
          <div className="stat-tile-value">{stats.longestStreak}</div>
          <div className="stat-tile-label">Beste Streak</div>
        </div>
      </div>

      <div className="section-title">Badges</div>
      <div className="badge-grid">
        {BADGE_DEFINITIONS.map((badge) => {
          const unlocked = unlockedBadgeIds.has(badge.id)
          return (
            <div key={badge.id} className={`badge-tile${unlocked ? '' : ' locked'}`} title={badge.description}>
              <div className="badge-tile-icon">{badge.icon}</div>
              <div className="badge-tile-label">{badge.label}</div>
            </div>
          )
        })}
      </div>

      <div className="section-title">Trophäen</div>
      <div className="reward-list">
        {trophies.map((trophy) => {
          const unlocked = trophy.requiredBadgeId ? unlockedBadgeIds.has(trophy.requiredBadgeId) : false
          return (
            <div key={trophy.id} className={`reward-row${unlocked ? '' : ' locked'}`}>
              <div>
                <div className="reward-row-title">🏆 {trophy.label}</div>
                <div className="reward-row-sub">{trophy.description}</div>
              </div>
              {!unlocked && <span className="reward-row-sub">gesperrt</span>}
            </div>
          )
        })}
      </div>

      <div className="section-title">Farbdesign</div>
      <div className="theme-swatches">
        {THEMES.map((t) => {
          const unlocked = level >= t.requiredLevel
          return (
            <button
              key={t.id}
              type="button"
              className={`theme-swatch${theme === t.id ? ' selected' : ''}${unlocked ? '' : ' locked'}`}
              disabled={!unlocked}
              onClick={() => setTheme(t.id)}
            >
              <span className={`theme-swatch-dot theme-preview-${t.id}`} />
              <span className="theme-swatch-label">
                {unlocked ? t.label : `Ab Lvl ${t.requiredLevel}`}
              </span>
            </button>
          )
        })}
      </div>

      <div className="section-header">
        <h2 className="section-title">Eigene Belohnungen</h2>
        <button type="button" className="link-btn" onClick={() => setShowRewardForm((v) => !v)}>
          {showRewardForm ? 'Abbrechen' : '+ Neu'}
        </button>
      </div>

      {showRewardForm && (
        <form className="custom-reward-form" onSubmit={handleAddReward}>
          <input
            type="text"
            placeholder="z.B. Pizza bestellen"
            value={rewardText}
            onChange={(e) => setRewardText(e.target.value)}
            required
          />
          <input
            type="number"
            min={1}
            max={100}
            value={rewardLevel}
            onChange={(e) => setRewardLevel(Number(e.target.value))}
          />
          <button type="submit" className="btn btn-primary">
            OK
          </button>
        </form>
      )}

      <div className="reward-list">
        {customRewards.length === 0 && !showRewardForm && (
          <div className="empty-state">
            Noch keine eigenen Belohnungen. Leg fest: "Level 5 = Pizza bestellen".
          </div>
        )}
        {customRewards.map((reward) => {
          const unlocked = level >= reward.conditionValue
          return (
            <div key={reward.id} className={`reward-row${unlocked ? '' : ' locked'}`}>
              <div>
                <div className="reward-row-title">
                  {reward.claimed ? '✅ ' : '🎁 '}
                  {reward.text}
                </div>
                <div className="reward-row-sub">Ab Level {reward.conditionValue}</div>
              </div>
              {unlocked && !reward.claimed && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => claimCustomReward(reward.id)}
                >
                  Einlösen
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="info-card">
        ℹ️ Erinnerungen funktionieren rein lokal auf deinem Gerät – ohne eigenen Server. Solange QuestDay
        offen oder kürzlich im Hintergrund war, erhältst du Benachrichtigungen zuverlässig. Ist die App
        komplett geschlossen, holt sie fällige Erinnerungen beim nächsten Öffnen sofort nach.
      </div>
    </div>
  )
}
