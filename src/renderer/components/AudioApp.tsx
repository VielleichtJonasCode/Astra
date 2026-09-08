import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { Segmented, Select, TextInput, Toggle } from './common/controls'
import { Field, FieldGroup } from './common/Field'
import { toast } from './common/toast'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import { decodeAudio, formatTime, type DecodedAudio } from '../audio/waveform'
import {
  DEFAULT_EDIT,
  buildConcatArgs,
  processTracks,
  type AudioEdit,
  type AudioFormat
} from '../audio/process'
import './audioapp.css'

interface Track {
  id: string
  name: string
  ext: string
  bytes: Uint8Array
  url: string
  decoded: DecodedAudio | null
  start: number
  end: number | null
  merging?: boolean
}

interface Snapshot {
  tracks: Track[]
  edit: AudioEdit
}

const LOSSY = new Set<AudioFormat>(['mp3', 'm4a', 'ogg'])
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|opus|aif|aiff|wma)$/i
let audioHashConsumed = false

function extOf(name: string): string {
  return AUDIO_EXT.exec(name)?.[1]?.toLowerCase() ?? 'mp3'
}
function guessFmt(ext: string): AudioFormat {
  const e = ext.toLowerCase()
  if (e === 'wav') return 'wav'
  if (e === 'flac') return 'flac'
  if (e === 'm4a' || e === 'aac') return 'm4a'
  if (e === 'ogg' || e === 'opus') return 'ogg'
  return 'mp3'
}
const stem = (n: string): string => n.replace(/\.[a-z0-9]+$/i, '')

async function runAudioSelfTest(path: string): Promise<void> {
  try {
    const args = buildConcatArgs(
      [
        { start: 0.5, end: 2 },
        { start: 0, end: 1 }
      ],
      'out.mp3',
      { ...DEFAULT_EDIT, gainDb: 3, fadeOut: 0.3, tempo: 1.25 }
    )
    const s = args.join(' ')
    const argsOk =
      s.includes('concat=n=2:v=0:a=1') &&
      s.includes('atrim=start=0.500:end=2.000') &&
      s.includes('atempo=1.25') &&
      s.includes('volume=3dB') &&
      s.includes('areverse')
    const f = await window.api.readFile(path)
    const out = await processTracks(
      [
        { ext: 'm4a', bytes: f.bytes, start: 0, end: 1.5 },
        { ext: 'm4a', bytes: f.bytes, start: 1, end: 2.5 }
      ],
      { ...DEFAULT_EDIT, format: 'mp3', gainDb: 1 }
    )
    const dec = await decodeAudio(out)
    const runOk = out.length > 800 && dec.duration > 2.4 && dec.duration < 3.6
    console.log(
      argsOk && runOk
        ? 'AUDIOTEST OK'
        : `AUDIOTEST FAIL args=${argsOk} run=${runOk} dur=${dec.duration.toFixed(2)}`
    )
  } catch (e) {
    console.log(`AUDIOTEST FAIL ${e instanceof Error ? e.message : e}`)
  }
}

