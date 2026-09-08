/**
 * Kompakter Metadaten-Leser: JPEG-EXIF (Kamera, Aufnahme, GPS), PNG-Textblöcke,
 * plus Erkennung von XMP-/IPTC-Blöcken. Reicht, um dem Nutzer zu zeigen,
 * was in der Datei steckt und beim Export entfernt wird.
 */

export interface MetaField {
  label: string
  value: string
  sensitive?: boolean
}

const TIFF_TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

interface Reader {
  dv: DataView
  le: boolean
  tiffStart: number
}

function readValue(r: Reader, type: number, count: number, valueOffset: number): number[] | string {
  const { dv, le, tiffStart } = r
  const size = TIFF_TYPE_SIZE[type] ?? 1
  const total = size * count
  const base = total <= 4 ? valueOffset : tiffStart + dv.getUint32(valueOffset, le)

  if (type === 2) {
    let s = ''
    for (let i = 0; i < count; i++) {
      const code = dv.getUint8(base + i)
      if (code === 0) break
      s += String.fromCharCode(code)
    }
    return s.trim()
  }
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const off = base + i * size
    switch (type) {
      case 1:
      case 7:
        out.push(dv.getUint8(off))
        break
      case 3:
        out.push(dv.getUint16(off, le))
        break
      case 4:
      case 9:
        out.push(dv.getUint32(off, le))
        break
      case 5:
        out.push(dv.getUint32(off, le) / (dv.getUint32(off + 4, le) || 1))
        break
      case 10:
        out.push(dv.getInt32(off, le) / (dv.getInt32(off + 4, le) || 1))
        break
      default:
        out.push(0)
    }
  }
  return out
}

interface IfdEntry {
  type: number
  count: number
  valueOffset: number
}

function parseIfd(r: Reader, ifdOffset: number): Map<number, IfdEntry> {
  const map = new Map<number, IfdEntry>()
  const { dv, le, tiffStart } = r
  const abs = tiffStart + ifdOffset
  if (abs + 2 > dv.byteLength) return map
  const count = dv.getUint16(abs, le)
  for (let i = 0; i < count; i++) {
    const e = abs + 2 + i * 12
    if (e + 12 > dv.byteLength) break
    const tag = dv.getUint16(e, le)
    map.set(tag, {
      type: dv.getUint16(e + 2, le),
      count: dv.getUint32(e + 4, le),
      valueOffset: e + 8
    })
  }
  return map
}

function num(r: Reader, entry?: IfdEntry): number | undefined {
  if (!entry) return undefined
  const v = readValue(r, entry.type, entry.count, entry.valueOffset)
  return Array.isArray(v) ? v[0] : undefined
}
function str(r: Reader, entry?: IfdEntry): string | undefined {
  if (!entry) return undefined
  const v = readValue(r, entry.type, entry.count, entry.valueOffset)
  return typeof v === 'string' ? v : undefined
}

function dms(r: Reader, entry: IfdEntry | undefined, ref: string | undefined): string | undefined {
  if (!entry) return undefined
  const v = readValue(r, entry.type, entry.count, entry.valueOffset)
  if (!Array.isArray(v) || v.length < 3) return undefined
  const dec = v[0] + v[1] / 60 + v[2] / 3600
  const signed = ref === 'S' || ref === 'W' ? -dec : dec
  return signed.toFixed(6)
}

