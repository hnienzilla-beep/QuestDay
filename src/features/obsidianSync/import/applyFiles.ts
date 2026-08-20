import { db } from '../../../db/db'
import { todayISODate } from '../../../utils/dateUtils'
import type { OneOffTask, RecurringTask, Task } from '../../../types/task'
import type { Goal, GoalRecurrence, SubStep } from '../../../types/goal'
import type { Category } from '../../../types/category'
import { cleanText } from '../canonical'
import type { ItemLine } from '../lineFormat'
import type {
  ParsedCategoriesFile,
  ParsedDayFile,
  ParsedGoalFile,
  ParsedTaskRow,
  ParsedTasksFile,
  ParsedUnplannedFile,
} from '../parse/parseFiles'
import { completionIdFor, derivedIdFor, goalCycleIdFor, occurrenceCounter, subStepCycleIdFor } from './ids'

/**
 * Anwenden dessen, was aus dem Repo kommt.
 *
 * Die Löschregeln in einem Satz: gelöscht wird über das Repo nur *innerhalb* einer Tagesdatei
 * oder einer Ziel-Datei, und auch dort nur, was ausschließlich dorthin gehört. Eine fehlende
 * Zeile löscht sonst nichts - wiederkehrende Aufgaben, Ziele und Kategorien hängen an
 * Erledigungen, Zyklen und Verweisen und werden nur in der App gelöscht.
 *
 * Jede Funktion hier ist idempotent: zweimal derselbe Dateiinhalt = keine Änderung beim
 * zweiten Mal. Darauf baut der Sync-Engine-Pfad, der einen fehlgeschlagenen Push einfach
 * komplett wiederholt.
 */

export interface ImportOutcome {
  created: number
  updated: number
  deleted: number
  warnings: string[]
}

export const MAX_DELETES_PER_FILE = 10

export function emptyOutcome(): ImportOutcome {
  return { created: 0, updated: 0, deleted: 0, warnings: [] }
}

export function mergeOutcomes(into: ImportOutcome, from: ImportOutcome): ImportOutcome {
  return {
    created: into.created + from.created,
    updated: into.updated + from.updated,
    deleted: into.deleted + from.deleted,
    warnings: [...into.warnings, ...from.warnings],
  }
}

/** Fester Zeitstempel für importierte Erledigungen - auf jedem Gerät identisch. */
export function importedCompletedAt(completedDate: string): string {
  return `${completedDate}T12:00:00.000Z`
}

/**
 * Sicherung gegen halb geschriebene Dateien - etwa wenn Obsidians eigener Sync eine Datei
 * abgeschnitten ablegt und sie trotzdem sauber parst.
 *
 * Zwei Auslöser:
 *  - auffällig viele Löschungen auf einmal;
 *  - ein *leerer* Abschnitt, der mehr als einen Eintrag löschen würde. Genau ein Eintrag
 *    darf verschwinden, denn das ist der normale Weg, den letzten Eintrag loszuwerden -
 *    dabei bleibt der Abschnitt zwangsläufig leer.
 */
function deletionsAllowed(
  count: number,
  remainingEntries: number,
  label: string,
  outcome: ImportOutcome,
): boolean {
  if (count === 0) return true
  if (count > MAX_DELETES_PER_FILE) {
    outcome.warnings.push(
      `${label}: ${count} Löschungen auf einmal - übersprungen. Bitte in der App löschen.`,
    )
    return false
  }
  if (remainingEntries === 0 && count > 1) {
    outcome.warnings.push(
      `${label}: Abschnitt komplett leer, würde ${count} Einträge löschen - übersprungen.`,
    )
    return false
  }
  return true
}

// ------------------------------------------------------------------ Kategorien

/**
 * Löst einen Kategorienamen gegen die Kategorie-Tabelle auf.
 *
 * Ein unbekannter Name legt **nichts** an: sonst würde ein Tippfehler in einer Tageszeile zur
 * Kategorie. `undefined` heißt "nicht auflösbar" - der Aufrufer behält dann den bisherigen
 * Wert bzw. lässt ihn bei einem neuen Eintrag leer und meldet es.
 */
function resolveCategory(
  categories: readonly Category[],
  name: string | null,
): string | null | undefined {
  if (name === null) return null
  const wanted = cleanText(name)
  if (!wanted) return null
  return categories.find((c) => cleanText(c.name) === wanted)?.id ?? undefined
}

