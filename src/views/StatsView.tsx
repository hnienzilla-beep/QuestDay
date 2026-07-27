import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { subDays } from 'date-fns'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import './StatsView.css'
import { db } from '../db/db'

type Range = 7 | 30

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAY_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const HOUR_BUCKET_LABELS = ['0–4', '4–8', '8–12', '12–16', '16–20', '20–24']
const NO_CATEGORY_COLOR = '#8a8a8a'

export default function StatsView() {
  const [range, setRange] = useState<Range>(7)

  const data = useLiveQuery(async () => {
    const since = subDays(new Date(), range).toISOString()
    const [allTaskCompletions, allGoalCompletions, categories] = await Promise.all([
      db.taskCompletions.toArray(),
      db.goalCycleCompletions.toArray(),
      db.categories.toArray(),
    ])
    const taskCompletions = allTaskCompletions.filter((c) => c.completedAt >= since)
    const goalCompletions = allGoalCompletions.filter((c) => c.completedAt >= since)
    const completions = [...taskCompletions, ...goalCompletions]

    const byWeekday = new Array(7).fill(0)
    const byHourBucket = new Array(6).fill(0)
    const byCategory = new Map<string | null, number>()

    for (const c of completions) {
      const d = new Date(c.completedAt)
      byWeekday[d.getDay()] += 1
      byHourBucket[Math.floor(d.getHours() / 4)] += 1
      byCategory.set(c.categoryId, (byCategory.get(c.categoryId) ?? 0) + 1)
    }

    const weekdayChart = WEEKDAY_ORDER.map((dayIndex, i) => ({
      day: WEEKDAY_LABELS[i],
      count: byWeekday[dayIndex],
      fullLabel: WEEKDAY_FULL[dayIndex],
    }))
    const hourChart = HOUR_BUCKET_LABELS.map((label, i) => ({ hour: label, count: byHourBucket[i] }))

    const catById = new Map(categories.map((c) => [c.id, c]))
    const categoryChart = [...byCategory.entries()]
      .map(([id, count]) => {
        const cat = id ? catById.get(id) : undefined
        return {
          category: cat ? cat.name : 'Ohne Kategorie',
          color: cat ? cat.color : NO_CATEGORY_COLOR,
          count,
        }
      })
      .sort((a, b) => b.count - a.count)

    let bestWeekday: string | null = null
    let bestWeekdayCount = 0
    for (const w of weekdayChart) {
      if (w.count > bestWeekdayCount) {
        bestWeekdayCount = w.count
        bestWeekday = w.fullLabel
      }
    }

    let bestHour: string | null = null
    let bestHourCount = 0
    hourChart.forEach((h) => {
      if (h.count > bestHourCount) {
        bestHourCount = h.count
        bestHour = h.hour
      }
    })

    return {
      weekdayChart,
      hourChart,
      categoryChart,
      categoryTotal: completions.length,
      bestWeekday,
      bestHour,
      totalCompleted: completions.length,
    }
  }, [range])

  if (!data) return null

  return (
    <div>
      <div className="page-title">Statistik</div>
      <div className="page-subtitle">Deine Produktivität im Überblick</div>

      <div className="stats-range-toggle">
        <button type="button" className={range === 7 ? 'active' : ''} onClick={() => setRange(7)}>
          Diese Woche
        </button>
        <button type="button" className={range === 30 ? 'active' : ''} onClick={() => setRange(30)}>
          Dieser Monat
        </button>
      </div>

      <div className="stat-tiles stat-tiles--single">
        <div className="stat-tile">
          <div className="stat-tile-value">{data.totalCompleted}</div>
          <div className="stat-tile-label">Erledigt</div>
        </div>
      </div>

      <div className="chart-card">
        <h3>Aktivität nach Wochentag</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.weekdayChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="day"
              tick={{ fill: 'var(--chart-ink-secondary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--chart-ink-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-alt)' }}
              contentStyle={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`${value} erledigt`, '']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
            />
            <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
        {data.bestWeekday && data.totalCompleted > 0 && (
          <div className="chart-callout">Produktivster Tag: {data.bestWeekday}</div>
        )}
      </div>

      <div className="chart-card">
        <h3>Aktivität nach Uhrzeit</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.hourChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="hour"
              tick={{ fill: 'var(--chart-ink-secondary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--chart-ink-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-alt)' }}
              contentStyle={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`${value} erledigt`, '']}
            />
            <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
        {data.bestHour && data.totalCompleted > 0 && (
          <div className="chart-callout">Produktivste Uhrzeit: {data.bestHour} Uhr</div>
        )}
      </div>

      <div className="chart-card">
        <h3>Nach Kategorie</h3>
        {data.categoryTotal === 0 ? (
          <div className="chart-callout">Noch keine Daten in diesem Zeitraum.</div>
        ) : (
          <ResponsiveContainer width="100%" height={data.categoryChart.length * 34 + 8}>
            <BarChart data={data.categoryChart} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fill: 'var(--chart-ink-secondary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-surface-alt)' }}
                contentStyle={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [`${value} erledigt`, '']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {data.categoryChart.map((entry) => (
                  <Cell key={entry.category} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
