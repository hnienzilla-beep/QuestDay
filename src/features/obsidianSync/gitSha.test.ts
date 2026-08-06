import { describe, it, expect, vi, afterEach } from 'vitest'
import { gitBlobShaOf } from './gitSha'

/**
 * Referenzwerte stammen aus `git hash-object` - wenn diese Tests brechen, stimmt der
 * SHA-Vergleich gegen die Git-Trees-API nicht mehr und der Sync würde entweder
 * Änderungen übersehen oder bei jedem Lauf committen.
 */
const CASES: [name: string, content: string, sha: string][] = [
  ['einfach', 'hello\n', 'ce013625030ba8dba906f756967f9e9ca394464a'],
  ['leer', '', 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'],
  ['Umlaut und Emoji', 'Müll rausbringen 🎯', '215fb4b4e1a5eaab13065228bca679c77cbe66a3'],
  ['Markdown-Zeile', '# Titel\n\n- [x] Ä (Haushalt) ^qd-1\n', '0c0f003d5d71dc69d268e9200e9118c9a99af351'],
]

describe('gitBlobShaOf', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(CASES)('entspricht git hash-object: %s', async (_name, content, expected) => {
    expect(await gitBlobShaOf(content)).toBe(expected)
  })

  it.each(CASES)('JS-Fallback ohne WebCrypto stimmt überein: %s', async (_name, content, expected) => {
    vi.stubGlobal('crypto', { ...globalThis.crypto, subtle: undefined })
    expect(await gitBlobShaOf(content)).toBe(expected)
  })

  it('zählt Bytes, nicht Zeichen', async () => {
    // "ä" ist ein Zeichen, aber zwei Bytes - ein Header mit Zeichenlänge ergäbe einen anderen SHA.
    const twoBytes = await gitBlobShaOf('ä')
    const oneByte = await gitBlobShaOf('a')
    expect(twoBytes).not.toBe(oneByte)
  })
})
