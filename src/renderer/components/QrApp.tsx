import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Button } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { AstraMark } from './AstraMark'
import { Segmented, TextInput, TextArea, Select } from './common/controls'
import { Field, FieldGroup } from './common/Field'
import { ColorWell } from './common/ColorWell'
import { toast } from './common/toast'
import { cx } from '../lib/cx'
import { bytesToBlob, dataUrlToBytes } from '../lib/bytes'
import {
  buildPayload,
  CONTENT_LABELS,
  EMPTY_FIELDS,
  type ContentFields,
  type ContentType
} from '../qr/payload'
import './qrapp.css'

type CodeType = 'qr' | 'code128' | 'ean13' | 'ean8' | 'upc'

const CODE_LABEL: Record<CodeType, string> = {
  qr: 'QR-Code',
  code128: 'Code 128',
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  upc: 'UPC-A'
}
const BARCODE_FORMAT: Record<Exclude<CodeType, 'qr'>, string> = {
  code128: 'CODE128',
  ean13: 'EAN13',
  ean8: 'EAN8',
  upc: 'UPC'
}
const BARCODE_HINT: Record<Exclude<CodeType, 'qr'>, string> = {
  code128: 'Buchstaben und Ziffern erlaubt',
  ean13: 'genau 12–13 Ziffern',
  ean8: 'genau 7–8 Ziffern',
  upc: 'genau 11–12 Ziffern'
}