function warnUnknownCategory(name: string | null, label: string, outcome: ImportOutcome): void {
  outcome.warnings.push(
    `${label}: Kategorie "${name}" gibt es nicht - unverändert gelassen. Neue Kategorien legst du in Kategorien.md oder in der App an.`,
  )
}

export async function applyCategoriesFile(parsed: ParsedCategoriesFile): Promise<ImportOutcome> {
  const outcome = emptyOutcome()

  for (const row of parsed.rows) {
    // Abgeleitete statt zufälliger ID: zwei Geräte, die dieselbe neue Zeile lesen, legen
    // sonst zwei Kategorien an.
    const categoryId = row.id ?? derivedIdFor('cat', '', row.name ?? '')

    if (row.id === null) {
      // Zeile ohne ID -> neue Kategorie. Additiv und damit ungefährlich.
      if (!row.name) continue
      if (!(await db.categories.get(categoryId))) {
        await db.categories.add({
          id: categoryId,
          name: row.name,
          color: row.color ?? '#8a8a8a',
          createdAt: new Date().toISOString(),
        })
        outcome.created += 1
      }
      continue
    }

    const existing = await db.categories.get(row.id)
    if (!existing) continue

    const patch: Partial<Category> = {}
    // Leere Zelle heißt "unverändert" - sie löscht nichts.
    if (row.name !== null && row.name !== existing.name) patch.name = row.name
    if (row.color !== null && row.color !== existing.color) patch.color = row.color
    if (Object.keys(patch).length > 0) {
      await db.categories.update(row.id, patch)
      outcome.updated += 1
    }
  }

  // Eine entfernte Zeile löscht nichts: Aufgaben, Ziele und Erledigungen verweisen auf
  // Kategorien. Gelöscht wird nur in der App.
  return outcome
}

// ------------------------------------------------------------------ Tagesdatei

async function setCompletion(task: Task, dateStr: string, checked: boolean): Promise<boolean> {
  const existing = await db.taskCompletions
    .where('taskId')
    .equals(task.id)
    .and((c) => c.completedDate === dateStr)
    .first()

  if (checked) {
    if (existing) return false
    await db.taskCompletions.put({
      id: completionIdFor(task.id, dateStr),
      taskId: task.id,
      taskType: task.type,
      categoryId: task.categoryId,
      completedDate: dateStr,
      completedAt: importedCompletedAt(dateStr),
    })
    if (task.type !== 'recurring') {
      await db.tasks.update(task.id, { completed: true, completedAt: importedCompletedAt(dateStr) })
    }
    return true
  }

  if (!existing) return false
  await db.taskCompletions.delete(existing.id)
  if (task.type !== 'recurring') {
    // `uncompleteTask` taugt hier nicht - es schaut ausschließlich auf heute.
    await db.tasks.update(task.id, { completed: false, completedAt: null })
  }
  return true
}

async function setGoalCycle(goal: Goal, dateStr: string, checked: boolean): Promise<boolean> {
  const steps = await db.subSteps.where('goalId').equals(goal.id).toArray()
  const existing = await db.goalCycleCompletions
    .where('[goalId+cycleDueDate]')
    .equals([goal.id, dateStr])
    .first()

  if (checked) {
    if (existing) return false
    // Ein Haken am Ziel bedeutet: der komplette Zyklus ist erledigt, also auch alle
    // Teilschritte dieses Zyklus.
    for (const step of steps) {
      await db.subStepCycleCompletions.put({
        id: subStepCycleIdFor(step.id, dateStr),
        subStepId: step.id,
        goalId: goal.id,
        cycleDueDate: dateStr,
        completedAt: importedCompletedAt(dateStr),
      })
    }
    await db.goalCycleCompletions.put({
      id: goalCycleIdFor(goal.id, dateStr),
      goalId: goal.id,
      categoryId: goal.categoryId,
      cycleDueDate: dateStr,
      completedAt: importedCompletedAt(dateStr),
    })
    return true
  }

  if (!existing) return false
  await db.goalCycleCompletions.delete(existing.id)
  await db.subStepCycleCompletions
    .where('[goalId+cycleDueDate]')
    .equals([goal.id, dateStr])
    .delete()
  return true
}

