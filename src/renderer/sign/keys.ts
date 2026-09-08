/**
 * Signaturschlüssel dieses Macs (ECDSA P-256 über die Web-Crypto-API).
 * Der private Schlüssel bleibt lokal in einer Datei im App-Verzeichnis.
 */

import { bytesToArrayBuffer as ab } from '../lib/bytes'

const ALG: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' }
const KEY_ALG: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' }
const STORE_KEY = 'signingKey'

interface StoredKey {
  v: 1
  created: string
  privateJwk: JsonWebKey
  publicJwk: JsonWebKey
}

export interface MacKey {
  created: string
  keyId: string
  publicRawB64: string
  priv: CryptoKey
  pub: CryptoKey
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s)
}
export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s.trim())
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export function hex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(u)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Kurze, gut vorlesbare Kennung aus dem öffentlichen Schlüssel. */
export async function fingerprint(publicRaw: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', ab(publicRaw))).slice(0, 10)
  return hex(d)
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, '$1-')
}

async function importPair(stored: StoredKey): Promise<MacKey> {
  const priv = await crypto.subtle.importKey('jwk', stored.privateJwk, KEY_ALG, false, ['sign'])
  const pub = await crypto.subtle.importKey('jwk', stored.publicJwk, KEY_ALG, true, ['verify'])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pub))
  return {
    created: stored.created,
    keyId: await fingerprint(raw),
    publicRawB64: b64(raw),
    priv,
    pub
  }
}

let cached: Promise<MacKey> | null = null

async function generate(): Promise<StoredKey> {
  const pair = (await crypto.subtle.generateKey(KEY_ALG, true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    v: 1,
    created: new Date().toISOString(),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey)
  }
}

/** Lädt den Mac-Schlüssel; erzeugt ihn beim allerersten Aufruf. */
export function getMacKey(): Promise<MacKey> {
  if (!cached) {
    cached = (async () => {
      const raw = await window.api.getSecret(STORE_KEY)
      let stored: StoredKey
      if (raw) {
        stored = JSON.parse(raw) as StoredKey
      } else {
        stored = await generate()
        await window.api.setSecret(STORE_KEY, JSON.stringify(stored))
      }
      return importPair(stored)
    })()
  }
  return cached
}

/** Ersetzt den Schlüssel unwiderruflich durch einen neuen. */
export async function regenerateMacKey(): Promise<MacKey> {
  const stored = await generate()
  await window.api.setSecret(STORE_KEY, JSON.stringify(stored))
  cached = importPair(stored)
  return cached
}

export async function importPublicKey(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ab(b64ToBytes(rawB64)), KEY_ALG, true, ['verify'])
}

export async function signData(priv: CryptoKey, data: Uint8Array): Promise<string> {
  const sig = await crypto.subtle.sign(ALG, priv, ab(data))
  return b64(sig)
}

export async function verifyData(
  pub: CryptoKey,
  sigB64: string,
  data: Uint8Array
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(ALG, pub, ab(b64ToBytes(sigB64)), ab(data))
  } catch {
    return false
  }
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', ab(data)))
}

/* ---------- Schlüssel teilen (verschlüsselt) ---------- */

const KEYFILE_HEADER = 'ASTRA-KEY-1'
const PBKDF2_ITERS = 210_000

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    ab(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: ab(salt), iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Verschlüsselt den aktuellen Signaturschlüssel mit einem Passwort → teilbarer Text. */
export async function exportEncryptedKey(password: string): Promise<string> {
  const raw = await window.api.getSecret(STORE_KEY)
  if (!raw) throw new Error('Kein Schlüssel vorhanden')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aes = await deriveAesKey(password, salt)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ab(iv) },
      aes,
      ab(new TextEncoder().encode(raw))
    )
  )
  const payload = new Uint8Array(28 + ct.length)
  payload.set(salt, 0)
  payload.set(iv, 16)
  payload.set(ct, 28)
  return `${KEYFILE_HEADER}\n${b64(payload).replace(/(.{72})(?=.)/g, '$1\n')}\n`
}

/** Übernimmt einen verschlüsselten Schlüssel als aktiven Signaturschlüssel dieses Geräts. */
export async function importEncryptedKey(fileText: string, password: string): Promise<MacKey> {
  const body = fileText.replace(KEYFILE_HEADER, '').replace(/\s+/g, '')
  const payload = b64ToBytes(body)
  const salt = payload.slice(0, 16)
  const iv = payload.slice(16, 28)
  const ct = payload.slice(28)
  const aes = await deriveAesKey(password, salt)
  let json: string
  try {
    json = new TextDecoder().decode(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(iv) }, aes, ab(ct))
    )
  } catch {
    throw new Error('Falsches Passwort oder beschädigte Datei')
  }
  const stored = JSON.parse(json) as StoredKey
  await window.api.setSecret(STORE_KEY, JSON.stringify(stored))
  cached = importPair(stored)
  return cached
}
