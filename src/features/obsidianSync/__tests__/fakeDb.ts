/**
 * Minimaler In-Memory-Ersatz für die Dexie-Datenbank – nur die Abfrageformen,
 * die der Vault-Sync tatsächlich benutzt.
 */
type Row = Record<string, any>

class FakeCollection {
  private rows: Row[]
  private owner: FakeTable

  constructor(rows: Row[], owner: FakeTable) {
    this.rows = rows
    this.owner = owner
  }

  and(predicate: (row: Row) => boolean) {
    return new FakeCollection(this.rows.filter(predicate), this.owner)
  }
  async toArray() {
    return this.rows.map((r) => ({ ...r }))
  }
  async first() {
    const row = this.rows[0]
    return row ? { ...row } : undefined
  }
  async count() {
    return this.rows.length
  }
  async delete() {
    for (const row of this.rows) await this.owner.delete(row[this.owner.pk])
    return this.rows.length
  }
}

class FakeTable {
  rows: Row[] = []
  pk: string

  constructor(pk: string, seed: Row[] = []) {
    this.pk = pk
    this.rows = seed.map((r) => ({ ...r }))
  }
  async toArray() {
    return this.rows.map((r) => ({ ...r }))
  }
  async get(key: string) {
    const row = this.rows.find((r) => r[this.pk] === key)
    return row ? { ...row } : undefined
  }
  async add(obj: Row) {
    this.rows.push({ ...obj })
    return obj[this.pk]
  }
  async bulkAdd(objs: Row[]) {
    for (const obj of objs) await this.add(obj)
  }
  async put(obj: Row) {
    const index = this.rows.findIndex((r) => r[this.pk] === obj[this.pk])
    if (index === -1) this.rows.push({ ...obj })
    else this.rows[index] = { ...obj }
  }
  async update(key: string, patch: Row) {
    const index = this.rows.findIndex((r) => r[this.pk] === key)
    if (index === -1) return 0
    this.rows[index] = { ...this.rows[index], ...patch }
    return 1
  }
  async delete(key: string) {
    this.rows = this.rows.filter((r) => r[this.pk] !== key)
  }
  where(index: string) {
    const keys = index.replace(/[[\]]/g, '').split('+')
    return {
      equals: (value: unknown) => {
        const values = Array.isArray(value) ? value : [value]
        return new FakeCollection(
          this.rows.filter((r) => keys.every((k, i) => r[k] === values[i])),
          this,
        )
      },
      anyOf: (list: unknown[]) =>
        new FakeCollection(
          this.rows.filter((r) => list.includes(r[keys[0]])),
          this,
        ),
    }
  }
}

export const tables = {
  tasks: new FakeTable('id'),
  taskCompletions: new FakeTable('id'),
  goals: new FakeTable('id'),
  subSteps: new FakeTable('id'),
  goalCycleCompletions: new FakeTable('id'),
  subStepCycleCompletions: new FakeTable('id'),
  userStats: new FakeTable('id'),
  unlockedBadges: new FakeTable('badgeId'),
  customRewards: new FakeTable('id'),
  syncBaselines: new FakeTable('path'),
}

export const db = tables as any

export const START_XP = 1000

/** IDs sind bewusst gut lesbar, damit Testfehler zeigen, welcher Datensatz betroffen ist. */
export const ID = {
  steuer: 'aaaaaaaa-0000-0000-0000-000000000001',
  buch: 'aaaaaaaa-0000-0000-0000-000000000002',
  zahnarzt: 'aaaaaaaa-0000-0000-0000-000000000003',
  sport: 'aaaaaaaa-0000-0000-0000-000000000004',
  marathon: 'bbbbbbbb-0000-0000-0000-000000000001',
  review: 'bbbbbbbb-0000-0000-0000-000000000002',
  step10km: 'cccccccc-0000-0000-0000-000000000001',
  step21km: 'cccccccc-0000-0000-0000-000000000002',
  stepNotizen: 'cccccccc-0000-0000-0000-000000000003',
}

export const OLD = '2026-08-01T10:00:00.000Z'

export async function seed(): Promise<void> {
  const base = { createdAt: OLD, updatedAt: OLD, reminderTime: null, reminderFired: false, completed: false, completedAt: null }
  tables.tasks.rows = [
    { ...base, id: ID.steuer, type: 'oneoff', title: 'Steuer abgeben', category: 'Arbeit', dueDate: '2026-08-01' },
    { ...base, id: ID.buch, type: 'oneoff', title: 'Buch lesen', category: 'Hobby', dueDate: null },
    {
      ...base,
      id: ID.zahnarzt,
      type: 'appointment',
      title: 'Zahnarzt',
      category: 'Sonstiges',
      date: '2026-08-09',
      startTime: '09:00',
      endTime: '10:00',
      location: 'Praxis Mitte',
    },
    { ...base, id: ID.sport, type: 'recurring', title: 'Sport', category: 'Hobby', frequency: 'weekly', weekday: 1 },
  ]
  tables.taskCompletions.rows = []
  tables.goals.rows = [
    {
      id: ID.marathon,
      title: 'Marathon laufen',
      target: '42 km',
      category: 'Hobby',
      createdAt: OLD,
      updatedAt: OLD,
      targetDate: '2026-12-01',
      completedAt: null,
      recurrence: null,
    },
    {
      id: ID.review,
      title: 'Wochenreview',
      target: 'Woche reflektieren',
      category: 'Arbeit',
      createdAt: OLD,
      updatedAt: OLD,
      targetDate: null,
      completedAt: null,
      recurrence: {
        frequency: 'daily',
        weekday: null,
        dayOfMonth: null,
        intervalDays: null,
        anchorDate: '2026-06-05',
        reminderTime: null,
        lastReminderFiredDate: null,
        stoppedAt: null,
      },
    },
  ]
  tables.subSteps.rows = [
    { id: ID.step10km, goalId: ID.marathon, title: '10 km schaffen', completed: false, completedAt: null, order: 0, updatedAt: OLD },
    { id: ID.step21km, goalId: ID.marathon, title: '21 km schaffen', completed: false, completedAt: null, order: 1, updatedAt: OLD },
    { id: ID.stepNotizen, goalId: ID.review, title: 'Notizen durchgehen', completed: false, completedAt: null, order: 0, updatedAt: OLD },
  ]
  tables.goalCycleCompletions.rows = []
  tables.subStepCycleCompletions.rows = []
  tables.unlockedBadges.rows = []
  await db.userStats.put({
    id: 'singleton',
    xpTotal: START_XP,
    level: 4,
    currentStreak: 2,
    longestStreak: 5,
    lastStreakCheckDate: '2026-08-07',
    selectedTheme: 'default',
  })
}

export async function xpTotal(): Promise<number> {
  return (await db.userStats.get('singleton')).xpTotal
}
