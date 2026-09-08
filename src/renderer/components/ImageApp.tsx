import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShellStore } from '../store/shellStore'
import { useImageStore } from '../store/imageStore'
import {
  ADJUST_PRESETS,
  NEUTRAL_ADJUST,
  isNeutralAdjust,
  makeBoxAnno,
  type Adjust,
  type ImgTool
} from '../image/model'
import { canvasToBytes } from '../image/transform'
import { Icon, type IconName } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { Popover } from './common/Popover'
import { Segmented } from './common/controls'
import { ColorWell } from './common/ColorWell'
import { Divider } from './common/Field'
import { toast } from './common/toast'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import { ImageCanvas } from './ImageCanvas'
import './imageapp.css'

const TOOLS: { id: ImgTool; icon: IconName; label: string }[] = [
  { id: 'select', icon: 'cursor', label: 'Auswählen (V)' },
  { id: 'crop', icon: 'crop', label: 'Zuschneiden' },
  { id: 'text', icon: 'text', label: 'Text (T)' },
  { id: 'redact', icon: 'redact', label: 'Schwärzen (B)' },
  { id: 'pixelate', icon: 'grid', label: 'Verpixeln' },
  { id: 'blur', icon: 'droplet', label: 'Weichzeichnen' },
  { id: 'draw', icon: 'pen', label: 'Zeichnen (D)' },
  { id: 'highlight', icon: 'highlighter', label: 'Hervorheben (H)' },
  { id: 'step', icon: 'hash', label: 'Nummer-Marke' }
]
const SHAPES: { id: ImgTool; icon: IconName; label: string }[] = [
  { id: 'rect', icon: 'square', label: 'Rechteck' },
  { id: 'ellipse', icon: 'circle', label: 'Ellipse' },
  { id: 'line', icon: 'line', label: 'Linie' },
  { id: 'arrow', icon: 'arrow-up-right', label: 'Pfeil' }
]
const SHAPE_IDS = new Set<ImgTool>(['rect', 'ellipse', 'line', 'arrow'])

function baseName(n: string): string {
  return n.replace(/\.[a-z0-9]+$/i, '')
}

let imgTestRan = false

