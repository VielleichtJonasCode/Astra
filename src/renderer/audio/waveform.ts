export interface DecodedAudio {
  peaks: Float32Array
  duration: number
  sampleRate: number
  channels: number
}

/**
 * Dekodiert Audio-Bytes und liefert Amplituden-Spitzen pro Pixel-Bucket
 * für die Wellenform-Darstellung.
 */
export async function decodeAudio(bytes: Uint8Array, buckets = 1600): Promise<DecodedAudio> {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    const copy = bytes.slice().buffer
    const buf = await ctx.decodeAudioData(copy)
    const chans: Float32Array[] = []
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c))
    const n = buf.length
    const per = Math.max(1, Math.floor(n / buckets))
    const peaks = new Float32Array(buckets)
    for (let b = 0; b < buckets; b++) {
      const start = b * per
      let peak = 0
      for (let i = 0; i < per && start + i < n; i++) {
        for (const ch of chans) {
          const v = Math.abs(ch[start + i])
          if (v > peak) peak = v
        }
      }
      peaks[b] = peak
    }
    return {
      peaks,
      duration: buf.duration,
      sampleRate: buf.sampleRate,
      channels: buf.numberOfChannels
    }
  } finally {
    void ctx.close()
  }
}

export function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
