/**
 * IDs für importierte Erledigungen sind deterministisch abgeleitet, nicht zufällig.
 *
 * Der Grund ist Idempotenz: Der Dexie-Import wird bei einem fehlgeschlagenen Push nicht
 * zurückgerollt, und zwei Geräte sehen dieselbe Checkbox unabhängig voneinander. Mit
 * `crypto.randomUUID()` entstünden dabei zwei Zeilen für dieselbe Erledigung und doppelte
 * XP. Mit einer abgeleiteten ID und `put()` ist mehrfaches Anwenden folgenlos.
 *
 * Die IDs sind nur Primärschlüssel und in keinem Index - eine Dexie-Migration braucht es
 * dafür nicht.
 */

export function completionIdFor(taskId: string, completedDate: string): string {
  return `qd:tc:${taskId}:${completedDate}`
}

export function goalCycleIdFor(goalId: string, cycleDueDate: string): string {
  return `qd:gcc:${goalId}:${cycleDueDate}`
}

export function subStepCycleIdFor(subStepId: string, cycleDueDate: string): string {
  return `qd:ssc:${subStepId}:${cycleDueDate}`
}