function parseJpegExif(bytes: Uint8Array): MetaField[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dv.getUint16(0) !== 0xffd8) return []
  const fields: MetaField[] = []
  let offset = 2
  let exifSeg: { start: number } | null = null
  let hasXmp = false
  let hasIptc = false

  while (offset + 4 < dv.byteLength) {
    if (dv.getUint8(offset) !== 0xff) break
    const marker = dv.getUint8(offset + 1)
    if (marker === 0xda || marker === 0xd9) break
    const len = dv.getUint16(offset + 2)
    const segStart = offset + 4
    if (marker === 0xe1) {
      const tag = readAscii(bytes, segStart, 6)
      if (tag.startsWith('Exif')) exifSeg = { start: segStart + 6 }
      else if (tag.startsWith('http')) hasXmp = true
    } else if (marker === 0xed) {
      hasIptc = true
    } else if (marker === 0xee) {
      // APP14 Adobe – irrelevant
    }
    offset += 2 + len
  }

  if (exifSeg) {
    const tiffStart = exifSeg.start
    const le = dv.getUint16(tiffStart) === 0x4949
    const r: Reader = { dv, le, tiffStart }
    const ifd0off = dv.getUint32(tiffStart + 4, le)
    const ifd0 = parseIfd(r, ifd0off)

    push(fields, 'Kamera-Hersteller', str(r, ifd0.get(0x010f)))
    push(fields, 'Kamera-Modell', str(r, ifd0.get(0x0110)))
    push(fields, 'Software', str(r, ifd0.get(0x0131)))
    push(fields, 'Aufnahmedatum', str(r, ifd0.get(0x0132)))
    push(fields, 'Autor', str(r, ifd0.get(0x013b)), true)
    push(fields, 'Copyright', str(r, ifd0.get(0x8298)))

    const exifPtr = num(r, ifd0.get(0x8769))
    if (exifPtr) {
      const exif = parseIfd(r, exifPtr)
      push(fields, 'Aufnahmedatum', str(r, exif.get(0x9003)))
      const exp = num(r, exif.get(0x829a))
      if (exp) push(fields, 'Belichtungszeit', exp >= 1 ? `${exp}s` : `1/${Math.round(1 / exp)}s`)
      const fn = num(r, exif.get(0x829d))
      if (fn) push(fields, 'Blende', `f/${fn.toFixed(1)}`)
      const iso = num(r, exif.get(0x8827))
      if (iso) push(fields, 'ISO', String(iso))
      const fl = num(r, exif.get(0x920a))
      if (fl) push(fields, 'Brennweite', `${Math.round(fl)} mm`)
      push(fields, 'Objektiv', str(r, exif.get(0xa434)))
    }

    const gpsPtr = num(r, ifd0.get(0x8825))
    if (gpsPtr) {
      const gps = parseIfd(r, gpsPtr)
      const lat = dms(r, gps.get(0x0002), str(r, gps.get(0x0001)))
      const lon = dms(r, gps.get(0x0004), str(r, gps.get(0x0003)))
      if (lat && lon) push(fields, 'GPS-Standort', `${lat}, ${lon}`, true)
      else push(fields, 'GPS-Daten', 'enthalten', true)
    }
  }

  if (hasXmp) push(fields, 'XMP-Metadaten', 'enthalten')
  if (hasIptc) push(fields, 'IPTC-Metadaten', 'enthalten')
  return fields
}

function parsePngText(bytes: Uint8Array): MetaField[] {
  const fields: MetaField[] = []
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return fields
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let p = 8
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p)
    const type = readAscii(bytes, p + 4, 4)
    const dataStart = p + 8
    if (type === 'IEND') break
    if (type === 'tEXt') {
      const raw = readAscii(bytes, dataStart, len)
      const i = raw.indexOf('\0')
      if (i > 0) push(fields, raw.slice(0, i), raw.slice(i + 1).trim())
    } else if (type === 'iTXt') {
      const raw = readAscii(bytes, dataStart, len)
      const parts = raw.split('\0')
      if (parts.length >= 2) push(fields, parts[0], parts[parts.length - 1].trim())
    } else if (type === 'tIME' && len >= 7) {
      const y = dv.getUint16(dataStart)
      push(
        fields,
        'Änderungsdatum',
        `${y}-${pad(bytes[dataStart + 2])}-${pad(bytes[dataStart + 3])} ${pad(bytes[dataStart + 4])}:${pad(bytes[dataStart + 5])}`
      )
    } else if (type === 'pHYs' && len >= 9) {
      const ppuX = dv.getUint32(dataStart)
      if (dv.getUint8(dataStart + 8) === 1)
        push(fields, 'Auflösung', `${Math.round(ppuX * 0.0254)} dpi`)
    }
    p = dataStart + len + 4
  }
  return fields
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let s = ''
  for (let i = 0; i < length && start + i < bytes.length; i++)
    s += String.fromCharCode(bytes[start + i])
  return s
}
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function push(
  list: MetaField[],
  label: string,
  value: string | undefined,
  sensitive = false
): void {
  if (value == null || value === '') return
  if (list.some((f) => f.label === label)) return
  list.push({ label, value, sensitive })
}

export function readImageMeta(bytes: Uint8Array, mime: string): MetaField[] {
  try {
    if (mime.includes('png')) return parsePngText(bytes)
    if (mime.includes('jpeg') || mime.includes('jpg')) return parseJpegExif(bytes)
  } catch {
    /* defensiv: unlesbare Metadaten einfach überspringen */
  }
  return []
}
