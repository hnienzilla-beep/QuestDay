export interface SubStep {
  id: string
  goalId: string
  title: string
  /** Nur für einmalige Ziele (recurrence === null) maßgeblich. */
  completed: boolean
  completedAt: string | null
  order: number
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface GoalRecurrence {
  frequency: RecurrenceFrequency
  /** 0 = Sonntag ... 6 = Samstag. Mehrere Wochentage möglich; nur bei frequency === 'weekly' maßgeblich. */
  weekdays: number[]
  /** 1-31, erforderlich wenn frequency === 'monthly' (wird auf Monatslänge geclampt) */
  dayOfMonth: number | null
  /** >=1, erforderlich wenn frequency === 'custom' */
  intervalDays: number | null
  /** yyyy-MM-dd, Erstellungsdatum = Zyklus-0 */
  anchorDate: string
  /** "HH:mm", nur Uhrzeit (kein volles ISO-Datetime, da sich die Erinnerung jeden Zyklus wiederholt) */
  reminderTime: string | null
  lastReminderFiredDate: string | null
  /** ISO-Zeitstempel; null = Wiederholung noch aktiv */
  stoppedAt: string | null
}

export interface Goal {
  id: string
  title: string
  target: string
  /** null = keine Kategorie (Kategorien sind optional). */
  categoryId: string | null
  createdAt: string
  targetDate: string | null
  /** Nur für einmalige Ziele (recurrence === null) gesetzt. */
  completedAt: string | null
  /** null = einmaliges Ziel (Standard), sonst wiederholender Zyklus. */
  recurrence: GoalRecurrence | null
}

export interface GoalCycleCompletion {
  id: string
  goalId: string
  /** Denormalisiert für die Statistik; überlebt das Löschen einer Kategorie. */
  categoryId: string | null
  /** yyyy-MM-dd, Identität des Zyklus */
  cycleDueDate: string
  completedAt: string
}

export interface SubStepCycleCompletion {
  id: string
  subStepId: string
  goalId: string
  cycleDueDate: string
  completedAt: string
}
