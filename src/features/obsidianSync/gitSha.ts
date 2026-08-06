/**
 * Git-Blob-SHA-1 lokal berechnen.
 *
 * Git bildet die Objekt-ID eines Blobs als `sha1("blob " + byteLänge + "\0" + bytes)`.
 * Genau dieser Wert steht im `sha`-Feld der Einträge, die die Git-Trees-API liefert.
 * Damit kann der Sync den lokalen Renderstand mit dem Repo vergleichen, ohne auch nur
 * eine einzige Datei herunterzuladen.
 *
 * Wichtig: die Länge im Header zählt **Bytes**, nicht Zeichen - bei Umlauten und Emoji
 * ist das ein Unterschied.
 */

function concatHeaderAndBody(bytes: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`)
  const out = new Uint8Array(header.byteLength + bytes.byteLength)
  out.set(header, 0)
  out.set(bytes, header.byteLength)
  return out
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export async function gitBlobShaOfBytes(bytes: Uint8Array): Promise<string> {
  const message = concatHeaderAndBody(bytes)
  // `crypto.subtle` gibt es nur im Secure Context. Beim Testen über die LAN-IP
  // (http://192.168.x.x:5173) ist es schlicht undefined - daher der Fallback.
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-1', message as unknown as ArrayBuffer)
    return toHex(new Uint8Array(digest))
  }
  return sha1Fallback(message)
}

export function gitBlobShaOf(content: string): Promise<string> {
  return gitBlobShaOfBytes(new TextEncoder().encode(content))
}

/** Reines JS-SHA-1 (RFC 3174) für Kontexte ohne WebCrypto. */
function sha1Fallback(message: Uint8Array): string {
  const bitLength = message.byteLength * 8
  const paddedLength = (((message.byteLength + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(message, 0)
  padded[message.byteLength] = 0x80
  const view = new DataView(padded.buffer)
  // Länge als 64-Bit-Big-Endian; die oberen 32 Bit bleiben bei realistischen Dateigrößen 0.
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Uint32Array(80)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 80; i++) {
      w[i] = rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (rotateLeft(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotateLeft(b, 30)
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  return [h0, h1, h2, h3, h4].map((value) => value.toString(16).padStart(8, '0')).join('')
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}
