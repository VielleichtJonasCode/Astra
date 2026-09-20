export type Category = 'image' | 'pdf' | 'document' | 'spreadsheet' | 'audio' | 'video' | 'other'

export const EXT_CATEGORY: Record<string, Category> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  bmp: 'image',
  avif: 'image',
  heic: 'image',
  heif: 'image',
  tif: 'image',
  tiff: 'image',
  svg: 'image',
  pdf: 'pdf',
  docx: 'document',
  txt: 'document',
  md: 'document',
  markdown: 'document',
  html: 'document',
  htm: 'document',
  rtf: 'document',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  mp3: 'audio',
  wav: 'audio',
  aac: 'audio',
  m4a: 'audio',
  flac: 'audio',
  ogg: 'audio',
  opus: 'audio',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  avi: 'video',
  m4v: 'video'
}

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}
export function categoryOf(name: string): Category {
  return EXT_CATEGORY[extOf(name)] ?? 'other'
}
export function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '')
}

const IMAGE_TARGETS = ['png', 'jpeg', 'webp', 'avif', 'bmp']
const AUDIO_TARGETS = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus']
const VIDEO_TARGETS = ['mp4', 'mov', 'mkv', 'webm', 'avi']

export interface Target {
  ext: string
  label: string
  note?: string
}

/** Mögliche Zielformate für eine Quelldatei. */
export function targetsFor(name: string): Target[] {
  const cat = categoryOf(name)
  const src = extOf(name)
  const norm = src === 'jpg' ? 'jpeg' : src
  const not = (arr: string[]): string[] => arr.filter((e) => e !== norm)

  if (cat === 'image') {
    return [
      ...not(IMAGE_TARGETS).map((ext) => ({ ext, label: ext.toUpperCase() })),
      { ext: 'pdf', label: 'PDF', note: 'Bild als eine Seite' }
    ]
  }
  if (cat === 'pdf') {
    return [
      { ext: 'png', label: 'PNG', note: 'pro Seite ein Bild' },
      { ext: 'jpeg', label: 'JPEG', note: 'pro Seite ein Bild' },
      { ext: 'webp', label: 'WebP', note: 'pro Seite ein Bild' },
      { ext: 'txt', label: 'Text (.txt)' },
      { ext: 'docx', label: 'Word (.docx)', note: 'Textinhalt, kein Layout' }
    ]
  }
  if (cat === 'document') {
    if (src === 'docx') {
      return [
        { ext: 'pdf', label: 'PDF' },
        { ext: 'html', label: 'HTML' },
        { ext: 'txt', label: 'Text (.txt)' },
        { ext: 'md', label: 'Markdown' }
      ]
    }
    // txt / md / html / rtf
    const outs: Target[] = [{ ext: 'pdf', label: 'PDF' }]
    for (const e of ['html', 'txt', 'md'])
      if (e !== src) outs.push({ ext: e, label: e.toUpperCase() })
    return outs
  }
  if (cat === 'spreadsheet') {
    const outs: Target[] = []
    if (src !== 'csv') outs.push({ ext: 'csv', label: 'CSV', note: 'erstes Tabellenblatt' })
    if (src !== 'xlsx') outs.push({ ext: 'xlsx', label: 'Excel (.xlsx)' })
    outs.push({ ext: 'pdf', label: 'PDF', note: 'als Tabelle' })
    return outs
  }
  if (cat === 'audio') {
    return not(AUDIO_TARGETS).map((ext) => ({ ext, label: ext.toUpperCase() }))
  }
  if (cat === 'video') {
    return [
      ...not(VIDEO_TARGETS).map((ext) => ({ ext, label: ext.toUpperCase() })),
      { ext: 'gif', label: 'GIF', note: 'animiert, ohne Ton' },
      { ext: 'mp3', label: 'MP3', note: 'nur Tonspur' },
      { ext: 'm4a', label: 'M4A', note: 'nur Tonspur' }
    ]
  }
  return []
}

export type Runner =
  | 'image'
  | 'image-to-pdf'
  | 'pdf-to-image'
  | 'pdf-to-text'
  | 'pdf-to-docx'
  | 'doc-to-pdf'
  | 'doc-to-text'
  | 'sheet-to-csv'
  | 'sheet-to-xlsx'
  | 'sheet-to-pdf'
  | 'media'
  | 'none'

/** Welcher Konverter ist für (Quelle → Ziel) zuständig? */
export function runnerFor(srcName: string, targetExt: string): Runner {
  const cat = categoryOf(srcName)
  const t = targetExt.toLowerCase()
  if (cat === 'image') return t === 'pdf' ? 'image-to-pdf' : 'image'
  if (cat === 'pdf') {
    if (['png', 'jpeg', 'jpg', 'webp', 'avif'].includes(t)) return 'pdf-to-image'
    if (t === 'txt') return 'pdf-to-text'
    if (t === 'docx') return 'pdf-to-docx'
    return 'none'
  }
  if (cat === 'document') {
    if (t === 'pdf') return 'doc-to-pdf'
    return 'doc-to-text'
  }
  if (cat === 'spreadsheet') {
    if (t === 'csv') return 'sheet-to-csv'
    if (t === 'xlsx') return 'sheet-to-xlsx'
    if (t === 'pdf') return 'sheet-to-pdf'
    return 'none'
  }
  if (cat === 'audio' || cat === 'video') return 'media'
  return 'none'
}
