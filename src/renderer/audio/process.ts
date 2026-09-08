import { loadFfmpeg } from '../convert/media'

export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'flac' | 'ogg'

/** Globale Ausgabe-Einstellungen (Zuschnitt liegt pro Spur). */
export interface AudioEdit {
  gainDb: number
  normalize: boolean
  fadeIn: number
  fadeOut: number
  tempo: number
  mono: boolean
  sampleRate: number | null
  format: AudioFormat
  bitrate: number
  title: string
  artist: string
}

export const DEFAULT_EDIT: AudioEdit = {
  gainDb: 0,
  normalize: false,
  fadeIn: 0,
  fadeOut: 0,
  tempo: 1,
  mono: false,
  sampleRate: null,
  format: 'mp3',
  bitrate: 192,
  title: '',
  artist: ''
}

export interface TrackInput {
  ext: string
  bytes: Uint8Array
  /** Zuschnitt in Sekunden. */
  start: number
  end: number | null
}

const CODEC: Record<AudioFormat, (br: number) => string[]> = {
  mp3: (br) => ['-c:a', 'libmp3lame', '-b:a', `${br}k`],
  m4a: (br) => ['-c:a', 'aac', '-b:a', `${br}k`],
  ogg: (br) => ['-c:a', 'libvorbis', '-b:a', `${br}k`],
  wav: () => ['-c:a', 'pcm_s16le'],
  flac: () => ['-c:a', 'flac']
}

/** Zerlegt einen atempo-Faktor in Teilschritte im gültigen Bereich [0.5, 2]. */
function atempoChain(tempo: number): string[] {
  const parts: string[] = []
  let t = tempo
  while (t > 2) {
    parts.push('atempo=2')
    t /= 2
  }
  while (t < 0.5) {
    parts.push('atempo=0.5')
    t /= 0.5
  }
  if (Math.abs(t - 1) > 1e-3) parts.push(`atempo=${t.toFixed(4)}`)
  return parts
}

/** Baut die `-filter_complex`-Kette: pro Spur zuschneiden, alle aneinanderhängen, dann global. */
export function buildConcatArgs(
  tracks: { start: number; end: number | null }[],
  outName: string,
  e: AudioEdit
): string[] {
  const n = Math.max(1, tracks.length)
  const sr = e.sampleRate ?? 44100
  const segs: string[] = []
  const labels: string[] = []
  tracks.forEach((t, i) => {
    let trim = `atrim=start=${Math.max(0, t.start).toFixed(3)}`
    if (t.end != null) trim += `:end=${t.end.toFixed(3)}`
    segs.push(
      `[${i}:a]${trim},asetpts=PTS-STARTPTS,aresample=${sr},aformat=sample_fmts=fltp:channel_layouts=stereo[s${i}]`
    )
    labels.push(`[s${i}]`)
  })

  const post: string[] = []
  post.push(...atempoChain(e.tempo))
  if (Math.abs(e.gainDb) > 0.01) post.push(`volume=${e.gainDb}dB`)
  if (e.fadeIn > 0) post.push(`afade=t=in:st=0:d=${e.fadeIn}`)
  if (e.fadeOut > 0) post.push('areverse', `afade=t=in:st=0:d=${e.fadeOut}`, 'areverse')
  if (e.normalize) post.push('loudnorm=I=-16:TP=-1.5:LRA=11')

  const filter = [
    ...segs,
    `${labels.join('')}concat=n=${n}:v=0:a=1[cc]`,
    `[cc]${post.length ? post.join(',') : 'anull'}[out]`
  ].join(';')

  const args = ['-filter_complex', filter, '-map', '[out]']
  if (e.mono) args.push('-ac', '1')
  args.push(...CODEC[e.format](e.bitrate))
  if (e.title) args.push('-metadata', `title=${e.title}`)
  if (e.artist) args.push('-metadata', `artist=${e.artist}`)
  args.push('-y', outName)
  return args
}

export async function processTracks(
  tracks: TrackInput[],
  edit: AudioEdit,
  cb: { onProgress?: (r: number) => void; onStatus?: (t: string) => void } = {}
): Promise<Uint8Array> {
  if (tracks.length === 0) throw new Error('Keine Spuren')
  const ff = await loadFfmpeg(cb.onStatus)
  const inNames = tracks.map((t, i) => `in${i}.${t.ext || 'bin'}`)
  const outName = `out.${edit.format}`
  const onProg = ({ progress }: { progress: number }): void => {
    if (progress >= 0 && progress <= 1) cb.onProgress?.(progress)
  }
  ff.on('progress', onProg)
  try {
    // Kopie schreiben – ff.writeFile überträgt (detached) den Buffer in den Worker,
    // die Original-Bytes bleiben so für weitere Durchläufe erhalten.
    for (let i = 0; i < tracks.length; i++) await ff.writeFile(inNames[i], tracks[i].bytes.slice())
    cb.onStatus?.(tracks.length > 1 ? 'Spuren werden verbunden …' : 'Wird verarbeitet …')
    const inputArgs = inNames.flatMap((n) => ['-i', n])
    const code = await ff.exec([
      ...inputArgs,
      ...buildConcatArgs(
        tracks.map((t) => ({ start: t.start, end: t.end })),
        outName,
        edit
      )
    ])
    if (code !== 0) throw new Error(`FFmpeg-Fehler (Code ${code})`)
    const out = (await ff.readFile(outName)) as Uint8Array
    return out instanceof Uint8Array ? out : new Uint8Array()
  } finally {
    ff.off('progress', onProg)
    for (const n of inNames) ff.deleteFile(n).catch(() => undefined)
    ff.deleteFile(outName).catch(() => undefined)
  }
}
