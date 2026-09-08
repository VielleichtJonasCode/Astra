import {
  getMacKey,
  importPublicKey,
  sha256Hex,
  signData,
  verifyData,
  b64ToBytes,
  fingerprint
} from './keys'

const MARKER = '\n%%ASTRA-SIG '

export interface SigBlock {
  v: 1
  alg: 'ES256'
  keyId: string
  created: string
  /** SHA-256 des Dokuments (ohne diesen Block), Hex. */
  hash: string
  /** Signatur über die Dokument-Bytes, Base64. */
  sig: string
  /** Öffentlicher Schlüssel (raw, unkomprimiert), Base64. */
  pub: string
  /** Freitext, z. B. „signiert mit Astra auf dem Mac von …". */
  note?: string
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/** Sucht das letzte Astra-Signatur-Trailer im Datei-Puffer. */
export function splitTrailer(file: Uint8Array): { doc: Uint8Array; block: SigBlock } | null {
  const text = new TextDecoder('latin1').decode(file)
  const at = text.lastIndexOf(MARKER)
  if (at < 0) return null
  const jsonStart = at + MARKER.length
  const jsonEnd = text.indexOf('\n', jsonStart)
  const json = text.slice(jsonStart, jsonEnd < 0 ? undefined : jsonEnd)
  try {
    const block = JSON.parse(json) as SigBlock
    if (block.v !== 1 || !block.sig || !block.pub) return null
    return { doc: file.slice(0, at), block }
  } catch {
    return null
  }
}

/**
 * Hängt eine unsichtbare Mac-Signatur an ein fertiges PDF an
 * (nach `%%EOF`, wird von PDF-Betrachtern ignoriert).
 */
export async function appendMacSignature(pdf: Uint8Array, note?: string): Promise<Uint8Array> {
  const existing = splitTrailer(pdf)
  const doc = existing ? existing.doc : pdf
  const key = await getMacKey()
  const block: SigBlock = {
    v: 1,
    alg: 'ES256',
    keyId: key.keyId,
    created: new Date().toISOString(),
    hash: await sha256Hex(doc),
    sig: await signData(key.priv, doc),
    pub: key.publicRawB64,
    note: note ?? 'Signiert mit Astra auf einem Mac'
  }
  const trailer = new TextEncoder().encode(MARKER + JSON.stringify(block) + '\n')
  return concat(doc, trailer)
}

export type VerifyStatus = 'ok' | 'foreign' | 'modified' | 'invalid' | 'none'

export interface VerifyResult {
  status: VerifyStatus
  keyId?: string
  created?: string
  note?: string
  /** true, wenn der Schlüssel exakt dem dieses Macs entspricht. */
  isMine?: boolean
}

/** Prüft eine Datei auf eine gültige Astra-Signatur. */
export async function verifyMacSignature(file: Uint8Array): Promise<VerifyResult> {
  const parsed = splitTrailer(file)
  if (!parsed) return { status: 'none' }
  const { doc, block } = parsed

  // Kennung neu aus dem eingebetteten Schlüssel berechnen (nicht dem Feld vertrauen).
  let realKeyId: string
  let pubKey: CryptoKey
  try {
    realKeyId = await fingerprint(b64ToBytes(block.pub))
    pubKey = await importPublicKey(block.pub)
  } catch {
    return { status: 'invalid' }
  }

  const mine = await getMacKey().catch(() => null)
  const isMine = mine?.publicRawB64 === block.pub

  const hashNow = await sha256Hex(doc)
  const sigOk = await verifyData(pubKey, block.sig, doc)

  if (!sigOk) {
    return {
      status: hashNow === block.hash ? 'invalid' : 'modified',
      keyId: realKeyId,
      created: block.created
    }
  }
  if (hashNow !== block.hash) {
    return { status: 'modified', keyId: realKeyId, created: block.created, note: block.note }
  }
  return {
    status: isMine ? 'ok' : 'foreign',
    keyId: realKeyId,
    created: block.created,
    note: block.note,
    isMine
  }
}
