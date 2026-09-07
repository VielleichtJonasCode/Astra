/** Kopiert die Nutzdaten eines Uint8Array in einen frischen ArrayBuffer. */
export function bytesToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(u8.byteLength)
  new Uint8Array(copy).set(u8)
  return copy
}

/** Blob aus Bytes, ohne TS-Reibung mit ArrayBufferLike. */
export function bytesToBlob(u8: Uint8Array, type: string): Blob {
  return new Blob([bytesToArrayBuffer(u8)], { type })
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