export function ImageApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const base = useImageStore((s) => s.base)
  const loading = useImageStore((s) => s.loading)
  const error = useImageStore((s) => s.error)
  const load = useImageStore((s) => s.load)
  const [over, setOver] = useState(false)

  const openFiles = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked?.[0]) return
    const f = await window.api.readFile(picked[0].path)
    void load(f.name, f.bytes)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file)
        file.arrayBuffer().then((ab) => load(file.name || 'einfügen.png', new Uint8Array(ab)))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [load])

  // Dev: #img=<pfad> lädt direkt ein Bild (nur für Screenshots/Tests).
  useEffect(() => {
    const p = /[#&]img=([^&]+)/.exec(location.hash)?.[1]
    if (!p) return
    const path = decodeURIComponent(p)
    window.api
      .readFile(path)
      .then((f) => load(f.name, f.bytes))
      .catch(() => undefined)
  }, [load])

  // Dev-Demo: #imgdemo=1 – ein paar Annotationen platzieren (nur Screenshots).
  useEffect(() => {
    if (!/[#&]imgdemo=1/.test(location.hash) || imgTestRan) return
    imgTestRan = true
    void (async () => {
      const g = useImageStore.getState
      for (let i = 0; i < 60 && !g().base; i++) await new Promise((r) => setTimeout(r, 100))
      const b = g().base
      if (!b) return
      const cx = { color: '#ff3b30', strokeWidth: 6, fontSize: 44, strength: 20 }
      const W = b.width
      g().addAnno(makeBoxAnno('redact', W * 0.05, W * 0.05, W * 0.28, W * 0.09, { ...cx }))
      g().addAnno(makeBoxAnno('pixelate', W * 0.05, W * 0.18, W * 0.24, W * 0.16, { ...cx }))
      g().addAnno(makeBoxAnno('blur', W * 0.34, W * 0.18, W * 0.22, W * 0.16, { ...cx }))
      g().addAnno(makeBoxAnno('rect', W * 0.6, W * 0.45, W * 0.3, W * 0.2, { ...cx }))
      g().select(null)
    })()
  }, [])

  // Dev-Selbsttest: #imgtest=1
  useEffect(() => {
    if (!/[#&]imgtest=1/.test(location.hash) || imgTestRan) return
    imgTestRan = true
    void (async () => {
      const g = useImageStore.getState
      for (let i = 0; i < 60 && !g().base; i++) await new Promise((r) => setTimeout(r, 100))
      const b0 = g().base
      if (!b0) return console.log('IMGTEST FAIL: kein Bild')
      const iw = b0.width
      const ih = b0.height
      const ctx = { color: '#000', strokeWidth: 4, fontSize: 40, strength: 16 }
      g().addAnno(makeBoxAnno('redact', 10, 10, 120, 80, ctx))
      g().addAnno(makeBoxAnno('pixelate', 150, 10, 120, 80, ctx))
      g().addAnno(makeBoxAnno('blur', 300, 10, 120, 80, ctx))
      const cv1 = g().exportCanvas()
      const blob: Blob | null = await new Promise((res) =>
        cv1 ? cv1.toBlob((x) => res(x), 'image/png') : res(null)
      )
      g().rotate('cw')
      const cv2 = g().exportCanvas()
      const okRot = !!cv2 && cv2.width === ih && cv2.height === iw
      g().undo()
      const okUndo = g().base?.width === iw && g().annos.length === 3
      g().undo()
      g().undo()
      g().undo()
      const okClear = g().annos.length === 0
      const okBytes = !!blob && blob.size > 2000
      console.log(
        okRot && okUndo && okClear && okBytes
          ? 'IMGTEST OK'
          : `IMGTEST FAIL rot=${okRot} undo=${okUndo} clear=${okClear} bytes=${okBytes}`
      )
    })()
  }, [])

  return (
    <div
      className="imged"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file) file.arrayBuffer().then((ab) => load(file.name, new Uint8Array(ab)))
      }}
    >
      <div className="imged__glow" aria-hidden />

      <header className="imged__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="imged__title">Bild-Werkzeug</div>
        <div style={{ width: 92 }} />
      </header>

      {!base ? (
        <div className="imged__scroll">
          <div className={cx('imged__drop', over && 'is-over')}>
            <div className="imged__dropicon">
              <Icon name="image" size={34} />
            </div>
            <div className="imged__droptitle">
              {loading ? 'Bild wird geladen …' : 'Bild hierher ziehen'}
            </div>
            <div className="imged__dropsub">
              PNG · JPEG · WebP · HEIC · TIFF · GIF — oder einfügen (⌘V)
            </div>
            {error && <div className="imged__droperr">{error}</div>}
            <Button variant="primary" icon="image" onClick={() => void openFiles()}>
              Bild wählen …
            </Button>
          </div>
        </div>
      ) : (
        <Editor />
      )}
    </div>
  )
}

/* ==================== Editor ==================== */

function Editor(): JSX.Element {
  const base = useImageStore((s) => s.base)
  const annos = useImageStore((s) => s.annos)
  const adjust = useImageStore((s) => s.adjust)
  const tool = useImageStore((s) => s.tool)
  const color = useImageStore((s) => s.color)
  const strokeWidth = useImageStore((s) => s.strokeWidth)
  const fontSize = useImageStore((s) => s.fontSize)
  const strength = useImageStore((s) => s.strength)
  const selectedId = useImageStore((s) => s.selectedId)
  const pastLen = useImageStore((s) => s.past.length)
  const futureLen = useImageStore((s) => s.future.length)
  const name = useImageStore((s) => s.name)
  // Aktionen sind in zustand stabil – Snapshot genügt.
  const s = useImageStore.getState()

  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [fmt, setFmt] = useState<'png' | 'jpeg' | 'webp'>('png')
  const [quality, setQuality] = useState(0.9)
  const iw = base?.width ?? 0
  const ih = base?.height ?? 0

  const selAnno = useMemo(() => annos.find((a) => a.id === selectedId), [annos, selectedId])
  const shapeCtx = SHAPE_IDS.has(tool) || ['draw', 'highlight', 'redact', 'step'].includes(tool)
  const kind: 'shape' | 'text' | 'pixel' | null = shapeCtx
    ? 'shape'
    : tool === 'text'
      ? 'text'
      : tool === 'pixelate' || tool === 'blur'
        ? 'pixel'
        : selAnno
          ? selAnno.type === 'text'
            ? 'text'
            : selAnno.type === 'pixelate' || selAnno.type === 'blur'
              ? 'pixel'
              : 'shape'
          : null

  const exportRef = useRef<() => void>(() => undefined)

  /* Tastatur */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      const st = useImageStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        exportRef.current()
        return
      }
      if (mod) return
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (st.selectedId) {
          e.preventDefault()
          st.removeAnno(st.selectedId)
        }
      } else if (e.key === 'Escape') {
        st.setTool('select')
        st.select(null)
      } else {
        const map: Record<string, ImgTool> = {
          v: 'select',
          t: 'text',
          b: 'redact',
          d: 'draw',
          h: 'highlight',
          c: 'crop',
          a: 'arrow',
          r: 'rect'
        }
        const next = map[e.key.toLowerCase()]
        if (next) st.setTool(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const flatten = (): HTMLCanvasElement | null => useImageStore.getState().exportCanvas()

  const doExport = async (): Promise<void> => {
    const cv = flatten()
    if (!cv) return
    const mime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg'
    const bytes = await canvasToBytes(cv, mime, quality)
    const path = await window.api.saveDialog({
      defaultName: `${baseName(name ?? 'bild')}.${fmt}`,
      filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }]
    })
    if (!path) return
    await window.api.writeFile(path, bytes)
    toast.success(`Gesichert (${(bytes.length / 1024).toFixed(0)} KB).`, {
      label: 'Zeigen',
      run: () => window.api.showItemInFolder(path)
    })
  }
  exportRef.current = () => void doExport()

  const copyImage = async (): Promise<void> => {
    const cv = flatten()
    if (!cv) return
    try {
      const blob: Blob = await new Promise((res, rej) =>
        cv.toBlob((b) => (b ? res(b) : rej(new Error())), 'image/png')
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('In die Zwischenablage kopiert.')
    } catch {
      toast.error('Kopieren nicht möglich.')
    }
  }

  const stripMeta = async (): Promise<void> => {
    if (!base) return
    const bytes = await canvasToBytes(base, 'image/png', 0.96)
    const path = await window.api.saveDialog({
      defaultName: `${baseName(name ?? 'bild')}-ohne-metadaten.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    if (!path) return
    await window.api.writeFile(path, bytes)
    toast.success('Saubere Kopie ohne Metadaten gesichert.', {
      label: 'Zeigen',
      run: () => window.api.showItemInFolder(path)
    })
  }

  const applyPreset = (patch: Partial<Adjust>): void => {
    s.pushHistory('preset')
    s.setAdjust({ ...NEUTRAL_ADJUST, ...patch })
  }

  return (
    <div className="imged__work">
      {/* Werkzeugleiste */}
      <div className="imged__tools">
        <div className="toolgroup">
          {TOOLS.map((d) => (
            <IconButton
              key={d.id}
              name={d.icon}
              label={d.label}
              active={tool === d.id}
              onClick={() => s.setTool(d.id)}
            />
          ))}
          <Tooltip label="Formen – Rechteck, Ellipse, Linie, Pfeil">
            <Popover
              placement="bottom"
              trigger={
                <button
                  type="button"
                  className={cx('iconbtn', SHAPE_IDS.has(tool) && 'is-active')}
                  aria-label="Formen"
                >
                  <Icon name="shapes" size={17} />
                </button>
              }
            >
              <div style={{ display: 'flex', gap: 2 }}>
                {SHAPES.map((d) => (
                  <IconButton
                    key={d.id}
                    name={d.icon}
                    label={d.label}
                    active={tool === d.id}
                    onClick={() => s.setTool(d.id)}
                  />
                ))}
              </div>
            </Popover>
          </Tooltip>
        </div>

        {kind && (
          <>
            <Divider />
            <div className="toolgroup imged__ctx">
              {(kind === 'shape' || kind === 'text') && (
                <ColorWell value={color} onChange={s.setColor} />
              )}
              {kind === 'shape' && (
                <label className="imged__slider">
                  <Icon name="pen" size={13} />
                  <input
                    type="range"
                    className="slider"
                    min={1}
                    max={24}
                    step={1}
                    value={strokeWidth}
                    onPointerDown={() => s.pushHistory('sw')}
                    onChange={(e) => s.setStrokeWidth(Number(e.target.value))}
                  />
                </label>
              )}
              {kind === 'text' && (
                <label className="imged__slider">
                  <span className="imged__slidercap">A</span>
                  <input
                    type="range"
                    className="slider"
                    min={12}
                    max={200}
                    step={2}
                    value={fontSize}
                    onPointerDown={() => s.pushHistory('fs')}
                    onChange={(e) => s.setFontSize(Number(e.target.value))}
                  />
                </label>
              )}
              {kind === 'pixel' && (
                <label className="imged__slider">
                  <span className="imged__slidercap">Stärke</span>
                  <input
                    type="range"
                    className="slider"
                    min={4}
                    max={60}
                    step={2}
                    value={strength}
                    onPointerDown={() => s.pushHistory('str')}
                    onChange={(e) => s.setStrength(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
          </>
        )}

        <Divider />
        <div className="toolgroup">
          <IconButton name="rotate-ccw" label="Nach links drehen" onClick={() => s.rotate('ccw')} />
          <IconButton name="rotate-cw" label="Nach rechts drehen" onClick={() => s.rotate('cw')} />
          <IconButton name="flip-h" label="Horizontal spiegeln" onClick={() => s.flip('h')} />
          <IconButton name="flip-v" label="Vertikal spiegeln" onClick={() => s.flip('v')} />
        </div>

        <div className="toolbar__spacer" />

        <div className="toolgroup">
          <IconButton name="undo" label="Rückgängig (⌘Z)" disabled={!pastLen} onClick={s.undo} />
          <IconButton
            name="redo"
            label="Wiederholen (⇧⌘Z)"
            disabled={!futureLen}
            onClick={s.redo}
          />
        </div>
        <Divider />
        <Segmented
          value={typeof zoom === 'number' ? 'custom' : 'fit'}
          onChange={(v) => setZoom(v === 'fit' ? 'fit' : 1)}
          options={[
            { value: 'fit', icon: 'fit-page', title: 'Einpassen' },
            { value: 'custom', icon: 'fit-width', title: '100 %' }
          ]}
        />
      </div>

      {/* Hauptbereich */}
      <div className="imged__main">
        <ImageCanvas zoom={zoom} />

        <aside className="imged__side">
          <Section title="Anpassen" icon="sparkles">
            <div className="imged__presets">
              {ADJUST_PRESETS.map((p) => (
                <button key={p.id} className="imged__preset" onClick={() => applyPreset(p.patch)}>
                  {p.label}
                </button>
              ))}
            </div>
            <AdjustSlider
              label="Helligkeit"
              v={adjust.brightness}
              min={0}
              max={200}
              onCommit={() => s.pushHistory('adj')}
              onChange={(brightness) => s.setAdjust({ brightness })}
            />
            <AdjustSlider
              label="Kontrast"
              v={adjust.contrast}
              min={0}
              max={200}
              onCommit={() => s.pushHistory('adj')}
              onChange={(contrast) => s.setAdjust({ contrast })}
            />
            <AdjustSlider
              label="Sättigung"
              v={adjust.saturate}
              min={0}
              max={200}
              onCommit={() => s.pushHistory('adj')}
              onChange={(saturate) => s.setAdjust({ saturate })}
            />
            <AdjustSlider
              label="Graustufen"
              v={adjust.grayscale}
              min={0}
              max={100}
              onCommit={() => s.pushHistory('adj')}
              onChange={(grayscale) => s.setAdjust({ grayscale })}
            />
            <AdjustSlider
              label="Sepia"
              v={adjust.sepia}
              min={0}
              max={100}
              onCommit={() => s.pushHistory('adj')}
              onChange={(sepia) => s.setAdjust({ sepia })}
            />
            <AdjustSlider
              label="Farbton"
              v={adjust.hue}
              min={-180}
              max={180}
              onCommit={() => s.pushHistory('adj')}
              onChange={(hue) => s.setAdjust({ hue })}
            />
            <AdjustSlider
              label="Weichzeichnen"
              v={adjust.blur}
              min={0}
              max={20}
              onCommit={() => s.pushHistory('adj')}
              onChange={(blur) => s.setAdjust({ blur })}
            />
            <button
              className="imged__reset"
              disabled={isNeutralAdjust(adjust)}
              onClick={s.resetAdjust}
            >
              Anpassungen zurücksetzen
            </button>
          </Section>

          <Section title="Größe & Zuschnitt" icon="crop">
            <ResizePanel iw={iw} ih={ih} onResize={s.resize} />
            <p className="imged__hint">
              Zuschneiden über das Werkzeug in der Leiste – Rahmen aufziehen und bestätigen.
            </p>
          </Section>

          <Section title="Metadaten" icon="info">
            <MetaPanel />
            <Button icon="download" onClick={() => void stripMeta()}>
              Saubere Kopie sichern (nur Bild)
            </Button>
          </Section>

          <Section title="Exportieren" icon="download">
            <Segmented
              value={fmt}
              onChange={setFmt}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'webp', label: 'WebP' }
              ]}
            />
            {fmt !== 'png' && (
              <AdjustSlider
                label={`Qualität ${Math.round(quality * 100)} %`}
                v={quality * 100}
                min={30}
                max={100}
                onCommit={() => undefined}
                onChange={(q) => setQuality(q / 100)}
              />
            )}
            <div className="imged__exprow">
              <Button variant="primary" icon="download" onClick={() => void doExport()}>
                Speichern
              </Button>
              <Button icon="copy" onClick={() => void copyImage()}>
                Kopieren
              </Button>
            </div>
            <p className="imged__hint">
              Ausgabe {iw} × {ih} px · Metadaten werden entfernt
            </p>
          </Section>
        </aside>
      </div>
    </div>
  )
}

/* ---------- Bausteine ---------- */

function Section({
  title,
  icon,
  children
}: {
  title: string
  icon: IconName
  children: ReactNode
}): JSX.Element {
  return (
    <section className="imged__section">
      <div className="imged__sectitle">
        <Icon name={icon} size={13} />
        {title}
      </div>
      {children}
    </section>
  )
}

function AdjustSlider({
  label,
  v,
  min,
  max,
  onChange,
  onCommit
}: {
  label: string
  v: number
  min: number
  max: number
  onChange: (n: number) => void
  onCommit: () => void
}): JSX.Element {
  return (
    <label className="imged__adj">
      <span>{label}</span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        value={v}
        onPointerDown={onCommit}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function ResizePanel({
  iw,
  ih,
  onResize
}: {
  iw: number
  ih: number
  onResize: (w: number, h: number) => void
}): JSX.Element {
  const [w, setW] = useState(iw)
  const [h, setH] = useState(ih)
  const [lock, setLock] = useState(true)
  const ratio = iw / ih || 1
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (!dirtyRef.current) {
      setW(iw)
      setH(ih)
    }
    dirtyRef.current = false
  }, [iw, ih])

  const setWidth = (nw: number): void => {
    dirtyRef.current = true
    setW(nw)
    if (lock) setH(Math.round(nw / ratio))
  }
  const setHeight = (nh: number): void => {
    dirtyRef.current = true
    setH(nh)
    if (lock) setW(Math.round(nh * ratio))
  }

  return (
    <div className="imged__resize">
      <div className="imged__resrow">
        <label>
          B
          <input
            type="number"
            className="input"
            value={w}
            min={1}
            onChange={(e) => setWidth(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <button
          className={cx('imged__lock', lock && 'is-on')}
          title="Seitenverhältnis behalten"
          onClick={() => setLock((x) => !x)}
        >
          <Icon name={lock ? 'lock' : 'unlock'} size={13} />
        </button>
        <label>
          H
          <input
            type="number"
            className="input"
            value={h}
            min={1}
            onChange={(e) => setHeight(Math.max(1, Number(e.target.value)))}
          />
        </label>
      </div>
      <div className="imged__resquick">
        <button onClick={() => onResize(Math.round(iw / 2), Math.round(ih / 2))}>50 %</button>
        <button onClick={() => onResize(1920, Math.round(1920 / ratio))}>1920 breit</button>
        <button onClick={() => onResize(Math.round(1080 * ratio), 1080)}>1080 hoch</button>
        <button
          className="imged__resapply"
          disabled={w === iw && h === ih}
          onClick={() => onResize(w, h)}
        >
          Anwenden
        </button>
      </div>
    </div>
  )
}

function MetaPanel(): JSX.Element {
  const meta = useImageStore((s) => s.meta)
  if (meta.length === 0) {
    return <p className="imged__hint">Keine eingebetteten Kamera-/EXIF-Daten gefunden.</p>
  }
  return (
    <div className="imged__meta">
      {meta.map((m, i) => (
        <div key={i} className={cx('imged__metarow', m.sensitive && 'is-sensitive')}>
          <span className="imged__metak">{m.label}</span>
          <span className="imged__metav">{m.value}</span>
        </div>
      ))}
    </div>
  )
}
