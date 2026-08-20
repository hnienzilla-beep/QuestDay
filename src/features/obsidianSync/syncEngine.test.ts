import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../../db/db'
import { runSync } from './syncEngine'
import { gitBlobShaOf } from './gitSha'
import { loadSnapshot } from './model/snapshot'
import { renderVault } from './render/renderVault'
import { getSyncSettings, repoKeyOf, saveSyncSettings } from './settings'
import { clearSyncState, commitSyncState, emptySyncState } from './syncState'
import { todayISODate } from '../../utils/dateUtils'
import { CATEGORIES, oneOff, recurring } from '../../test/fixtures'

/**
 * Ein Fake-GitHub, das gerade genug kann, um die Zusagen des Verfahrens zu prüfen:
 * ETag/304, Blob-Auslieferung, Commit in einem Zug - und einen Zähler für die Requests.
 */
class FakeGitHub {
  files = new Map<string, string>()
  requests: string[] = []
  version = 1
  commits = 0
  failNextRefUpdate = false
  pendingTree: { path: string; content?: string }[] | null = null

  get etag(): string {
    return `W/"v${this.version}"`
  }

  /** Simuliert eine Änderung von außen (Obsidian, anderes Gerät). */
  touch(): void {
    this.version += 1
  }

  get requestCount(): number {
    return this.requests.length
  }

  reset(): void {
    this.requests = []
    this.commits = 0
  }

  async shaOf(content: string): Promise<string> {
    return gitBlobShaOf(content)
  }

  private async tree(): Promise<{ path: string; sha: string; type: string }[]> {
    const entries: { path: string; sha: string; type: string }[] = []
    for (const [path, content] of this.files) {
      entries.push({ path, sha: await this.shaOf(content), type: 'blob' })
    }
    return entries
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    this.requests.push(`${method} ${url.replace('https://api.github.com/repos/me/vault', '')}`)

    if (url.includes('/git/trees/') && method === 'GET') {
      const headers = new Headers(init?.headers)
      if (headers.get('If-None-Match') === this.etag) {
        return new Response(null, { status: 304 })
      }
      return Response.json(
        { tree: await this.tree(), truncated: false },
        { headers: { etag: this.etag } },
      )
    }

    if (url.includes('/git/blobs/')) {
      const sha = url.split('/git/blobs/')[1]
      for (const content of this.files.values()) {
        if ((await this.shaOf(content)) === sha) return new Response(content)
      }
      return new Response('not found', { status: 404 })
    }

    if (url.includes('/git/ref/heads/')) {
      return Response.json({ object: { sha: 'head-commit' } })
    }
    if (url.includes('/git/commits/') && method === 'GET') {
      return Response.json({ tree: { sha: 'base-tree' } })
    }

    // Ein erzeugter Tree ist noch nicht sichtbar - erst der Ref-Update veröffentlicht ihn.
    // Genau darauf beruht die 422-Behandlung, deshalb bildet der Fake das nach.
    if (url.endsWith('/git/trees') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as {
        tree: { path: string; content?: string; sha: null | string }[]
      }
      this.pendingTree = body.tree
      return Response.json({ sha: 'new-tree' })
    }
    if (url.endsWith('/git/commits') && method === 'POST') {
      return Response.json({ sha: 'new-commit' })
    }
    if (url.includes('/git/refs/heads/') && method === 'PATCH') {
      if (this.failNextRefUpdate) {
        this.failNextRefUpdate = false
        this.pendingTree = null
        return new Response('{}', { status: 422 })
      }
      for (const entry of this.pendingTree ?? []) {
        if (entry.content === undefined) this.files.delete(entry.path)
        else this.files.set(entry.path, entry.content)
      }
      this.pendingTree = null
      this.commits += 1
      this.touch()
      return Response.json({ ok: true })
    }

    throw new Error(`unerwarteter Request: ${method} ${url}`)
  }
}

let github: FakeGitHub

async function resetDb(): Promise<void> {
  await Promise.all([
    db.tasks.clear(),
    db.taskCompletions.clear(),
    db.goals.clear(),
    db.subSteps.clear(),
    db.goalCycleCompletions.clear(),
    db.subStepCycleCompletions.clear(),
    db.categories.clear(),
  ])
  await db.categories.bulkPut(CATEGORIES)
}