async function updateTaskFields(
  task: Task,
  line: ItemLine,
  categories: readonly Category[],
  outcome: ImportOutcome,
  label: string,
): Promise<boolean> {
  const patch: Partial<Task> = {}
  if (line.title && line.title !== task.title) patch.title = line.title

  // Eine fehlende Klammer heißt "unverändert", nicht "Kategorie entfernen" - genauso wie
  // eine leere Tabellenzelle. Entfernt wird eine Kategorie in der App oder über `-` in
  // Aufgaben.md. Sonst würde ein vertippter Name die Zuordnung stillschweigend löschen.
  if (line.categoryName !== null) {
    const resolved = resolveCategory(categories, line.categoryName)
    if (resolved === undefined) warnUnknownCategory(line.categoryName, label, outcome)
    else if (resolved !== task.categoryId) patch.categoryId = resolved
  }

  if (task.type === 'appointment') {
    const appointmentPatch = patch as Partial<Extract<Task, { type: 'appointment' }>>
    if (line.startTime && line.startTime !== task.startTime) appointmentPatch.startTime = line.startTime
    if (line.endTime !== task.endTime) appointmentPatch.endTime = line.endTime
    if (line.location !== task.location) appointmentPatch.location = line.location
  } else {
    // Bei einmaligen und wiederkehrenden Aufgaben ist die Uhrzeit `time`.
    const timedPatch = patch as Partial<OneOffTask | RecurringTask>
    if (line.startTime !== task.time) timedPatch.time = line.startTime
  }

  if (Object.keys(patch).length === 0) return false
  await db.tasks.update(task.id, patch)
  return true
}

export async function applyDayFile(parsed: ParsedDayFile): Promise<ImportOutcome> {
  const outcome = emptyOutcome()
  const dateStr = parsed.dateStr
  const label = `Tagesdatei ${dateStr}`
  // Aus welchem Abschnitt eine Zeile stammt, entscheidet, was aus einer *neuen* Zeile wird:
  // unter "Termine" ein Termin, unter "Aufgaben" eine einmalige Aufgabe.
  const lines = [
    ...parsed.tasks.map((line) => ({ line, ausTerminen: false })),
    ...parsed.appointments.map((line) => ({ line, ausTerminen: true })),
  ]

  const [allTasks, categories] = await Promise.all([db.tasks.toArray(), db.categories.toArray()])
  const byId = new Map(allTasks.map((task) => [task.id, task]))

  const occurrence = occurrenceCounter()

  for (const { line, ausTerminen } of lines) {
    // Ohne Anker eine abgeleitete ID: sonst legen zwei Geräte aus derselben Zeile zwei
    // Aufgaben an, und beide landen im Repo.
    const taskId = line.id ?? derivedIdFor('task', dateStr, line.title, occurrence(line.title))
    const known = byId.get(taskId)

    if (!known) {
      /**
       * Neue Zeile in Obsidian -> neuer Eintrag für genau diesen Tag.
       *
       * Das gilt auch für eine Zeile, die bereits einen `^qd-`-Anker trägt. Eine ID, die
       * die App nicht kennt, ist kein Beleg für eine gelöschte Aufgabe: wäre sie in der
       * App gelöscht worden, wäre die Tagesdatei gegenüber dem letzten Abgleich
       * unverändert - und unveränderte Dateien reicht der Drei-Wege-Vergleich in
       * `syncEngine` gar nicht erst zum Import weiter.
       */
      const resolved = resolveCategory(categories, line.categoryName)
      if (resolved === undefined) warnUnknownCategory(line.categoryName, label, outcome)
      const gemeinsam = {
        // Den Anker aus der Datei behalten: so muss die Zeile nicht umgeschrieben werden,
        // und ein zweiter Lauf findet dieselbe Aufgabe wieder statt eine Dublette anzulegen.
        id: taskId,
        title: line.title,
        categoryId: resolved ?? null,
        reminderTime: null,
        reminderFired: false,
        createdAt: new Date().toISOString(),
        completed: false,
        completedAt: null,
      }

      // Ein Termin braucht zwingend eine Startzeit. Ohne Uhrzeit im Termine-Abschnitt
      // bleibt nur die einmalige Aufgabe - besser als ein Termin ohne Zeitpunkt.
      const wirdTermin = ausTerminen && line.startTime !== null
      if (ausTerminen && !wirdTermin) {
        outcome.warnings.push(
          `${label}: "${line.title}" steht unter Termine, hat aber keine Uhrzeit - als Aufgabe angelegt.`,
        )
      }

      const task: Task = wirdTermin
        ? {
            ...gemeinsam,
            type: 'appointment',
            date: dateStr,
            startTime: line.startTime as string,
            endTime: line.endTime,
            location: line.location,
          }
        : { ...gemeinsam, type: 'oneoff', dueDate: dateStr, time: line.startTime }

      await db.tasks.add(task)
      outcome.created += 1
      if (line.checked) await setCompletion(task, dateStr, true)
      continue
    }

    if (await updateTaskFields(known, line, categories, outcome, label)) outcome.updated += 1
    if (await setCompletion(known, dateStr, line.checked)) outcome.updated += 1
  }

  for (const line of parsed.goalCycles) {
    if (line.id === null) continue // Ziel-Zyklen entstehen nicht aus einer Tagesdatei.
    const goal = await db.goals.get(line.id)
    if (!goal?.recurrence) continue
    if (await setGoalCycle(goal, dateStr, line.checked)) outcome.updated += 1
  }

  // Löschen innerhalb einer Tagesdatei: nur, was ausschließlich zu diesem Tag gehört.
  // Wiederkehrende Aufgaben und Ziele überleben eine entfernte Zeile.
  const presentIds = new Set(
    lines.map(({ line }) => line.id).filter((id): id is string => id !== null),
  )
  const ownedByThisDay = allTasks.filter(
    (task) =>
      (task.type === 'oneoff' && task.dueDate === dateStr) ||
      (task.type === 'appointment' && task.date === dateStr),
  )
  const toDelete = ownedByThisDay.filter((task) => !presentIds.has(task.id))

  if (deletionsAllowed(toDelete.length, lines.length, label, outcome)) {
    for (const task of toDelete) {
      await db.tasks.delete(task.id)
      await db.taskCompletions.where('taskId').equals(task.id).delete()
      outcome.deleted += 1
    }
  }

  return outcome
}

