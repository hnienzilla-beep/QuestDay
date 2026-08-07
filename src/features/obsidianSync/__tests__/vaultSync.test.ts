import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, tables, seed, xpTotal, ID, OLD, START_XP } from './fakeDb'

vi.mock('../../../db/db', () => ({ db }))

const { renderTodoFile } = await import('../todoExport')
const { renderGoalFile } = await import('../goalExport')
const { parseTodoFile } = await import('../todoParse')
const { parseGoalFile } = await import('../goalParse')
const { importTodoChanges } = await import('../importTodos')
const { importGoalChanges } = await import('../importGoals')
const { vaultWins } = await import('../vaultDiff')

/** Commit-Zeitpunkt der Vault-Änderung; liegt nach OLD, also gewinnt der Vault. */
const VAULT_EDIT = '2026-08-07T09:00:00Z'
const APP_NEWER = '2026-08-07T12:00:00.000Z'

const todos = (md: string) => parseTodoFile(md)!
const goals = (md: string) => parseGoalFile(md)!

/** Entfernt genau die Zeilen, die einen Text enthalten – simuliert Löschen in Obsidian. */
function dropLines(md: string, needle: string): string {
  return md
    .split('\n')
    .filter((line) => !line.includes(needle))
    .join('\n')
}

beforeEach(seed)

describe('Round-Trip Export → Parse', () => {
  it('findet jede To-do-Zeile mit ihrer ID wieder', async () => {
    const parsed = todos(await renderTodoFile())
    expect(parsed).toHaveLength(4)
    expect(parsed.every((p) => p.id !== null)).toBe(true)
  })

  it('liest Titel, Kategorie und Fälligkeit einer Aufgabe zurück', async () => {
    const steuer = todos(await renderTodoFile()).find((p) => p.id === ID.steuer)!
    expect(steuer).toMatchObject({ title: 'Steuer abgeben', category: 'Arbeit', dueDate: '2026-08-01', done: false })
  })

  it('liest Zeit und Ort eines Termins zurück', async () => {
    const termin = todos(await renderTodoFile()).find((p) => p.id === ID.zahnarzt)!
    expect(termin).toMatchObject({
      title: 'Zahnarzt',
      dueDate: '2026-08-09',
      startTime: '09:00',
      endTime: '10:00',
      location: 'Praxis Mitte',
    })
  })

  it('liest die Wiederholung einer wiederkehrenden Aufgabe zurück', async () => {
    const sport = todos(await renderTodoFile()).find((p) => p.id === ID.sport)!
    expect(sport).toMatchObject({ title: 'Sport', frequency: 'weekly', weekday: 1 })
  })

  it('findet Ziele samt Teilschritten und IDs wieder', async () => {
    const parsed = goals(await renderGoalFile())
    expect(parsed).toHaveLength(2)
    const marathon = parsed.find((g) => g.id === ID.marathon)!
    expect(marathon).toMatchObject({ title: 'Marathon laufen', category: 'Hobby', target: '42 km', targetDate: '2026-12-01' })
    expect(marathon.steps.map((s) => s.id)).toEqual([ID.step10km, ID.step21km])
  })
})