export function AudioApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [tracks, setTracks] = useState<Track[]>([])
  const [edit, setEdit] = useState<AudioEdit>(DEFAULT_EDIT)
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [head, setHead] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [over, setOver] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const coalesceRef = useRef(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const sel = tracks.find((t) => t.id === selId) ?? null

  const pushHistory = (key = ''): void => {
    const now = Date.now()
    if (key && key === String(coalesceRef.current) && now - coalesceRef.current < 700) return
    coalesceRef.current = key ? now : 0
    setPast((p) => [...p.slice(-40), { tracks, edit }])
    setFuture([])
  }
  const undo = (): void => {
    setPast((p) => {
      if (!p.length) return p
      setFuture((f) => [{ tracks, edit }, ...f].slice(0, 40))
      const s = p[p.length - 1]
      setTracks(s.tracks)
      setEdit(s.edit)
      setPlaying(false)
      return p.slice(0, -1)
    })
  }
  const redo = (): void => {
    setFuture((f) => {
      if (!f.length) return f
      setPast((p) => [...p, { tracks, edit }])
      const s = f[0]
      setTracks(s.tracks)
      setEdit(s.edit)
      setPlaying(false)
      return f.slice(1)
    })
  }
  const patch = (p: Partial<AudioEdit>, key?: string): void => {
    if (key !== undefined) pushHistory(key)
    setEdit((e) => ({ ...e, ...p }))
  }

  const addTrack = async (name: string, bytes: Uint8Array): Promise<void> => {
    setErr(null)
    const id = nanoid(8)
    const ext = extOf(name)
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer]))
    pushHistory()
    setTracks((cur) => {
      if (cur.length === 0) setEdit((e) => ({ ...e, format: guessFmt(ext) }))
      return [...cur, { id, name, ext, bytes, url, decoded: null, start: 0, end: null }]
    })
    setSelId((cur) => cur ?? id)
    try {
      const decoded = await decodeAudio(bytes)
      setTracks((cur) =>
        cur.map((t) => (t.id === id ? { ...t, decoded, end: decoded.duration } : t))
      )
    } catch {
      setErr(`„${name}" konnte nicht gelesen werden.`)
      setTracks((cur) => cur.filter((t) => t.id !== id))
    }
  }

  const pick = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked) return
    for (const p of picked) {
      const f = await window.api.readFile(p.path)
      await addTrack(f.name, f.bytes)
    }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const f = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.type.startsWith('audio/'))
        ?.getAsFile()
      if (f) f.arrayBuffer().then((ab) => addTrack(f.name || 'audio', new Uint8Array(ab)))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const p = /[#&]aud=([^&]+)/.exec(location.hash)?.[1]
    if (p && !audioHashConsumed) {
      audioHashConsumed = true
      const paths = decodeURIComponent(p).split('|')
      void (async () => {
        for (const one of paths) {
          try {
            const f = await window.api.readFile(one)
            await addTrack(f.name, f.bytes)
          } catch {
            /* ignore */
          }
        }
      })()
      if (/[#&]audiotest=1/.test(location.hash)) void runAudioSelfTest(paths[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = edit.tempo
  }, [edit.tempo])

  useEffect(() => {
    if (!playing || !sel) return
    let raf = 0
    const tick = (): void => {
      const a = audioRef.current
      if (a) {
        setHead(a.currentTime)
        if (sel.end != null && a.currentTime >= sel.end) {
          a.pause()
          setPlaying(false)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, sel])

  const playSel = (): void => {
    const a = audioRef.current
    if (!a || !sel) return
    if (playing) {
      a.pause()
      setPlaying(false)
      return
    }
    if (a.currentTime < sel.start || (sel.end != null && a.currentTime >= sel.end))
      a.currentTime = sel.start
    void a.play()
    setPlaying(true)
  }

  const trimStart = (): void => pushHistory('trim')
  const trimTrack = (id: string, start: number, end: number): void =>
    setTracks((cur) => cur.map((t) => (t.id === id ? { ...t, start, end } : t)))

  const removeTrack = (id: string): void => {
    pushHistory()
    setTracks((cur) => {
      const t = cur.find((x) => x.id === id)
      if (t) URL.revokeObjectURL(t.url)
      return cur.filter((x) => x.id !== id)
    })
    if (selId === id) {
      setPlaying(false)
      setSelId(tracks.find((t) => t.id !== id)?.id ?? null)
    }
  }

  const mergeTwo = async (aId: string, bId: string): Promise<void> => {
    const a = tracks.find((t) => t.id === aId)
    const b = tracks.find((t) => t.id === bId)
    if (!a || !b || a.merging || b.merging) return
    pushHistory()
    setTracks((cur) => cur.map((t) => (t.id === aId || t.id === bId ? { ...t, merging: true } : t)))
    try {
      const out = await processTracks(
        [
          { ext: a.ext, bytes: a.bytes, start: a.start, end: a.end },
          { ext: b.ext, bytes: b.bytes, start: b.start, end: b.end }
        ],
        { ...DEFAULT_EDIT, format: 'wav' },
        { onStatus: setStatus }
      )
      const decoded = await decodeAudio(out)
      const merged: Track = {
        id: nanoid(8),
        name: `${stem(a.name)} + ${stem(b.name)}`,
        ext: 'wav',
        bytes: out,
        url: URL.createObjectURL(new Blob([out.slice().buffer])),
        decoded,
        start: 0,
        end: decoded.duration
      }
      setTracks((cur) => {
        const idx = Math.min(
          cur.findIndex((t) => t.id === aId),
          cur.findIndex((t) => t.id === bId)
        )
        const rest = cur.filter((t) => t.id !== aId && t.id !== bId)
        rest.splice(idx, 0, merged)
        return rest
      })
      URL.revokeObjectURL(a.url)
      URL.revokeObjectURL(b.url)
      setSelId(merged.id)
      toast.success('Spuren verschmolzen.')
    } catch (e) {
      setTracks((cur) => cur.map((t) => ({ ...t, merging: false })))
      toast.error(`Verschmelzen fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannt'}`)
    }
  }

  const onDragOver = ({ active, over: o }: DragOverEvent): void => {
    if (!o || active.id === o.id) {
      setMergeTarget(null)
      return
    }
    const ar = active.rect.current.translated
    if (!ar) return
    const near =
      Math.abs(ar.top + ar.height / 2 - (o.rect.top + o.rect.height / 2)) < o.rect.height * 0.34
    setMergeTarget(near ? String(o.id) : null)
  }
  const onDragEnd = ({ active, over: o }: DragEndEvent): void => {
    const mt = mergeTarget
    setMergeTarget(null)
    if (!o || active.id === o.id) return
    if (mt && mt === String(o.id)) {
      void mergeTwo(String(active.id), mt)
      return
    }
    pushHistory()
    setTracks((cur) => {
      const from = cur.findIndex((t) => t.id === active.id)
      const to = cur.findIndex((t) => t.id === o.id)
      return from < 0 || to < 0 ? cur : arrayMove(cur, from, to)
    })
  }

  const totalDur = tracks.reduce(
    (s, t) => s + Math.max(0, (t.end ?? t.decoded?.duration ?? 0) - t.start),
    0
  )
  const anyMerging = tracks.some((t) => t.merging)

  const save = async (): Promise<void> => {
    if (tracks.length === 0) return
    setBusy(true)
    setProgress(0)
    setStatus('FFmpeg wird geladen …')
    try {
      const out = await processTracks(
        tracks.map((t) => ({ ext: t.ext, bytes: t.bytes, start: t.start, end: t.end })),
        edit,
        { onProgress: setProgress, onStatus: setStatus }
      )
      const base = tracks.length > 1 ? 'spuren' : stem(tracks[0].name)
      const path = await window.api.saveDialog({
        defaultName: `${base}-${tracks.length > 1 ? 'verbunden' : 'bearbeitet'}.${edit.format}`,
        filters: [{ name: edit.format.toUpperCase(), extensions: [edit.format] }]
      })
      if (path) {
        await window.api.writeFile(path, out)
        toast.success(`Gesichert (${(out.length / 1024 / 1024).toFixed(1)} MB).`, {
          label: 'Zeigen',
          run: () => window.api.showItemInFolder(path)
        })
      }
    } catch (e) {
      toast.error(`Verarbeitung fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannt'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="aud"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void (async () => {
          for (const f of Array.from(e.dataTransfer.files)) {
            await addTrack(f.name, new Uint8Array(await f.arrayBuffer()))
          }
        })()
      }}
    >
      <div className="aud__glow" aria-hidden />
      <header className="aud__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="aud__title">Audio-Editor</div>
        <div className="aud__headact no-drag">
          <IconButton name="undo" label="Rückgängig" disabled={!past.length} onClick={undo} />
          <IconButton name="redo" label="Wiederholen" disabled={!future.length} onClick={redo} />
        </div>
      </header>

      <audio
        ref={audioRef}
        src={sel?.url}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = edit.tempo
          if (sel) e.currentTarget.currentTime = sel.start
        }}
        hidden
      />

      {tracks.length === 0 ? (
        <div className="aud__scroll">
          <div className={cx('aud__drop', over && 'is-over')}>
            <div className="aud__dropicon">
              <Icon name="droplet" size={34} />
            </div>
            <div className="aud__droptitle">Audiodateien hierher ziehen</div>
            <div className="aud__dropsub">
              MP3 · WAV · M4A · AAC · FLAC · OGG — mehrere Dateien werden zu einer Spurliste
            </div>
            {err && <div className="aud__droperr">{err}</div>}
            <Button variant="primary" icon="droplet" onClick={() => void pick()}>
              Dateien wählen …
            </Button>
          </div>
        </div>
      ) : (
        <div className="aud__work">
          <div className="aud__stage">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={() => setMergeTarget(null)}
            >
              <SortableContext
                items={tracks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="aud__tracks">
                  {tracks.map((t, i) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      index={i + 1}
                      selected={t.id === selId}
                      mergeTarget={mergeTarget === t.id}
                      head={playing && t.id === selId ? head : null}
                      playing={playing && t.id === selId}
                      onSelect={() => {
                        setSelId(t.id)
                        setPlaying(false)
                      }}
                      onTrimStart={trimStart}
                      onTrim={(s2, e2) => trimTrack(t.id, s2, e2)}
                      onSeek={(time) => {
                        setSelId(t.id)
                        if (audioRef.current) {
                          audioRef.current.currentTime = time
                          setHead(time)
                        }
                      }}
                      onPreview={() => {
                        if (t.id !== selId) {
                          setSelId(t.id)
                          setPlaying(false)
                        } else playSel()
                      }}
                      onRemove={() => removeTrack(t.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="aud__tracksfoot">
              <Button icon="plus" onClick={() => void pick()}>
                Spur hinzufügen
              </Button>
              <div className="aud__spacer" />
              <span className="aud__total">
                Gesamt <strong>{formatTime(totalDur)}</strong>
                {tracks.length > 1 && ` · ${tracks.length} Spuren`}
              </span>
            </div>
            <p className="aud__tip">
              Ränder der Wellenform ziehen zum Kürzen · eine Spur auf eine andere ziehen zum
              Verschmelzen
            </p>
            {err && <div className="aud__droperr">{err}</div>}
          </div>

          <aside className="aud__side">
            <FieldGroup title="Klang (gesamte Ausgabe)">
              <Field label={`Lautstärke ${edit.gainDb > 0 ? '+' : ''}${edit.gainDb} dB`}>
                <input
                  type="range"
                  className="slider"
                  min={-30}
                  max={30}
                  step={1}
                  value={edit.gainDb}
                  onPointerDown={() => pushHistory('gain')}
                  onChange={(e) => patch({ gainDb: Number(e.target.value) })}
                />
              </Field>
              <Field label="Normalisieren" hint="gleichmäßige Lautheit (EBU R128)">
                <Toggle
                  checked={edit.normalize}
                  onChange={(normalize) => patch({ normalize }, 'norm')}
                />
              </Field>
              <Field label={`Einblenden ${edit.fadeIn.toFixed(1)} s`}>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={10}
                  step={0.5}
                  value={edit.fadeIn}
                  onPointerDown={() => pushHistory('fin')}
                  onChange={(e) => patch({ fadeIn: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Ausblenden ${edit.fadeOut.toFixed(1)} s`}>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={10}
                  step={0.5}
                  value={edit.fadeOut}
                  onPointerDown={() => pushHistory('fout')}
                  onChange={(e) => patch({ fadeOut: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Tempo ${edit.tempo.toFixed(2)}×`}>
                <input
                  type="range"
                  className="slider"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={edit.tempo}
                  onPointerDown={() => pushHistory('tempo')}
                  onChange={(e) => patch({ tempo: Number(e.target.value) })}
                />
              </Field>
              <Field label="Kanäle">
                <Segmented
                  value={edit.mono ? 'mono' : 'stereo'}
                  onChange={(v) => patch({ mono: v === 'mono' }, 'chan')}
                  options={[
                    { value: 'stereo', label: 'Stereo' },
                    { value: 'mono', label: 'Mono' }
                  ]}
                />
              </Field>
              <Field label="Abtastrate">
                <Select
                  value={edit.sampleRate ? String(edit.sampleRate) : 'orig'}
                  onChange={(e) =>
                    patch(
                      { sampleRate: e.target.value === 'orig' ? null : Number(e.target.value) },
                      'sr'
                    )
                  }
                  options={[
                    { value: 'orig', label: 'Standard (44,1 kHz)' },
                    { value: '48000', label: '48 000 Hz' },
                    { value: '32000', label: '32 000 Hz' },
                    { value: '22050', label: '22 050 Hz' }
                  ]}
                />
              </Field>
            </FieldGroup>

            <FieldGroup title="Ausgabe">
              <Field label="Format">
                <Select
                  value={edit.format}
                  onChange={(e) => patch({ format: e.target.value as AudioFormat }, 'fmt')}
                  options={[
                    { value: 'mp3', label: 'MP3' },
                    { value: 'm4a', label: 'M4A / AAC' },
                    { value: 'ogg', label: 'OGG Vorbis' },
                    { value: 'wav', label: 'WAV (unkomprimiert)' },
                    { value: 'flac', label: 'FLAC (verlustfrei)' }
                  ]}
                />
              </Field>
              {LOSSY.has(edit.format) && (
                <Field label={`Bitrate ${edit.bitrate} kbit/s`}>
                  <input
                    type="range"
                    className="slider"
                    min={64}
                    max={320}
                    step={16}
                    value={edit.bitrate}
                    onPointerDown={() => pushHistory('br')}
                    onChange={(e) => patch({ bitrate: Number(e.target.value) })}
                  />
                </Field>
              )}
              <Field label="Titel">
                <TextInput
                  value={edit.title}
                  onFocus={() => pushHistory('title')}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </Field>
              <Field label="Interpret">
                <TextInput
                  value={edit.artist}
                  onFocus={() => pushHistory('artist')}
                  onChange={(e) => patch({ artist: e.target.value })}
                />
              </Field>
            </FieldGroup>

            {(busy || anyMerging) && (
              <div className="aud__progress">
                <div className="aud__progressbar">
                  <span style={{ width: busy ? `${Math.round(progress * 100)}%` : '100%' }} />
                </div>
                <span>{status || 'Spuren werden verschmolzen …'}</span>
              </div>
            )}

            <Button
              block
              variant="primary"
              icon="download"
              disabled={busy || anyMerging}
              onClick={() => void save()}
            >
              {tracks.length > 1 ? 'Verbinden & speichern' : 'Anwenden & speichern'}
            </Button>
          </aside>
        </div>
      )}
    </div>
  )
}

/* ==================== Spur-Zeile ==================== */

function TrackRow({
  track,
  index,
  selected,
  mergeTarget,
  head,
  playing,
  onSelect,
  onTrimStart,
  onTrim,
  onSeek,
  onPreview,
  onRemove
}: {
  track: Track
  index: number
  selected: boolean
  mergeTarget: boolean
  head: number | null
  playing: boolean
  onSelect: () => void
  onTrimStart: () => void
  onTrim: (start: number, end: number) => void
  onSeek: (t: number) => void
  onPreview: () => void
  onRemove: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [w, setW] = useState(600)
  const H = 62
  const dur = track.decoded?.duration ?? 0
  const start = track.start
  const end = track.end ?? dur

  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [el])

  useEffect(() => {
    const cv = canvasRef.current
    const d = track.decoded
    if (!cv || !d) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = w * dpr
    cv.height = H * dpr
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, H)
    const mid = H / 2
    const cs = getComputedStyle(cv)
    const accent = cs.getPropertyValue('--accent').trim() || '#bf5af2'
    const dim = cs.getPropertyValue('--text-tertiary').trim() || '#888'
    for (let x = 0; x < w; x++) {
      const p = d.peaks[Math.floor((x / w) * d.peaks.length)] ?? 0
      const h = Math.max(1, p * (mid - 3))
      const t = (x / w) * dur
      const inRange = t >= start && t <= end
      ctx.strokeStyle = inRange ? accent : dim
      ctx.globalAlpha = inRange ? 0.9 : 0.22
      ctx.beginPath()
      ctx.moveTo(x + 0.5, mid - h)
      ctx.lineTo(x + 0.5, mid + h)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    if (head != null && dur > 0) {
      const px = (head / dur) * w
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, H)
      ctx.stroke()
    }
  }, [track.decoded, w, start, end, dur, head])

  const drag = useRef<'start' | 'end' | null>(null)
  const toTime = (clientX: number): number => {
    const r = canvasRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur))
  }
  const onDown = (e: React.PointerEvent): void => {
    if (!track.decoded) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    onSelect()
    const t = toTime(e.clientX)
    const pxPer = w / (dur || 1)
    if (Math.abs((t - start) * pxPer) < 14) {
      drag.current = 'start'
      onTrimStart()
    } else if (Math.abs((t - end) * pxPer) < 14) {
      drag.current = 'end'
      onTrimStart()
    } else {
      drag.current = null
      onSeek(t)
    }
  }
  const onMove = (e: React.PointerEvent): void => {
    if (!drag.current) return
    const t = toTime(e.clientX)
    if (drag.current === 'start') onTrim(Math.min(t, end - 0.1), end)
    else onTrim(start, Math.max(t, start + 0.1))
  }
  const onUp = (): void => {
    drag.current = null
  }

  const pct = (t: number): number => (dur > 0 ? (t / dur) * 100 : 0)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
      }}
      className={cx(
        'audtrack',
        selected && 'is-selected',
        mergeTarget && 'is-mergetarget',
        track.merging && 'is-merging'
      )}
      onClick={onSelect}
    >
      <div className="audtrack__side">
        <span className="audtrack__num">{index}</span>
        <button
          className="audtrack__grip"
          {...attributes}
          {...listeners}
          title="Ziehen: sortieren · auf eine andere Spur: verschmelzen"
        >
          <Icon name="grip" size={15} />
        </button>
      </div>

      <div className="audtrack__main">
        <div className="audtrack__head">
          <button
            className="audtrack__play"
            onClick={(e) => {
              e.stopPropagation()
              onPreview()
            }}
            disabled={!track.decoded || track.merging}
          >
            <Icon name={playing ? 'pause' : 'play'} size={13} />
          </button>
          <span className="audtrack__name">{track.name}</span>
          <span className="audtrack__dur">
            {track.merging
              ? 'verschmilzt …'
              : track.decoded
                ? formatTime(Math.max(0, end - start))
                : 'lädt …'}
          </span>
          <button
            className="audtrack__x"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            title="Spur entfernen"
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        <div className="audtrack__wavewrap" ref={setEl}>
          {track.decoded ? (
            <>
              <canvas
                ref={canvasRef}
                className="audtrack__wave"
                style={{ width: w, height: H }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
              <div
                className="audtrack__mask audtrack__mask--l"
                style={{ width: `${pct(start)}%` }}
              />
              <div
                className="audtrack__mask audtrack__mask--r"
                style={{ width: `${100 - pct(end)}%` }}
              />
              <div className="audtrack__handle" style={{ left: `${pct(start)}%` }} />
              <div className="audtrack__handle" style={{ left: `${pct(end)}%` }} />
            </>
          ) : (
            <div className="audtrack__loading">Wellenform …</div>
          )}
        </div>
      </div>
    </div>
  )
}