// ------------------------------------------------------------------ Ziel-Datei

function buildRecurrence(
  parsed: ParsedGoalFile,
  existing: GoalRecurrence | null,
  today: string,
): GoalRecurrence | null {
  if (!parsed.recurrence) return null
  return {
    frequency: parsed.recurrence.frequency,
    weekdays: parsed.recurrence.weekdays,
    dayOfMonth: parsed.recurrence.dayOfMonth,
    intervalDays: parsed.recurrence.intervalDays,
    // Anker und Stopp-Zeitpunkt sind Identität des Zyklus bzw. eine App-Aktion - beides
    // wird bewusst nicht aus dem Repo übernommen.
    anchorDate: existing?.anchorDate ?? today,
    reminderTime: parsed.reminderTime,
    lastReminderFiredDate: existing?.lastReminderFiredDate ?? null,
    stoppedAt: existing?.stoppedAt ?? null,
  }
}

/**
 * Legt ein Ziel an, dessen ID die App noch nicht kennt.
 *
 * Ein in der App *gelöschtes* Ziel kann so nicht wieder auferstehen: dessen Datei ist
 * gegenüber dem letzten Abgleich unverändert, und der Drei-Wege-Vergleich in `syncEngine`
 * reicht unveränderte Dateien gar nicht erst zum Import weiter - sie werden gelöscht.
 * Hier landet also nur, was im Repo neu ist oder sich dort geändert hat.
 *
 * Erstellungsdatum und Kategorie kommen aus der Datei, damit die Datei nach dem Import
 * unverändert zurückgeschrieben wird und kein Ping-Pong entsteht.
 */
async function createGoalFromFile(
  parsed: ParsedGoalFile,
  today: string,
  outcome: ImportOutcome,
): Promise<Goal> {
  const categories = await db.categories.toArray()
  const resolved = resolveCategory(categories, parsed.categoryName)
  if (resolved === undefined) {
    warnUnknownCategory(parsed.categoryName, `Ziel "${parsed.title}"`, outcome)
  }

  const goal: Goal = {
    id: parsed.id,
    title: parsed.title,
    target: parsed.target,
    categoryId: resolved ?? null,
    // Feste Uhrzeit wie bei importierten Erledigungen: der Zeitstempel muss auf jedem
    // Gerät gleich ausfallen, sonst rendert jedes Gerät eine andere Datei.
    createdAt: importedCompletedAt(parsed.createdDate ?? today),
    targetDate: parsed.targetDate,
    completedAt: null,
    recurrence: buildRecurrence(parsed, null, today),
  }
  await db.goals.add(goal)
  outcome.created += 1
  return goal
}