describe('Import von Vault-Änderungen', () => {
  it('übernimmt Abhaken, Umbenennen, Anlegen und Löschen', async () => {
    const before = await renderTodoFile()
    let after = before
      .replace('- [ ] Steuer abgeben (Arbeit) 📅 2026-08-01', '- [x] Steuer abgeben (Arbeit) 📅 2026-08-01')
      .replace('- [ ] Buch lesen (Hobby)', '- [ ] Buch zu Ende lesen (Hobby) 📅 2026-08-15')
      .replace('## Ohne Datum\n', '## Ohne Datum\n\n- [ ] Neue Idee notieren (Sonstiges)\n')
    after = dropLines(after, 'Zahnarzt')

    const summary = await importTodoChanges(todos(before), todos(after), VAULT_EDIT, OLD)
    expect(summary).toEqual({ created: 1, updated: 2, deleted: 1 })

    expect(await db.tasks.get(ID.steuer)).toMatchObject({ completed: true })
    expect(await db.tasks.get(ID.buch)).toMatchObject({ title: 'Buch zu Ende lesen', dueDate: '2026-08-15' })
    expect(await db.tasks.get(ID.zahnarzt)).toBeUndefined()

    const neu = (await tables.tasks.toArray()).find((t) => t.title === 'Neue Idee notieren')
    expect(neu).toMatchObject({ type: 'oneoff', category: 'Sonstiges' })
  })

  it('schreibt beim Abhaken eine Completion und vergibt XP', async () => {
    const before = await renderTodoFile()
    const after = before.replace('- [ ] Steuer abgeben', '- [x] Steuer abgeben')

    await importTodoChanges(todos(before), todos(after), VAULT_EDIT, OLD)
    expect(await tables.taskCompletions.toArray()).toHaveLength(1)
    expect(await xpTotal()).toBeGreaterThan(START_XP)
  })

  it('bucht XP wieder ab, wenn ein Haken im Vault entfernt wird', async () => {
    const before = await renderTodoFile()
    await importTodoChanges(todos(before), todos(before.replace('- [ ] Steuer abgeben', '- [x] Steuer abgeben')), VAULT_EDIT, OLD)

    // Zweite Runde wie im echten Ablauf: der Sync hat lastSyncAt vorgerückt,
    // die nächste Vault-Änderung ist ein späterer Commit.
    const syncedAt = '2026-08-07T09:05:00.000Z'
    const laterEdit = '2026-08-07T10:00:00Z'
    const done = await renderTodoFile()
    const reopened = done.replace('- [x] Steuer abgeben', '- [ ] Steuer abgeben')

    await importTodoChanges(todos(done), todos(reopened), laterEdit, syncedAt)
    expect(await xpTotal()).toBe(START_XP)
    expect(await tables.taskCompletions.toArray()).toHaveLength(0)
    expect(await db.tasks.get(ID.steuer)).toMatchObject({ completed: false })
  })

  it('ändert nichts, wenn die Datei unverändert ist', async () => {
    const md = await renderTodoFile()
    expect(await importTodoChanges(todos(md), todos(md), VAULT_EDIT, OLD)).toEqual({ created: 0, updated: 0, deleted: 0 })
  })
})

describe('Konfliktregel', () => {
  it('verwirft die Vault-Änderung, wenn die App neuer ist', async () => {
    await db.tasks.update(ID.buch, { title: 'In der App umbenannt', updatedAt: APP_NEWER })
    const before = await renderTodoFile()
    const after = before.replace('In der App umbenannt', 'Im Vault umbenannt')

    const summary = await importTodoChanges(todos(before), todos(after), VAULT_EDIT, OLD)
    expect(summary.updated).toBe(0)
    expect(await db.tasks.get(ID.buch)).toMatchObject({ title: 'In der App umbenannt' })
  })

  it('übernimmt die Vault-Änderung, wenn der Vault neuer ist', async () => {
    await db.tasks.update(ID.buch, { title: 'In der App umbenannt', updatedAt: '2026-08-07T08:00:00.000Z' })
    const before = await renderTodoFile()
    const after = before.replace('In der App umbenannt', 'Im Vault umbenannt')

    await importTodoChanges(todos(before), todos(after), VAULT_EDIT, OLD)
    expect(await db.tasks.get(ID.buch)).toMatchObject({ title: 'Im Vault umbenannt' })
  })

  it('schützt eine in der App gelöschte Aufgabe vor Wiederauferstehung', async () => {
    const before = await renderTodoFile()
    const after = before.replace('- [ ] Buch lesen', '- [x] Buch lesen')
    await db.tasks.delete(ID.buch)

    const summary = await importTodoChanges(todos(before), todos(after), VAULT_EDIT, OLD)
    expect(summary.updated).toBe(0)
    expect(await db.tasks.get(ID.buch)).toBeUndefined()
  })

  it('entscheidet vaultWins nach Zeitstempel', () => {
    expect(vaultWins(OLD, VAULT_EDIT, '2026-08-06T00:00:00.000Z')).toBe(true)
    expect(vaultWins(APP_NEWER, VAULT_EDIT, OLD)).toBe(false)
    expect(vaultWins('2026-08-07T08:00:00.000Z', VAULT_EDIT, OLD)).toBe(true)
    // Ohne Commit-Datum bleibt der App-Stand stehen, statt zu raten.
    expect(vaultWins(APP_NEWER, null, OLD)).toBe(false)
  })
})

