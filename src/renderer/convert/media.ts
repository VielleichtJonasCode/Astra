import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
const logTail: string[] = []

/** Basis-URL der gebündelten FFmpeg-Assets. Dev: Vite-Server; Paket: eigenes Schema. */
const ASSET_BASE = location.protocol.startsWith('http')
  ? new URL('ffmpeg/', location.href).href
  : 'astra-asset://app/ffmpeg/'

/** FFmpeg-WASM lazy laden (Core + WASM aus dem lokalen public-Ordner). */
export async function loadFfmpeg(onProgressText?: (t: string) => void): Promise<FFmpeg> {
  if (instance) return instance
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg()
      ff.on('log', ({ message }) => {
        logTail.push(message)
        if (logTail.length > 40) logTail.shift()
      })
      onProgressText?.('FFmpeg wird geladen …')
      await ff.load({
        coreURL: await toBlobURL(`${ASSET_BASE}ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${ASSET_BASE}ffmpeg-core.wasm`, 'application/wasm')
      })
      instance = ff
      return ff
    })()
  }
  return loading
}

const AUDIO_ARGS: Record<string, string[]> = {
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  aac: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  flac: ['-vn', '-c:a', 'flac'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '128k']
}
const VIDEO_ARGS: Record<string, string[]> = {
  mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k'],
  mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k'],
  mkv: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k'],
  webm: ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-c:a', 'libopus'],
  avi: ['-c:v', 'mpeg4', '-qscale:v', '5', '-c:a', 'libmp3lame', '-q:a', '4']
}

export async function convertMedia(
  bytes: Uint8Array,
  srcExt: string,
  targetExt: string,
  cb: { onProgress?: (ratio: number) => void; onStatus?: (t: string) => void } = {}
): Promise<Uint8Array> {
  const ff = await loadFfmpeg(cb.onStatus)
  const t = targetExt.toLowerCase()
  const inName = `in.${srcExt || 'bin'}`
  const outName = `out.${t}`

  const onProg = ({ progress }: { progress: number }): void => {
    if (progress >= 0 && progress <= 1) cb.onProgress?.(progress)
  }
  ff.on('progress', onProg)

  try {
    await ff.writeFile(inName, bytes)
    cb.onStatus?.('Konvertiere …')

    let args: string[]
    if (t === 'gif') {
      args = ['-i', inName, '-vf', 'fps=12,scale=480:-1:flags=lanczos', '-loop', '0', outName]
    } else if (AUDIO_ARGS[t]) {
      args = ['-i', inName, ...AUDIO_ARGS[t], outName]
    } else if (VIDEO_ARGS[t]) {
      args = ['-i', inName, ...VIDEO_ARGS[t], outName]
    } else {
      args = ['-i', inName, outName]
    }

    const code = await ff.exec(args)
    if (code !== 0) {
      throw new Error(`FFmpeg-Fehler (Code ${code}). ${logTail.slice(-4).join(' ')}`)
    }
    const data = (await ff.readFile(outName)) as Uint8Array
    return data instanceof Uint8Array ? data : new Uint8Array()
  } finally {
    ff.off('progress', onProg)
    ff.deleteFile(inName).catch(() => undefined)
    ff.deleteFile(outName).catch(() => undefined)
  }
}