export async function applyGoalFile(parsed: ParsedGoalFile, today: string): Promise<ImportOutcome> {
  const outcome = emptyOutcome()
  // Eine unbekannte ID ist ein in Obsidian neu angelegtes Ziel. Die Teilschritte darin
  // legt die Schleife weiter unten an, als wären sie neu hinzugekommen.
  const goal = (await db.goals.get(parsed.id)) ?? (await createGoalFromFile(parsed, today, outcome))

  const label = `Ziel "${goal.title}"`
  const categories = await db.categories.toArray()
  const recurrence = buildRecurrence(parsed, goal.recurrence, today)

  const patch: Partial<Goal> = {}
  if (parsed.title !== goal.title) patch.title = parsed.title
  if (parsed.target !== goal.target) patch.target = parsed.target
  if (parsed.targetDate !== goal.targetDate) patch.targetDate = parsed.targetDate
  if (JSON.stringify(recurrence) !== JSON.stringify(goal.recurrence)) patch.recurrence = recurrence

  const resolved = resolveCategory(categories, parsed.categoryName)
  if (resolved === undefined) warnUnknownCategory(parsed.categoryName, label, outcome)
  else if (resolved !== goal.categoryId) patch.categoryId = resolved

  if (Object.keys(patch).length > 0) {
    await db.goals.update(goal.id, patch)
    outcome.updated += 1
  }

  const existingSteps = await db.subSteps.where('goalId').equals(goal.id).toArray()
  const byId = new Map(existingSteps.map((step) => [step.id, step]))
  const seen = new Set<string>()
  const occurrence = occurrenceCounter()
  let nextOrder = 0

  for (const line of parsed.subSteps) {
    /**
     * Die ID aus der Zeile zählt, auch wenn dieses Gerät sie nicht kennt.
     *
     * Vorher bekam jede unbekannte Zeile eine frische Zufalls-ID. Beim Abgleich über
     * mehrere Geräte hieß das: Gerät B liest die Datei von Gerät A, vergibt eigene IDs,
     * schreibt sie zurück, A liest sie als unbekannt - und so fort. Die eigenen
     * Teilschritte fielen dabei in die Löschregel, die ab elf Einträgen aber nicht mehr
     * greift. Bei größeren Zielen blieben deshalb beide Sätze stehen.
     */
    const stepId = line.id ?? derivedIdFor('ss', goal.id, line.title, occurrence(line.title))
    // Auch außerhalb dieses Ziels nachsehen: sonst bräche `add` bei einer Zeile ab, die
    // von einer anderen Ziel-Datei hierher verschoben wurde.
    const existing = byId.get(stepId) ?? (await db.subSteps.get(stepId))

    if (!existing) {
      const step: SubStep = {
        id: stepId,
        goalId: goal.id,
        title: line.title,
        completed: line.checked,
        completedAt: line.checked ? importedCompletedAt(today) : null,
        order: nextOrder,
      }
      await db.subSteps.add(step)
      seen.add(step.id)
      outcome.created += 1
      nextOrder += 1
      continue
    }

    if (existing.goalId !== goal.id) {
      // Verschoben statt neu: sonst stünde derselbe Schritt in zwei Zielen.
      await db.subSteps.update(existing.id, { goalId: goal.id })
    }

    seen.add(existing.id)
    const patchStep: Partial<SubStep> = {}
    if (line.title !== existing.title) patchStep.title = line.title
    if (existing.order !== nextOrder) patchStep.order = nextOrder
    // Der Haken zählt nur bei einmaligen Zielen; wiederholende führen ihn pro Zyklus.
    if (!goal.recurrence && line.checked !== existing.completed) {
      patchStep.completed = line.checked
      patchStep.completedAt = line.checked ? importedCompletedAt(today) : null
    }
    if (Object.keys(patchStep).length > 0) {
      await db.subSteps.update(existing.id, patchStep)
      outcome.updated += 1
    }
    nextOrder += 1
  }

  // Löschen innerhalb der Plan-Phase: entfernte Teilschritt-Zeilen löschen den Teilschritt.
  const toDelete = existingSteps.filter((step) => !seen.has(step.id))
  if (deletionsAllowed(toDelete.length, parsed.subSteps.length, label, outcome)) {
    for (const step of toDelete) {
      await db.subSteps.delete(step.id)
      await db.subStepCycleCompletions.where('subStepId').equals(step.id).delete()
      outcome.deleted += 1
    }
  }

  await syncGoalCompletion(goal.id)
  return outcome
}

