/**
 * Sprachausgabe über die Web Speech API - läuft komplett auf dem Gerät,
 * ohne Server und ohne Cloud-Dienst (siehe Datenschutz-Prinzip der App).
 *
 * iOS-Eigenheiten, die hier berücksichtigt sind:
 * - `speak()` muss aus einer Nutzer-Geste heraus starten.
 * - Sehr lange Äußerungen brechen mittendrin ab, deshalb wird in Sätze zerlegt.
 * - Die Stimmenliste ist beim ersten Aufruf oft noch leer (`voiceschanged`).
 */

const MAX_CHUNK_LENGTH = 180

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function germanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.lang === 'de-DE') ?? voices.find((v) => v.lang.startsWith('de')) ?? null
}

/** Zerlegt den Text an Satzgrenzen in Häppchen, die iOS zuverlässig ausspricht. */
export function chunkForSpeech(text: string, maxLength: number = MAX_CHUNK_LENGTH): string[] {
  const sentences = text.split(/(?<=[.!?:])\s+/).filter((s) => s.trim().length > 0)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    for (const piece of sentence.length > maxLength ? splitLongSentence(sentence, maxLength) : [sentence]) {
      if (current.length === 0) {
        current = piece
      } else if (current.length + piece.length + 1 <= maxLength) {
        current += ` ${piece}`
      } else {
        chunks.push(current)
        current = piece
      }
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

function splitLongSentence(sentence: string, maxLength: number): string[] {
  const parts: string[] = []
  let rest = sentence
  while (rest.length > maxLength) {
    const cut = rest.lastIndexOf(' ', maxLength)
    const at = cut > 0 ? cut : maxLength
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest.length > 0) parts.push(rest)
  return parts
}

export function cancelSpeech(): void {
  if (!speechSupported()) return
  window.speechSynthesis.cancel()
}

export interface SpeakOptions {
  onEnd?: () => void
  onError?: () => void
}

/** Liest den Text vor. Ein laufender Vortrag wird vorher abgebrochen. */
export function speak(text: string, options: SpeakOptions = {}): void {
  if (!speechSupported()) {
    options.onError?.()
    return
  }

  const synth = window.speechSynthesis
  synth.cancel()

  const voice = germanVoice()
  const chunks = chunkForSpeech(text)
  if (chunks.length === 0) {
    options.onEnd?.()
    return
  }

  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.lang = 'de-DE'
    if (voice) utterance.voice = voice
    utterance.rate = 1
    if (index === chunks.length - 1) {
      utterance.onend = () => options.onEnd?.()
    }
    utterance.onerror = (event) => {
      // Ein Abbruch per cancelSpeech() ist kein Fehler, den der Nutzer sehen muss.
      if (event.error === 'canceled' || event.error === 'interrupted') return
      options.onError?.()
    }
    synth.speak(utterance)
  })
}

/** Stößt das asynchrone Laden der Stimmenliste an, damit die erste Ausgabe deutsch klingt. */
export function warmUpVoices(): void {
  if (!speechSupported()) return
  window.speechSynthesis.getVoices()
}