/** Dev-Selbsttest: QR + Barcode erzeugen und wieder auslesen. Aktiv via #qrtest=1 */
function useQrSelfTest(): void {
  useEffect(() => {
    if (!/qrtest=1/.test(location.hash)) return
    void (async () => {
      const log = (m: string): void => console.log(m)
      try {
        const c1 = document.createElement('canvas')
        await QRCode.toCanvas(c1, 'https://astra.example/äöü-€', { width: 320 })
        const c2 = document.createElement('canvas')
        JsBarcode(c2, '5901234123457', { format: 'EAN13' })
        const { BrowserMultiFormatReader } = await import('@zxing/library')
        const reader = new BrowserMultiFormatReader()
        const r1 = await reader.decodeFromImageUrl(c1.toDataURL())
        const r2 = await reader.decodeFromImageUrl(c2.toDataURL())
        const ok =
          r1.getText() === 'https://astra.example/äöü-€' && r2.getText() === '5901234123457'
        log(ok ? 'QRTEST OK' : `QRTEST FAIL ${r1.getText()} | ${r2.getText()}`)
      } catch (e) {
        log(`QRTEST FAIL ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
  }, [])
}

export function QrApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [mode, setMode] = useState<'make' | 'read'>(
    /qrmode=read/.test(location.hash) ? 'read' : 'make'
  )
  useQrSelfTest()

  return (
    <div className="qr">
      <div className="qr__glow" aria-hidden />

      <header className="qr__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="qr__titlewrap">
          <div className="qr__modeswitch no-drag">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'make', label: 'Erstellen' },
                { value: 'read', label: 'Lesen' }
              ]}
            />
          </div>
        </div>
        <div className="qr__spacer" />
      </header>

      {mode === 'make' ? <MakePane /> : <ReadPane />}
    </div>
  )
}

/* ==================== Erstellen ==================== */

function MakePane(): JSX.Element {
  const [codeType, setCodeType] = useState<CodeType>('qr')
  const [content, setContent] = useState<ContentType>('url')
  const [fields, setFields] = useState<ContentFields>(EMPTY_FIELDS)
  const [barValue, setBarValue] = useState('')
  const [size, setSize] = useState(320)
  const [margin, setMargin] = useState(2)
  const [ec, setEc] = useState<'L' | 'M' | 'Q' | 'H'>('M')
  const [fg, setFg] = useState('#101012')
  const [bg, setBg] = useState('#ffffff')
  const [err, setErr] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const set = (p: Partial<ContentFields>): void => setFields((f) => ({ ...f, ...p }))
  const payload = codeType === 'qr' ? buildPayload(content, fields) : barValue.trim()
  const ready = payload.length > 0 && !err

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!payload) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      setErr(null)
      return
    }
    if (codeType === 'qr') {
      QRCode.toCanvas(canvas, payload, {
        width: size,
        margin,
        errorCorrectionLevel: ec,
        color: { dark: fg, light: bg }
      })
        .then(() => setErr(null))
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Fehler beim Erzeugen'))
      return
    }
    try {
      JsBarcode(canvas, payload, {
        format: BARCODE_FORMAT[codeType],
        width: 2.4,
        height: Math.round(size * 0.42),
        displayValue: true,
        margin: margin * 6,
        lineColor: fg,
        background: bg,
        fontSize: 15
      })
      setErr(null)
    } catch {
      setErr(`Ungültiger Wert für ${CODE_LABEL[codeType]} – ${BARCODE_HINT[codeType]}.`)
    }
  }, [payload, codeType, size, margin, ec, fg, bg])

  const savePng = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (!canvas || !ready) return
    const path = await window.api.saveDialog({
      defaultName: `${codeType === 'qr' ? 'qr-code' : 'barcode'}.png`,
      filters: [{ name: 'PNG-Bild', extensions: ['png'] }]
    })
    if (!path) return
    await window.api.writeFile(path, dataUrlToBytes(canvas.toDataURL('image/png')))
    toast.success('Als PNG gesichert.', {
      label: 'Zeigen',
      run: () => window.api.showItemInFolder(path)
    })
  }

  const saveSvg = async (): Promise<void> => {
    if (!ready) return
    let svg: string
    if (codeType === 'qr') {
      svg = await QRCode.toString(payload, {
        type: 'svg',
        margin,
        errorCorrectionLevel: ec,
        color: { dark: fg, light: bg }
      })
    } else {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(el, payload, {
        format: BARCODE_FORMAT[codeType],
        displayValue: true,
        margin: margin * 6,
        lineColor: fg,
        background: bg
      })
      svg = new XMLSerializer().serializeToString(el)
    }
    const path = await window.api.saveDialog({
      defaultName: `${codeType === 'qr' ? 'qr-code' : 'barcode'}.svg`,
      filters: [{ name: 'SVG-Bild', extensions: ['svg'] }]
    })
    if (!path) return
    await window.api.writeFile(path, new TextEncoder().encode(svg))
    toast.success('Als SVG gesichert.', {
      label: 'Zeigen',
      run: () => window.api.showItemInFolder(path)
    })
  }

  const copyImage = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (!canvas || !ready) return
    try {
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('kein Bild'))), 'image/png')
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('In die Zwischenablage kopiert.')
    } catch {
      toast.error('Kopieren nicht möglich.')
    }
  }

  return (
    <div className="qr__body">
      <div className="qr__form">
        <FieldGroup title="Code">
          <Field label="Typ">
            <Select
              value={codeType}
              onChange={(e) => setCodeType(e.target.value as CodeType)}
              options={(Object.keys(CODE_LABEL) as CodeType[]).map((k) => ({
                value: k,
                label: CODE_LABEL[k]
              }))}
            />
          </Field>
          {codeType === 'qr' ? (
            <Field label="Inhalt">
              <Select
                value={content}
                onChange={(e) => setContent(e.target.value as ContentType)}
                options={(Object.keys(CONTENT_LABELS) as ContentType[]).map((k) => ({
                  value: k,
                  label: CONTENT_LABELS[k]
                }))}
              />
            </Field>
          ) : (
            <Field label="Wert" hint={BARCODE_HINT[codeType]}>
              <TextInput value={barValue} onChange={(e) => setBarValue(e.target.value)} autoFocus />
            </Field>
          )}
        </FieldGroup>

        {codeType === 'qr' && (
          <FieldGroup title={CONTENT_LABELS[content]}>
            {content === 'text' && (
              <Field label="Text" stack>
                <TextArea
                  rows={3}
                  value={fields.text}
                  onChange={(e) => set({ text: e.target.value })}
                />
              </Field>
            )}
            {content === 'url' && (
              <Field label="Adresse">
                <TextInput value={fields.url} onChange={(e) => set({ url: e.target.value })} />
              </Field>
            )}
            {content === 'wifi' && (
              <>
                <Field label="Netzwerk (SSID)">
                  <TextInput value={fields.ssid} onChange={(e) => set({ ssid: e.target.value })} />
                </Field>
                <Field label="Sicherheit">
                  <Segmented
                    value={fields.wenc}
                    onChange={(w) => set({ wenc: w })}
                    options={[
                      { value: 'WPA', label: 'WPA/WPA2' },
                      { value: 'WEP', label: 'WEP' },
                      { value: 'nopass', label: 'offen' }
                    ]}
                  />
                </Field>
                {fields.wenc !== 'nopass' && (
                  <Field label="Passwort">
                    <TextInput
                      value={fields.wpass}
                      onChange={(e) => set({ wpass: e.target.value })}
                    />
                  </Field>
                )}
              </>
            )}
            {content === 'email' && (
              <>
                <Field label="An">
                  <TextInput
                    value={fields.email}
                    onChange={(e) => set({ email: e.target.value })}
                  />
                </Field>
                <Field label="Betreff">
                  <TextInput
                    value={fields.subject}
                    onChange={(e) => set({ subject: e.target.value })}
                  />
                </Field>
                <Field label="Text" stack>
                  <TextArea
                    rows={2}
                    value={fields.body}
                    onChange={(e) => set({ body: e.target.value })}
                  />
                </Field>
              </>
            )}
            {content === 'phone' && (
              <Field label="Rufnummer">
                <TextInput value={fields.phone} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
            )}
            {content === 'sms' && (
              <>
                <Field label="Rufnummer">
                  <TextInput
                    value={fields.phone}
                    onChange={(e) => set({ phone: e.target.value })}
                  />
                </Field>
                <Field label="Nachricht" stack>
                  <TextArea
                    rows={2}
                    value={fields.smsBody}
                    onChange={(e) => set({ smsBody: e.target.value })}
                  />
                </Field>
              </>
            )}
            {content === 'geo' && (
              <>
                <Field label="Breitengrad">
                  <TextInput value={fields.lat} onChange={(e) => set({ lat: e.target.value })} />
                </Field>
                <Field label="Längengrad">
                  <TextInput value={fields.lon} onChange={(e) => set({ lon: e.target.value })} />
                </Field>
              </>
            )}
            {content === 'vcard' && (
              <>
                <Field label="Vorname">
                  <TextInput
                    value={fields.firstName}
                    onChange={(e) => set({ firstName: e.target.value })}
                  />
                </Field>
                <Field label="Nachname">
                  <TextInput
                    value={fields.lastName}
                    onChange={(e) => set({ lastName: e.target.value })}
                  />
                </Field>
                <Field label="Firma">
                  <TextInput value={fields.org} onChange={(e) => set({ org: e.target.value })} />
                </Field>
                <Field label="Telefon">
                  <TextInput
                    value={fields.vphone}
                    onChange={(e) => set({ vphone: e.target.value })}
                  />
                </Field>
                <Field label="E-Mail">
                  <TextInput
                    value={fields.vemail}
                    onChange={(e) => set({ vemail: e.target.value })}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
        )}

        <FieldGroup title="Aussehen">
          <Field label={`Größe · ${size} px`}>
            <input
              type="range"
              className="slider"
              min={128}
              max={640}
              step={16}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </Field>
          <Field label={`Rand · ${margin}`}>
            <input
              type="range"
              className="slider"
              min={0}
              max={8}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
            />
          </Field>
          {codeType === 'qr' && (
            <Field label="Fehlerkorrektur">
              <Segmented
                value={ec}
                onChange={setEc}
                options={[
                  { value: 'L', label: 'L', title: '7 % wiederherstellbar' },
                  { value: 'M', label: 'M', title: '15 % wiederherstellbar' },
                  { value: 'Q', label: 'Q', title: '25 % wiederherstellbar' },
                  { value: 'H', label: 'H', title: '30 % wiederherstellbar' }
                ]}
              />
            </Field>
          )}
          <Field label="Vordergrund">
            <ColorWell value={fg} onChange={setFg} />
          </Field>
          <Field label="Hintergrund">
            <ColorWell value={bg} onChange={setBg} />
          </Field>
        </FieldGroup>
      </div>

      <div className="qr__preview">
        <div className="qr__canvaswrap" style={{ background: bg }}>
          <canvas
            ref={canvasRef}
            className="qr__canvas"
            style={{ display: ready ? 'block' : 'none' }}
          />
          {!ready && (
            <div className="qr__placeholder">
              <Icon name={err ? 'info' : 'grid'} size={38} />
              <span>{err ?? 'Inhalt eingeben, um eine Vorschau zu sehen'}</span>
            </div>
          )}
        </div>
        <div className="qr__actions">
          <Button icon="download" disabled={!ready} onClick={() => void savePng()}>
            PNG
          </Button>
          <Button icon="download" disabled={!ready} onClick={() => void saveSvg()}>
            SVG
          </Button>
          <Button icon="copy" disabled={!ready} onClick={() => void copyImage()}>
            Kopieren
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ==================== Lesen ==================== */

interface ReadResult {
  text: string
  format: string
  isUrl: boolean
}

function ReadPane(): JSX.Element {
  const [result, setResult] = useState<ReadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const decode = async (source: Blob | string): Promise<void> => {
    setBusy(true)
    setError(null)
    setResult(null)
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    setPreview(url)
    try {
      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/library')
      const reader = new BrowserMultiFormatReader()
      const res = await reader.decodeFromImageUrl(url)
      const text = res.getText()
      setResult({
        text,
        format: BarcodeFormat[res.getBarcodeFormat()] ?? 'Code',
        isUrl: /^(https?|mailto|tel):/i.test(text)
      })
    } catch {
      setError('Kein Code erkannt. Bild schärfer oder größer wählen.')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked?.[0]) return
    const f = await window.api.readFile(picked[0].path)
    void decode(bytesToBlob(f.bytes, ''))
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const blob = item?.getAsFile()
      if (blob) void decode(blob)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div className="qr__body qr__body--read">
      <div
        className={cx('qr__readzone', dragging && 'is-over')}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            e.stopPropagation()
            setDragging(true)
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDragLeave={(e) => {
          e.stopPropagation()
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) void decode(f)
        }}
      >
        {preview ? (
          <img src={preview} alt="" className="qr__readimg" />
        ) : (
          <>
            <div className="qr__readicon">
              <Icon name="search" size={30} />
            </div>
            <div className="qr__readtitle">Bild mit QR- oder Barcode ablegen</div>
            <div className="qr__readsub">oder aus der Zwischenablage einfügen (⌘V)</div>
          </>
        )}
        <Button variant="primary" icon="image" onClick={() => void pick()}>
          Bild wählen …
        </Button>
      </div>

      <div className="qr__result">
        {busy && <div className="qr__resultmsg">Wird gelesen …</div>}
        {error && !busy && <div className="qr__resultmsg is-err">{error}</div>}
        {result && !busy && (
          <>
            <div className="qr__resulthead">
              <span className="qr__fmt">{result.format.replace(/_/g, ' ')}</span>
            </div>
            <div className="qr__resulttext">{result.text}</div>
            <div className="qr__actions">
              <Button
                icon="copy"
                onClick={() => {
                  void navigator.clipboard.writeText(result.text)
                  toast.success('Kopiert.')
                }}
              >
                Kopieren
              </Button>
              {result.isUrl && (
                <Button icon="arrow-up-right" onClick={() => window.open(result.text, '_blank')}>
                  Öffnen
                </Button>
              )}
            </div>
          </>
        )}
        {!busy && !error && !result && (
          <div className="qr__resultmsg qr__resultmsg--idle">
            Das erkannte Ergebnis erscheint hier.
          </div>
        )}
      </div>
    </div>
  )
}
