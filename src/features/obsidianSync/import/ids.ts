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

/**
 * Deterministische ID für einen Eintrag, den mehrere Geräte unabhängig voneinander aus
 * derselben Zeile anlegen.
 *
 * Ohne das entstehen Dubletten statt eines gemeinsamen Eintrags: Gerät A und Gerät B lesen
 * dieselbe Zeile ohne Anker, würfeln je eine eigene UUID und schreiben beide zurück. Aus
 * derselben Ableitung folgt dagegen auf beiden Geräten dieselbe ID - der Abgleich erkennt
 * einen einzigen Eintrag.
 *
 * Anders als die Erledigungs-IDs oben landen diese IDs als Obsidian-Block-Anker in der
 * Datei. Erlaubt sind dort nur Buchstaben, Ziffern und Bindestriche - deshalb ein Hash und
 * keine lesbare Zusammensetzung. Ein Doppelpunkt oder Leerzeichen würde den Anker
 * unlesbar machen, und die Zeile käme beim nächsten Lesen ohne ID zurück.
 */

/** FNV-1a, zweimal mit verschiedenem Startwert - 64 Bit als 16 Hex-Zeichen. */
function hash(text: string): string {
  const runde = (offset: number): number => {
    let h = offset
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
  }
  return runde(0x811c9dc5).toString(16).padStart(8, '0') + runde(0x9dc5811c).toString(16).padStart(8, '0')
}

export function derivedIdFor(
  kind: 'ss' | 'task' | 'rec' | 'cat',
  scope: string,
  name: string,
  occurrence = 0,
): string {
  const key = `${kind}:${scope}:${name.toLowerCase().replace(/\s+/g, ' ').trim()}:${occurrence}`
  return `qd${kind}-${hash(key)}`
}

/** Zählt gleichlautende Titel innerhalb einer Datei, damit ihre IDs auseinandergehen. */
export function occurrenceCounter(): (title: string) => number {
  const gesehen = new Map<string, number>()
  return (title: string) => {
    const key = title.toLowerCase().replace(/\s+/g, ' ').trim()
    const n = gesehen.get(key) ?? 0
    gesehen.set(key, n + 1)
    return n
  }
}