describe('Ziele aus dem Vault', () => {
  it('übernimmt Umbenennung, Abhaken und neue Teilschritte', async () => {
    const before = await renderGoalFile()
    const after = before
      .replace('### Marathon laufen', '### Marathon 2027')
      .replace('- [ ] 10 km schaffen', '- [x] 10 km schaffen')
      .replace(/^(- \[ \] 21 km schaffen.*)$/m, '$1\n- [ ] 30 km schaffen')

    const summary = await importGoalChanges(goals(before), goals(after), VAULT_EDIT, OLD)
    expect(summary).toEqual({ created: 1, updated: 2, deleted: 0 })
    expect(await db.goals.get(ID.marathon)).toMatchObject({ title: 'Marathon 2027' })
    expect(await db.subSteps.get(ID.step10km)).toMatchObject({ completed: true })
    // Die neue Zeile darf die ID der darüberliegenden nicht erben.
    expect(await db.subSteps.get(ID.step21km)).toMatchObject({ title: '21 km schaffen' })
    expect((await tables.subSteps.toArray()).some((s) => s.title === '30 km schaffen')).toBe(true)
  })

  it('bucht einen Teilschritt eines wiederkehrenden Ziels auf den aktuellen Zyklus', async () => {
    const before = await renderGoalFile()
    const after = before.replace('- [ ] Notizen durchgehen', '- [x] Notizen durchgehen')

    await importGoalChanges(goals(before), goals(after), VAULT_EDIT, OLD)
    expect(await tables.subStepCycleCompletions.toArray()).toHaveLength(1)
    // Einziger Teilschritt des Ziels: der Zyklus gilt damit als abgeschlossen.
    expect(await tables.goalCycleCompletions.toArray()).toHaveLength(1)
    // Der Teilschritt selbst bleibt offen – er gehört zum nächsten Zyklus wieder dazu.
    expect(await db.subSteps.get(ID.stepNotizen)).toMatchObject({ completed: false })
  })

  it('löscht einen im Vault entfernten Teilschritt', async () => {
    const before = await renderGoalFile()
    const after = dropLines(before, '21 km schaffen')

    const summary = await importGoalChanges(goals(before), goals(after), VAULT_EDIT, OLD)
    expect(summary.deleted).toBe(1)
    expect(await db.subSteps.get(ID.step21km)).toBeUndefined()
  })

  it('legt ein im Vault neu geschriebenes Ziel an', async () => {
    const before = await renderGoalFile()
    const after = before.replace(
      '## Offene Ziele\n',
      '## Offene Ziele\n\n### Gitarre lernen\n\n- Kategorie: Hobby\n- Ziel: 5 Lieder\n\n- [ ] Akkorde üben\n',
    )

    const summary = await importGoalChanges(goals(before), goals(after), VAULT_EDIT, OLD)
    expect(summary.created).toBe(1)
    const neu = (await tables.goals.toArray()).find((g) => g.title === 'Gitarre lernen')
    expect(neu).toMatchObject({ category: 'Hobby', target: '5 Lieder', recurrence: null })
    expect((await tables.subSteps.toArray()).filter((s) => s.goalId === neu!.id)).toHaveLength(1)
  })

  it('ändert nichts, wenn die Datei unverändert ist', async () => {
    const md = await renderGoalFile()
    expect(await importGoalChanges(goals(md), goals(md), VAULT_EDIT, OLD)).toEqual({ created: 0, updated: 0, deleted: 0 })
  })
})

describe('Schutz vor kaputten Dateien', () => {
  it('lehnt eine To-do-Datei ohne Überschrift ab', () => {
    expect(parseTodoFile('- [ ] irgendwas')).toBeNull()
  })

  it('lehnt eine Ziele-Datei ohne Überschrift ab', () => {
    expect(parseGoalFile('### Ziel')).toBeNull()
  })
})
