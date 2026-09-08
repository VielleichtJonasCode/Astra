import { useCallback, useEffect, useRef, useState } from 'react'
import { Sheet } from '../common/Sheet'
import { Button, IconButton } from '../common/Button'
import { Segmented, TextInput, Select } from '../common/controls'
import { Field, FieldGroup } from '../common/Field'
import { toast } from '../common/toast'
import { dataUrlToBytes } from '../../lib/bytes'
import {
  deleteSignature,
  loadSignatures,
  saveSignature,
  signatureToPlacement,
  type SavedSignature
} from '../../lib/signatures'
import { placeSignature } from '../../lib/quickInsert'
import { useShellStore } from '../../store/shellStore'

type Tab = 'draw' | 'image' | 'type'
const PAD_W = 520
const PAD_H = 170

const TYPE_FONTS = [
  { value: '"Snell Roundhand", "Apple Chancery", cursive', label: 'Schreibschrift' },
  { value: '"Bradley Hand", "Segoe Script", cursive', label: 'Handschrift' },
  { value: 'Georgia, serif', label: 'Serif' }
]

export function SignatureDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>('draw')
  const [saved, setSaved] = useState<SavedSignature[]>(() => loadSignatures())
  const [remember, setRemember] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<{ x: number; y: number }[][]>([])
  const drawing = useRef(false)

  const [imgData, setImgData] = useState<string | null>(null)
  const [typedName, setTypedName] = useState('')
  const [typedFont, setTypedFont] = useState(TYPE_FONTS[0].value)

  const noDoc = useShellStore((s) => s.view) !== 'pdf'

  /* ---- Zeichen-Pad ---- */
  const redraw = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#0a2a66'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokes.current) {
      ctx.beginPath()
      s.forEach((p, i) =>
        i ? ctx.lineTo(p.x * c.width, p.y * c.height) : ctx.moveTo(p.x * c.width, p.y * c.height)
      )
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    redraw()
  }, [tab, redraw])

  const padPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  const clearDraw = (): void => {
    strokes.current = []
    redraw()
  }

  /* ---- Bild ---- */
  const pickImage = (): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      const url = URL.createObjectURL(f)
      const img = new Image()
      img.src = url
      await img.decode().catch(() => undefined)
      // auf transparentes PNG normalisieren
      const c = document.createElement('canvas')
      const maxW = 800
      const sc = Math.min(1, maxW / (img.naturalWidth || maxW))
      c.width = Math.max(1, Math.round((img.naturalWidth || 400) * sc))
      c.height = Math.max(1, Math.round((img.naturalHeight || 160) * sc))
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      setImgData(c.toDataURL('image/png'))
    }
    input.click()
  }

  /* ---- Tippen → PNG ---- */
  const renderTyped = (): string | null => {
    if (!typedName.trim()) return null
    const c = document.createElement('canvas')
    c.width = 900
    c.height = 260
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0a2a66'
    ctx.font = `64px ${typedFont}`
    ctx.textBaseline = 'middle'
    ctx.fillText(typedName, 24, c.height / 2)
    return c.toDataURL('image/png')
  }

  /* ---- Übernehmen ---- */
  const useCurrent = (): void => {
    if (tab === 'draw') {
      if (strokes.current.length === 0) return
      const paths = strokes.current.map((s) => s.map((p) => ({ ...p })))
      if (remember)
        setSaved((cur) => [
          saveSignature({ label: 'Zeichnung', kind: 'draw', paths, aspect: PAD_H / PAD_W }),
          ...cur
        ])
      placeSignature({ kind: 'draw', paths, aspect: PAD_H / PAD_W })
      done()
    } else {
      const dataUrl = tab === 'image' ? imgData : renderTyped()
      if (!dataUrl) return
      const img = new Image()
      img.onload = () => {
        const aspect = img.naturalHeight / img.naturalWidth
        if (remember)
          setSaved((cur) => [
            saveSignature({
              label: tab === 'type' ? typedName : 'Bild',
              kind: 'image',
              dataUrl,
              aspect
            }),
            ...cur
          ])
        placeSignature({ kind: 'image', bytes: dataUrlToBytes(dataUrl), mime: 'image/png', aspect })
        done()
      }
      img.src = dataUrl
    }
  }

  const usePreset = (sig: SavedSignature): void => {
    placeSignature(signatureToPlacement(sig))
    done()
  }

  const done = (): void => {
    toast.success('Unterschrift platziert.')
    onClose()
  }

  return (
    <Sheet
      title="Unterschrift"
      subtitle={noDoc ? 'Bitte zuerst ein PDF öffnen' : 'Zeichnen, hochladen oder tippen'}
      wide
      onClose={onClose}
      footer={
        <>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--text-secondary)'
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Für später merken
          </label>
          <span className="spacer" />
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={noDoc} onClick={useCurrent}>
            Einfügen
          </Button>
        </>
      }
    >
      {saved.length > 0 && (
        <FieldGroup title="Gespeichert">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {saved.map((s) => (
              <div key={s.id} className="sig-chip">
                <button className="sig-chip__use" disabled={noDoc} onClick={() => usePreset(s)}>
                  {s.kind === 'image' && s.dataUrl ? (
                    <img src={s.dataUrl} alt={s.label} />
                  ) : (
                    <MiniStrokes paths={s.paths ?? []} />
                  )}
                </button>
                <IconButton
                  name="trash"
                  label="Löschen"
                  onClick={() => {
                    deleteSignature(s.id)
                    setSaved(loadSignatures())
                  }}
                />
              </div>
            ))}
          </div>
        </FieldGroup>
      )}

      <Field label="Methode">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'draw', label: 'Zeichnen' },
            { value: 'image', label: 'Bild' },
            { value: 'type', label: 'Tippen' }
          ]}
        />
      </Field>

      {tab === 'draw' && (
        <div>
          <canvas
            ref={canvasRef}
            width={PAD_W}
            height={PAD_H}
            className="sig-pad"
            onPointerDown={(e) => {
              drawing.current = true
              ;(e.target as Element).setPointerCapture(e.pointerId)
              strokes.current.push([padPoint(e)])
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return
              strokes.current[strokes.current.length - 1].push(padPoint(e))
              redraw()
            }}
            onPointerUp={() => (drawing.current = false)}
          />
          <div style={{ marginTop: 8 }}>
            <Button onClick={clearDraw}>Löschen</Button>
          </div>
        </div>
      )}

      {tab === 'image' && (
        <div>
          <Button onClick={pickImage}>Bilddatei wählen …</Button>
          {imgData && (
            <div className="sig-preview">
              <img src={imgData} alt="Vorschau" />
            </div>
          )}
        </div>
      )}

      {tab === 'type' && (
        <FieldGroup>
          <Field label="Name">
            <TextInput value={typedName} onChange={(e) => setTypedName(e.target.value)} autoFocus />
          </Field>
          <Field label="Stil">
            <Select
              value={typedFont}
              onChange={(e) => setTypedFont(e.target.value)}
              options={TYPE_FONTS}
            />
          </Field>
          {typedName && (
            <div
              className="sig-preview"
              style={{ fontFamily: typedFont, fontSize: 40, color: '#0a2a66', padding: 12 }}
            >
              {typedName}
            </div>
          )}
        </FieldGroup>
      )}
    </Sheet>
  )
}

function MiniStrokes({ paths }: { paths: { x: number; y: number }[][] }): JSX.Element {
  return (
    <svg viewBox="0 0 1 0.32" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      {paths.map((p, i) => (
        <polyline
          key={i}
          points={p.map((q) => `${q.x},${q.y * 0.32}`).join(' ')}
          fill="none"
          stroke="#0a2a66"
          strokeWidth={0.012}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