/** Ein einmaliges Ziel gilt als erledigt, sobald alle Teilschritte erledigt sind. */
async function syncGoalCompletion(goalId: string): Promise<void> {
  const goal = await db.goals.get(goalId)
  if (!goal || goal.recurrence) return
  const steps = await db.subSteps.where('goalId').equals(goalId).toArray()
  const allDone = steps.length > 0 && steps.every((step) => step.completed)
  const completedAt = allDone ? (goal.completedAt ?? new Date().toISOString()) : null
  if (completedAt !== goal.completedAt) await db.goals.update(goalId, { completedAt })
}

// ------------------------------------------------------------------ Aufgaben.md

/**
 * Legt eine wiederkehrende Aufgabe aus einer von Hand ergänzten Tabellenzeile an.
 *
 * Bei einer neuen Zeile bedeutet eine leere Zelle "kein Wert" statt "unverändert" - der
 * Sonderfall, den `applyTasksFile` sonst gerade andersherum behandelt. Ohne Titel gibt es
 * nichts anzulegen; ohne Rhythmus ist täglich die einzige sinnvolle Annahme, und die wird
 * gemeldet statt stillschweigend gesetzt.
 */
async function createRecurringFromRow(
  row: ParsedTaskRow,
  taskId: string,
  categories: readonly Category[],
  outcome: ImportOutcome,
): Promise<void> {
  const title = row.title
  if (!title) {
    outcome.warnings.push('Aufgaben.md: Zeile ohne Titel - nicht angelegt.')
    return
  }

  const resolved = row.categoryName ? resolveCategory(categories, row.categoryName) : null
  if (resolved === undefined) warnUnknownCategory(row.categoryName, `Aufgaben "${title}"`, outcome)

  if (row.frequency === null) {
    outcome.warnings.push(`Aufgaben "${title}": kein Rhythmus angegeben - als täglich angelegt.`)
  }

  const task: RecurringTask = {
    id: taskId,
    type: 'recurring',
    title,
    categoryId: resolved ?? null,
    frequency: row.frequency ?? 'daily',
    weekdays: row.frequency === 'weekly' ? row.weekdays : [],
    time: row.time ? row.time : null,
    reminderTime: row.reminderTime ? row.reminderTime : null,
    reminderFired: false,
    createdAt: new Date().toISOString(),
    completed: false,
    completedAt: null,
  }
  await db.tasks.add(task)
  outcome.created += 1
}

export async function applyTasksFile(parsed: ParsedTasksFile): Promise<ImportOutcome> {
  const outcome = emptyOutcome()
  const categories = await db.categories.toArray()

  for (const row of parsed.rows) {
    // Wie oben: ohne ID in der Zeile eine abgeleitete, damit zwei Geräte zusammenfinden.
    const taskId = row.id ?? derivedIdFor('rec', '', row.title ?? '')
    const task = await db.tasks.get(taskId)

    // Zeile ohne ID oder mit einer, die die App nicht kennt: von Hand ergänzt, also anlegen.
    // Für eine in der App gelöschte Aufgabe wäre die Datei seit dem letzten Abgleich
    // unverändert - solche Dateien erreichen den Import gar nicht erst.
    if (!task) {
      await createRecurringFromRow(row, taskId, categories, outcome)
      continue
    }
    // Eine ID, die zu einer einmaligen Aufgabe oder einem Termin gehört, gehört nicht
    // hierher; anlegen würde eine Dublette erzeugen.
    if (task.type !== 'recurring') continue

    const patch: Partial<Task> = {}
    // Leere Zelle heißt "unverändert" - sie löscht nichts.
    if (row.title !== null && row.title !== task.title) patch.title = row.title

    if (row.categoryName === '') {
      if (task.categoryId !== null) patch.categoryId = null
    } else if (row.categoryName !== null) {
      const resolved = resolveCategory(categories, row.categoryName)
      if (resolved === undefined) warnUnknownCategory(row.categoryName, 'Aufgaben.md', outcome)
      else if (resolved !== task.categoryId) patch.categoryId = resolved
    }

    if (row.frequency !== null) {
      const recurringPatch = patch as Partial<RecurringTask>
      if (row.frequency !== task.frequency) recurringPatch.frequency = row.frequency
      const weekdays = row.frequency === 'weekly' ? row.weekdays : []
      if (JSON.stringify(weekdays) !== JSON.stringify(task.weekdays)) recurringPatch.weekdays = weekdays
    }

    if (row.time !== null) {
      const time = row.time === '' ? null : row.time
      if (time !== task.time) (patch as Partial<RecurringTask>).time = time
    }

    if (row.reminderTime !== null) {
      const reminderTime = row.reminderTime === '' ? null : row.reminderTime
      if (reminderTime !== task.reminderTime) {
        patch.reminderTime = reminderTime
        patch.reminderFired = false
      }
    }

    if (Object.keys(patch).length > 0) {
      await db.tasks.update(task.id, patch)
      outcome.updated += 1
    }
  }

  // Eine entfernte Zeile löscht hier bewusst nichts: Erledigungen verweisen auf diese
  // Aufgaben. Gelöscht wird nur in der App.
  return outcome
}