beforeEach(async () => {
  localStorage.clear()
  clearSyncState()
  await resetDb()
  saveSyncSettings({ username: 'me', repo: 'vault', branch: 'main', token: 'tok' })
  github = new FakeGitHub()
  github.files.set('README.md', '# Mein Vault\n')
  vi.stubGlobal('fetch', github.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runSync', () => {
  it('schreibt beim ersten Lauf das Vault und lässt fremde Dateien in Ruhe', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen' }))
    const result = await runSync()

    expect(result.commitSha).toBe('new-commit')
    expect(github.commits).toBe(1)
    expect(github.files.get('README.md')).toBe('# Mein Vault\n')
    expect([...github.files.keys()]).toContain('QuestDay/questday-data.json')
    expect([...github.files.keys()]).toContain(`QuestDay/Tage/${todayISODate()}.md`)
  })

  it('kostet ohne Änderungen genau eine Anfrage und erzeugt keinen Commit', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen' }))
    await runSync()

    github.reset()
    const second = await runSync()

    expect(github.requestCount).toBe(1)
    expect(github.commits).toBe(0)
    expect(second.commitSha).toBeNull()
    expect(second.pushed).toBe(0)
  })

  it('bleibt auch über mehrere Leerläufe bei einer Anfrage', async () => {
    await runSync()
    for (let i = 0; i < 3; i++) {
      github.reset()
      await runSync()
      expect(github.requestCount).toBe(1)
      expect(github.commits).toBe(0)
    }
  })

  it('übernimmt einen im Repo gesetzten Haken in die App', async () => {
    // Fällig am echten heutigen Tag, nicht am Fixture-Datum: die Engine schreibt die
    // Tagesdatei für todayISODate(), und nur dort steht die Zeile, die hier angehakt wird.
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen', dueDate: todayISODate() }))
    await runSync()

    const dayPath = `QuestDay/Tage/${todayISODate()}.md`
    github.files.set(dayPath, github.files.get(dayPath)!.replace('- [ ]', '- [x]'))
    github.touch()

    github.reset()
    const result = await runSync()

    expect(result.imported).toBeGreaterThan(0)
    expect(await db.taskCompletions.count()).toBe(1)
  })

  it('läuft nach dem Import wieder in den Leerlauf', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen' }))
    await runSync()
    const dayPath = `QuestDay/Tage/${todayISODate()}.md`
    github.files.set(dayPath, github.files.get(dayPath)!.replace('- [ ]', '- [x]'))
    github.touch()
    await runSync()

    github.reset()
    await runSync()
    expect(github.commits).toBe(0)
  })

  it('lässt eine unlesbare Datei unangetastet und meldet sie', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen' }))
    await runSync()

    const dayPath = `QuestDay/Tage/${todayISODate()}.md`
    const broken = `${github.files.get(dayPath)!}\n## Notizen\n\nHandschriftlicher Kram\n`
    github.files.set(dayPath, broken)
    github.touch()

    const result = await runSync()

    expect(result.quarantined).toContain(dayPath)
    // Weder überschrieben noch angewandt.
    expect(github.files.get(dayPath)).toBe(broken)
    expect(await db.taskCompletions.count()).toBe(0)
  })

  it('lädt eine bereits als unlesbar bekannte Datei nicht erneut', async () => {
    await runSync()
    const dayPath = `QuestDay/Tage/${todayISODate()}.md`
    github.files.set(dayPath, `${github.files.get(dayPath)!}\n## Notizen\n\nKram\n`)
    github.touch()
    await runSync()

    github.reset()
    await runSync()
    expect(github.requests.filter((r) => r.includes('/git/blobs/'))).toHaveLength(0)
  })

  it('wiederholt den kompletten Lauf, wenn ein anderes Gerät dazwischenpusht', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen' }))
    github.failNextRefUpdate = true

    const result = await runSync()

    expect(result.commitSha).toBe('new-commit')
    // Der abgelehnte Versuch hinterlässt nichts; genau ein Commit landet im Branch.
    expect(github.commits).toBe(1)
    expect(github.requests.filter((r) => r.startsWith('PATCH /git/refs/'))).toHaveLength(2)
  })

  it('schreibt bei fehlgeschlagenem Push keinen Abgleichstand fort', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'A' }))
    github.failNextRefUpdate = true
    github.fetch = (async () => {
      throw new Error('offline')
    }) as unknown as typeof github.fetch
    vi.stubGlobal('fetch', github.fetch)

    await expect(runSync()).rejects.toThrow()
    expect(localStorage.getItem('questday-sync-state')).toBeNull()
  })

  it('stellt ein leeres Gerät aus questday-data.json wieder her', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen' }))
    await db.tasks.put(recurring({ id: 'r1', title: 'Zähne putzen' }))
    await runSync()

    // Zweites Gerät: leere Datenbank, kein gemerkter Zustand, dasselbe Repo.
    await resetDb()
    clearSyncState()
    github.reset()

    const result = await runSync()

    expect(result.imported).toBeGreaterThan(0)
    expect(await db.tasks.count()).toBe(2)
    expect((await db.tasks.get('o1'))!.title).toBe('Müll rausbringen')
    expect(await db.categories.count()).toBe(CATEGORIES.length)
  })

  it('löscht eine Ziel-Datei aus dem Repo, wenn das Ziel in der App gelöscht wurde', async () => {
    await db.goals.put({
      id: 'g1',
      title: 'Marathon',
      target: 'Sub-3:30',
      categoryId: null,
      createdAt: '2026-07-01T08:00:00.000Z',
      targetDate: null,
      completedAt: null,
      recurrence: null,
    })
    await runSync()
    expect([...github.files.keys()]).toContain('QuestDay/Ziele/marathon.md')

    await db.goals.delete('g1')
    await runSync()
    expect([...github.files.keys()]).not.toContain('QuestDay/Ziele/marathon.md')
    // Seit eine Ziel-Datei ein Ziel anlegen darf, ist das die eigentliche Zusage: die noch
    // im Repo liegende Datei darf das gelöschte Ziel nicht wieder auferstehen lassen.
    expect(await db.goals.get('g1')).toBeUndefined()
    expect(await db.subSteps.where('goalId').equals('g1').count()).toBe(0)
  })

  it('löscht eine Datei nicht, die zu keinem Eintrag in der App gehört', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen', dueDate: todayISODate() }))
    await runSync()

    // Eine Tagesdatei weit in der Vergangenheit: lesbar, aber ohne Inhalt, den die App
    // kennt - sie rendert für dieses Datum keine Datei.
    const alt = 'QuestDay/Tage/2020-01-01.md'
    github.files.set(
      alt,
      ['---', 'typ: questday-tag', 'datum: 2020-01-01', '---', '', '## Aufgaben', '', '## Termine', '', '## Ziele', ''].join('\n'),
    )
    github.touch()

    const result = await runSync()

    expect([...github.files.keys()]).toContain(alt)
    expect(result.warnings.join(' ')).toContain(alt)

    // Und auch im Folgelauf nicht: der Schutz darf nicht nur einmal greifen.
    github.touch()
    await runSync()
    expect([...github.files.keys()]).toContain(alt)
  })

  it('übernimmt eine im Repo ergänzte Aufgaben-Zeile mit fremdem Anker', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen', dueDate: todayISODate() }))
    await runSync()

    const dayPath = `QuestDay/Tage/${todayISODate()}.md`
    const fremd = '- [ ] 09:00 Koffer packen ^qd-ed0f9ab7-0594-49ad-bb82-c5af4aecd3dd'
    github.files.set(dayPath, github.files.get(dayPath)!.replace('## Termine', `${fremd}\n\n## Termine`))
    github.touch()

    await runSync()

    const angelegt = await db.tasks.get('ed0f9ab7-0594-49ad-bb82-c5af4aecd3dd')
    expect(angelegt).toMatchObject({ title: 'Koffer packen', time: '09:00' })
    // Und die Zeile überlebt das Zurückschreiben - genau daran scheiterte es vorher.
    expect(github.files.get(dayPath)).toContain('Koffer packen')

    github.touch()
    await runSync()
    expect(github.files.get(dayPath)).toContain('Koffer packen')
    expect(await db.tasks.count()).toBe(2)
  })

  it('überträgt das Häkchen einer undatierten Aufgabe auf das andere Gerät', async () => {
    // Undatierte Aufgaben stehen in keiner Tagesdatei. Ihr Zustand lag deshalb nur in
    // questday-data.json - und die wird beim Import nur additiv angewandt. Ein Haken kam so
    // nie beim zweiten Gerät an, und beide Geräte schrieben endlos ihre eigene Fassung.
    await db.tasks.put(oneOff({ id: 'u1', title: 'Leon App', dueDate: null }))
    await runSync()

    const pfad = 'QuestDay/Ungeplant.md'
    expect(github.files.get(pfad)).toContain('Leon App')

    // Das andere Gerät hakt sie ab.
    github.files.set(pfad, github.files.get(pfad)!.replace('- [ ]', '- [x]'))
    github.touch()

    await runSync()

    expect((await db.tasks.get('u1'))?.completed).toBe(true)
  })

  it('nimmt das Häkchen einer undatierten Aufgabe auch wieder zurück', async () => {
    await db.tasks.put(oneOff({ id: 'u1', title: 'Leon App', dueDate: null, completed: true, completedAt: '2026-08-18T18:47:42.157Z' }))
    await runSync()

    const pfad = 'QuestDay/Ungeplant.md'
    github.files.set(pfad, github.files.get(pfad)!.replace('- [x]', '- [ ]'))
    github.touch()

    await runSync()

    expect((await db.tasks.get('u1'))?.completed).toBe(false)
  })

  it('schreibt keinen Commit, wenn sich nur der Datenabzug unterscheidet', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen', dueDate: todayISODate() }))
    await runSync()

    // Ein anderes Gerät hat dieselbe Sachlage, aber andere Zeitstempel in der JSON - ein
    // Unterschied, über den sich beide Seiten nie einigen können.
    const abzug = 'QuestDay/questday-data.json'
    github.files.set(abzug, github.files.get(abzug)!.replace('"createdAt"', '"createdAt "'))
    github.touch()

    github.reset()
    const ergebnis = await runSync()

    expect(github.commits).toBe(0)
    expect(ergebnis.pushed).toBe(0)
  })

  it('schreibt den Datenabzug weiterhin mit, sobald es echte Änderungen gibt', async () => {
    await runSync()
    const abzugVorher = github.files.get('QuestDay/questday-data.json')

    await db.tasks.put(oneOff({ id: 'neu', title: 'Frisch', dueDate: todayISODate() }))
    github.reset()
    await runSync()

    expect(github.commits).toBe(1)
    expect(github.files.get('QuestDay/questday-data.json')).not.toBe(abzugVorher)
  })

  it('schreibt gleichnamige Ziele nicht zwischen zwei Geräten hin und her', async () => {
    // Der gemeldete Fall: zwei Ziele mit demselben Titel. Welches Ziel in welche Datei kam,
    // entschied der lokal gemerkte Stand - und der liegt im localStorage, ist also auf jedem
    // Gerät ein anderer. Beide Geräte schrieben deshalb bei jedem Lauf beide Dateien um.
    const basis = {
      target: '',
      categoryId: null,
      createdAt: '2026-08-18T08:00:00.000Z',
      targetDate: null,
      completedAt: null,
      recurrence: null,
    }
    const A = 'aaa11111-0000-0000-0000-000000000000'
    const B = 'bbb22222-0000-0000-0000-000000000000'
    await db.goals.bulkPut([
      { ...basis, id: A, title: 'Übernachtung bei der Freundin' },
      { ...basis, id: B, title: 'Übernachtung bei der Freundin' },
    ])

    // Gerät 1 hat sich die umgekehrte Zuordnung gemerkt.
    const repoKey = repoKeyOf(getSyncSettings()!)
    commitSyncState({
      ...emptySyncState(repoKey),
      goalPaths: {
        [B]: 'QuestDay/Ziele/uebernachtung-bei-der-freundin.md',
        [A]: 'QuestDay/Ziele/uebernachtung-bei-der-freundin-2.md',
      },
    })
    await runSync()
    const nachGeraet1 = new Map(github.files)

    // Gerät 2: dieselben Daten, aber ohne diese Vorgeschichte.
    clearSyncState()
    github.reset()
    const zweiter = await runSync()

    expect(zweiter.pushed).toBe(0)
    expect(github.commits).toBe(0)
    expect([...github.files.entries()].sort()).toEqual([...nachGeraet1.entries()].sort())
  })

  it('legt ein im Repo neu angelegtes Ziel in der App an', async () => {
    await runSync()

    github.files.set(
      'QuestDay/Ziele/hochzeit-packliste.md',
      [
        '---',
        'typ: questday-ziel',
        'id: repo-1',
        'kategorie: null',
        'erstellt: 2026-08-13',
        'zieldatum: null',
        'wiederholung: keine',
        '---',
        '',
        '# Hochzeit Packliste',
        '',
        'Drei Tage Hochzeit.',
        '',
        '## Teilschritte',
        '',
        '- [ ] Anzug einpacken',
        '',
      ].join('\n'),
    )
    github.touch()

    await runSync()

    const angelegt = await db.goals.get('repo-1')
    expect(angelegt?.title).toBe('Hochzeit Packliste')
    expect(await db.subSteps.where('goalId').equals('repo-1').count()).toBe(1)
    // Die Datei bleibt liegen und wird nicht als verwaist weggeräumt.
    expect([...github.files.keys()]).toContain('QuestDay/Ziele/hochzeit-packliste.md')
  })
})

describe('renderVault gegen das Repo', () => {
  it('rendert nach einem Sync byteidentisch zum Repo-Inhalt', async () => {
    await db.tasks.put(oneOff({ id: 'o1', title: 'Müll rausbringen' }))
    await runSync()

    const snapshot = await loadSnapshot(todayISODate())
    const rendered = renderVault(snapshot, {})
    for (const [path, content] of rendered.files) {
      expect(github.files.get(path)).toBe(content)
    }
  })
})
