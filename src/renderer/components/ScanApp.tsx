import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { Segmented } from './common/controls'
import { Field, FieldGroup } from './common/Field'
import { toast } from './common/toast'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import { canvasFromBytes, canvasToBytes } from '../image/transform'
import { SCAN_MODE_LABEL, type ScanMode } from '../scan/filters'
import { defaultQuad, pagesToPdf, renderScan, type ScanPage } from '../scan/render'
import type { Pt } from '../scan/geometry'
import './scanapp.css'

const SIPS = new Set(['heic', 'heif', 'tif', 'tiff'])

async function toCanvas(name: string, bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''
  let data = bytes
  let mime = 'image/jpeg'
  if (SIPS.has(ext)) {
    data = await window.api.sipsConvert({ bytes }, 'png')
    mime = 'image/png'
  } else if (ext === 'png') mime = 'image/png'
  return canvasFromBytes(data, mime)
}

export function ScanApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [pages, setPages] = useState<ScanPage[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sel = pages.find((p) => p.id === selId) ?? null
  const patchSel = (patch: Partial<ScanPage>): void =>
    setPages((cur) => cur.map((p) => (p.id === selId ? { ...p, ...patch } : p)))

  const addPage = async (name: string, bytes: Uint8Array): Promise<void> => {
    setErr(null)
    try {
      const src = await toCanvas(name, bytes)
      const page: ScanPage = {
        id: nanoid(8),
        name,
        src,
        quad: defaultQuad(src.width, src.height),
        mode: 'text',
        brightness: 0,
        contrast: 0,
        rotate: 0
      }
      setPages((cur) => [...cur, page])
      setSelId((cur) => cur ?? page.id)
    } catch {
      setErr(`„${name}" konnte nicht geladen werden.`)
    }
  }

  const pick = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked) return
    for (const p of picked) {
      const f = await window.api.readFile(p.path)
      await addPage(f.name, f.bytes)
    }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const f = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.type.startsWith('image/'))
        ?.getAsFile()
      if (f) f.arrayBuffer().then((ab) => addPage(f.name || 'foto.png', new Uint8Array(ab)))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scanConsumed) return
    scanConsumed = true
    const p = /[#&]scan=([^&]+)/.exec(location.hash)?.[1]
    if (/[#&]scantest=1/.test(location.hash)) void runScanSelfTest()
    if (p) {
      void (async () => {
        for (const one of decodeURIComponent(p).split('|')) {
          if (!one) continue
          try {
            const f = await window.api.readFile(one)
            await addPage(f.name, f.bytes)
          } catch {
            /* ignore */
          }
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removePage = (id: string): void => {
    setPages((cur) => cur.filter((p) => p.id !== id))
    if (selId === id) setSelId(pages.find((p) => p.id !== id)?.id ?? null)
  }
  const movePage = (id: string, dir: -1 | 1): void =>
    setPages((cur) => {
      const i = cur.findIndex((p) => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= cur.length) return cur
      const copy = [...cur]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const savePdf = async (): Promise<void> => {
    if (pages.length === 0) return
    setBusy(true)
    try {
      const bytes = await pagesToPdf(pages)
      const path = await window.api.saveDialog({
        defaultName: 'scan.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (path) {
        await window.api.writeFile(path, bytes)
        toast.success(
          `${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'} als PDF gesichert.`,
          {
            label: 'Zeigen',
            run: () => window.api.showItemInFolder(path)
          }
        )
      }
    } catch (e) {
      toast.error(`PDF fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannt'}`)
    } finally {
      setBusy(false)
    }
  }

  const saveImage = async (): Promise<void> => {
    if (!sel) return
    const cv = renderScan(sel)
    const bytes = await canvasToBytes(cv, 'image/jpeg', 0.9)
    const path = await window.api.saveDialog({
      defaultName: `${sel.name.replace(/\.[a-z0-9]+$/i, '')}-scan.jpg`,
      filters: [{ name: 'JPEG', extensions: ['jpg'] }]
    })
    if (!path) return
    await window.api.writeFile(path, bytes)
    toast.success('Seite als Bild gesichert.', {
      label: 'Zeigen',
      run: () => window.api.showItemInFolder(path)
    })
  }

  return (
    <div
      className="scn"
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
            await addPage(f.name, new Uint8Array(await f.arrayBuffer()))
          }
        })()
      }}
    >
      <div className="scn__glow" aria-hidden />
      <header className="scn__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="scn__title">Dokumentenscan</div>
        <div style={{ width: 92 }} />
      </header>

      {pages.length === 0 ? (
        <div className="scn__scroll">
          <div className={cx('scn__drop', over && 'is-over')}>
            <div className="scn__dropicon">
              <Icon name="scan" size={34} />
            </div>
            <div className="scn__droptitle">Foto eines Dokuments ablegen</div>
            <div className="scn__dropsub">
              JPEG · PNG · HEIC · TIFF — mehrere Fotos werden zu einem mehrseitigen PDF
            </div>
            {err && <div className="scn__droperr">{err}</div>}
            <Button variant="primary" icon="scan" onClick={() => void pick()}>
              Foto wählen …
            </Button>
          </div>
        </div>
      ) : (
        <div className="scn__work">
          {sel && <CornerEditor key={sel.id} page={sel} onQuad={(quad) => patchSel({ quad })} />}

          <aside className="scn__side">
            <div className="scn__preview">{sel && <LivePreview page={sel} />}</div>

            <FieldGroup title="Aufbereitung">
              <Field label="Modus" stack>
                <Segmented
                  value={sel?.mode ?? 'text'}
                  onChange={(mode) => patchSel({ mode })}
                  options={(Object.keys(SCAN_MODE_LABEL) as ScanMode[]).map((m) => ({
                    value: m,
                    label: SCAN_MODE_LABEL[m]
                  }))}
                />
              </Field>
              <Field label={`Helligkeit ${sel?.brightness ?? 0}`}>
                <input
                  type="range"
                  className="slider"
                  min={-60}
                  max={60}
                  value={sel?.brightness ?? 0}
                  onChange={(e) => patchSel({ brightness: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Kontrast ${sel?.contrast ?? 0}`}>
                <input
                  type="range"
                  className="slider"
                  min={-60}
                  max={60}
                  value={sel?.contrast ?? 0}
                  onChange={(e) => patchSel({ contrast: Number(e.target.value) })}
                />
              </Field>
              <Field label="Drehen">
                <div className="scn__rotrow">
                  <IconButton
                    name="rotate-ccw"
                    label="Nach links"
                    onClick={() =>
                      patchSel({ rotate: (((sel?.rotate ?? 0) + 270) % 360) as ScanPage['rotate'] })
                    }
                  />
                  <IconButton
                    name="rotate-cw"
                    label="Nach rechts"
                    onClick={() =>
                      patchSel({ rotate: (((sel?.rotate ?? 0) + 90) % 360) as ScanPage['rotate'] })
                    }
                  />
                  <Button
                    onClick={() =>
                      sel && patchSel({ quad: defaultQuad(sel.src.width, sel.src.height) })
                    }
                  >
                    Ecken zurücksetzen
                  </Button>
                </div>
              </Field>
              <Button
                block
                onClick={() =>
                  sel &&
                  patchSel({
                    quad: [
                      { x: 0, y: 0 },
                      { x: sel.src.width, y: 0 },
                      { x: sel.src.width, y: sel.src.height },
                      { x: 0, y: sel.src.height }
                    ]
                  })
                }
              >
                Ganzes Foto verwenden
              </Button>
            </FieldGroup>

            <div className="scn__exprow">
              <Button
                variant="primary"
                icon="download"
                disabled={busy}
                onClick={() => void savePdf()}
              >
                {pages.length > 1 ? `${pages.length} Seiten als PDF` : 'Als PDF'}
              </Button>
              <Button icon="image" disabled={busy} onClick={() => void saveImage()}>
                Als Bild
              </Button>
            </div>
          </aside>

          <div className="scn__film">
            {pages.map((p, i) => (
              <div
                key={p.id}
                className={cx('scn__page', p.id === selId && 'is-active')}
                onClick={() => setSelId(p.id)}
              >
                <Thumb page={p} />
                <span className="scn__pagenum">{i + 1}</span>
                <div className="scn__pageact">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      movePage(p.id, -1)
                    }}
                    disabled={i === 0}
                    title="Nach vorne"
                  >
                    <Icon name="chevron-left" size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      movePage(p.id, 1)
                    }}
                    disabled={i === pages.length - 1}
                    title="Nach hinten"
                  >
                    <Icon name="chevron-right" size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removePage(p.id)
                    }}
                    title="Seite entfernen"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              </div>
            ))}
            <button className="scn__add" onClick={() => void pick()} title="Seite hinzufügen">
              <Icon name="plus" size={16} />
              <span>Seite</span>
            </button>
          </div>
          {err && <div className="scn__droperr scn__droperr--float">{err}</div>}
        </div>
      )}
    </div>
  )
}

/* ==================== Ecken-Editor ==================== */

function CornerEditor({
  page,
  onQuad
}: {
  page: ScanPage
  onQuad: (q: Pt[]) => void
}): JSX.Element {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const iw = page.src.width
  const ih = page.src.height

  useEffect(() => {
    if (!box) return
    const ro = new ResizeObserver(() => setSize({ w: box.clientWidth, h: box.clientHeight }))
    ro.observe(box)
    setSize({ w: box.clientWidth, h: box.clientHeight })
    return () => ro.disconnect()
  }, [box])

  const scale = Math.min((size.w - 40) / iw, (size.h - 40) / ih, 1) || 0.1
  const dispW = iw * scale
  const dispH = ih * scale

  const imgRef = useRef<HTMLImageElement>(null)
  const dataUrl = useMemo(() => page.src.toDataURL('image/jpeg', 0.7), [page.src])

  const toImg = (clientX: number, clientY: number): Pt => {
    const r = imgRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(iw, ((clientX - r.left) / r.width) * iw)),
      y: Math.max(0, Math.min(ih, ((clientY - r.top) / r.height) * ih))
    }
  }

  const onDown = (i: number) => (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDragIdx(i)
  }
  const onMove = (e: React.PointerEvent): void => {
    if (dragIdx == null) return
    const p = toImg(e.clientX, e.clientY)
    const next = page.quad.map((q, i) => (i === dragIdx ? p : q))
    onQuad(next)
  }
  const onUp = (): void => setDragIdx(null)

  const S = (n: number): number => n * scale

  return (
    <div className="scn__editor" ref={setBox}>
      <div
        className="scn__canvas"
        style={{ width: dispW, height: dispH }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <img ref={imgRef} src={dataUrl} alt="" className="scn__photo" draggable={false} />
        <svg className="scn__quad" width={dispW} height={dispH}>
          <path
            className="scn__quadmask"
            d={`M0 0H${dispW}V${dispH}H0Z M${page.quad.map((p) => `${S(p.x)} ${S(p.y)}`).join('L')}Z`}
            fillRule="evenodd"
          />
          <polygon
            className="scn__quadline"
            points={page.quad.map((p) => `${S(p.x)},${S(p.y)}`).join(' ')}
          />
        </svg>
        {page.quad.map((p, i) => (
          <div
            key={i}
            className={cx('scn__corner', dragIdx === i && 'is-drag')}
            style={{ left: S(p.x), top: S(p.y) }}
            onPointerDown={onDown(i)}
          />
        ))}
        {dragIdx != null && (
          <Loupe src={page.src} at={page.quad[dragIdx]} dispW={dispW} scale={scale} />
        )}
      </div>
    </div>
  )
}

function Loupe({
  src,
  at,
  dispW,
  scale
}: {
  src: HTMLCanvasElement
  at: Pt
  dispW: number
  scale: number
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const R = 68
  const ZOOM = 3
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    cv.width = R * 2
    cv.height = R * 2
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, R * 2, R * 2)
    const s = (R * 2) / ZOOM
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, at.x - s / 2, at.y - s / 2, s, s, 0, 0, R * 2, R * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.moveTo(R, 0)
    ctx.lineTo(R, R * 2)
    ctx.moveTo(0, R)
    ctx.lineTo(R * 2, R)
    ctx.stroke()
  }, [src, at.x, at.y])
  const left = at.x * scale > dispW / 2 ? 12 : dispW - R * 2 - 12
  return <canvas ref={ref} className="scn__loupe" style={{ left, top: 12 }} />
}

/* ==================== Live-Vorschau ==================== */

function LivePreview({ page }: { page: ScanPage }): JSX.Element {
  const holderRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const key = `${JSON.stringify(page.quad)}|${page.mode}|${page.brightness}|${page.contrast}|${page.rotate}`

  useEffect(() => {
    const id = setTimeout(() => setTick((t) => t + 1), 220)
    return () => clearTimeout(id)
  }, [key])

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    let cancelled = false
    const run = (): void => {
      const cv = renderScan(page)
      if (cancelled) return
      cv.className = 'scn__previewimg'
      holder.replaceChildren(cv)
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  return <div className="scn__previewholder" ref={holderRef} />
}

function Thumb({ page }: { page: ScanPage }): JSX.Element {
  const url = useMemo(() => {
    const c = document.createElement('canvas')
    const s = 120 / Math.max(page.src.width, page.src.height)
    c.width = Math.max(1, page.src.width * s)
    c.height = Math.max(1, page.src.height * s)
    c.getContext('2d')?.drawImage(page.src, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.6)
  }, [page.src])
  return <img src={url} alt="" className="scn__thumb" />
}

/* ---------- Dev-Selbsttest ---------- */

let scanConsumed = false

async function runScanSelfTest(): Promise<void> {
  try {
    const { homography, warpPerspective, suggestSize } = await import('../scan/geometry')
    // Synthetisches „schräges" Bild: weißes Blatt auf grau, perspektivisch verzerrt
    const src = document.createElement('canvas')
    src.width = 400
    src.height = 300
    const c = src.getContext('2d')!
    c.fillStyle = '#888'
    c.fillRect(0, 0, 400, 300)
    c.fillStyle = '#fff'
    c.beginPath()
    c.moveTo(60, 40)
    c.lineTo(350, 70)
    c.lineTo(330, 260)
    c.lineTo(40, 230)
    c.closePath()
    c.fill()
    c.fillStyle = '#000'
    c.fillRect(120, 110, 160, 12)

    const quad: Pt[] = [
      { x: 60, y: 40 },
      { x: 350, y: 70 },
      { x: 330, y: 260 },
      { x: 40, y: 230 }
    ]
    const H = homography(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ],
      quad
    )
    const hOk = !!H && Math.abs(H[8] - 1) < 1e-9
    const { w, h } = suggestSize(quad)
    const out = warpPerspective(c.getImageData(0, 0, 400, 300), quad, w, h)
    // Ecken des Ergebnisses sollten weiß sein (Blatt), Mitte hat den schwarzen Balken
    const px = (x: number, y: number): number => out.data[(y * out.width + x) * 4]
    const cornersWhite = px(4, 4) > 200 && px(w - 5, 4) > 200 && px(4, h - 5) > 200
    const runOk = w > 100 && h > 100 && cornersWhite
    console.log(hOk && runOk ? 'SCANTEST OK' : `SCANTEST FAIL h=${hOk} run=${runOk} size=${w}x${h}`)
  } catch (e) {
    console.log(`SCANTEST FAIL ${e instanceof Error ? e.message : e}`)
  }
}