// ------------------------------------------------------------------ Ungeplant

/**
 * Einmalige Aufgaben ohne Datum.
 *
 * Sie stehen in keiner Tagesdatei; ihr Zustand lag bisher ausschließlich in
 * `questday-data.json`, und die wird nur additiv angewandt. Ein Häkchen darauf kam deshalb
 * nie beim zweiten Gerät an - beide Geräte schrieben endlos ihre eigene Fassung. Hier gilt
 * dieselbe Regel wie in einer Tagesdatei: Was in der Datei steht, wird übernommen.
 */
export async function applyUnplannedFile(parsed: ParsedUnplannedFile): Promise<ImportOutcome> {
  const outcome = emptyOutcome()
  const label = 'Ungeplant.md'

  const [allTasks, categories] = await Promise.all([db.tasks.toArray(), db.categories.toArray()])
  const byId = new Map(allTasks.map((task) => [task.id, task]))
  const occurrence = occurrenceCounter()
  const seen = new Set<string>()

  for (const line of parsed.tasks) {
    const taskId = line.id ?? derivedIdFor('task', 'ungeplant', line.title, occurrence(line.title))
    const known = byId.get(taskId)

    if (!known) {
      const resolved = resolveCategory(categories, line.categoryName)
      if (resolved === undefined) warnUnknownCategory(line.categoryName, label, outcome)
      const task: OneOffTask = {
        id: taskId,
        type: 'oneoff',
        title: line.title,
        categoryId: resolved ?? null,
        dueDate: null,
        time: line.startTime,
        reminderTime: null,
        reminderFired: false,
        createdAt: new Date().toISOString(),
        completed: line.checked,
        completedAt: line.checked ? importedCompletedAt(todayISODate()) : null,
      }
      await db.tasks.add(task)
      seen.add(task.id)
      outcome.created += 1
      continue
    }

    seen.add(known.id)
    if (await updateTaskFields(known, line, categories, outcome, label)) outcome.updated += 1

    // Der Haken ist hier die ganze Wahrheit: ohne Datum gibt es keine Tageszeile, die ihn
    // sonst tragen könnte.
    if (known.completed !== line.checked) {
      await db.tasks.update(known.id, {
        completed: line.checked,
        completedAt: line.checked ? importedCompletedAt(todayISODate()) : null,
      })
      if (!line.checked) await db.taskCompletions.where('taskId').equals(known.id).delete()
      outcome.updated += 1
    }
  }

  // Entfernte Zeile löscht die Aufgabe - sie gehört ausschließlich in diese Datei.
  const ownedHere = allTasks.filter((t) => t.type === 'oneoff' && t.dueDate === null)
  const toDelete = ownedHere.filter((task) => !seen.has(task.id))
  if (deletionsAllowed(toDelete.length, parsed.tasks.length, label, outcome)) {
    for (const task of toDelete) {
      await db.tasks.delete(task.id)
      await db.taskCompletions.where('taskId').equals(task.id).delete()
      outcome.deleted += 1
    }
  }

  return outcome
}
