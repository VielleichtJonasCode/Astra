import { useState } from 'react'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { Select, TextInput, Slider } from '../common/controls'
import { Progress } from '../common/misc'
import { toast } from '../common/toast'
import { buildDoc } from '../../pdf/buildDoc'
import { buildOutputPdf } from '../../pdf/exportPdf'
import { mergePdfs } from '../../pdf/ops/merge'
import type { PageNumberConfig, WatermarkConfig } from '../../pdf/model'

type Op = 'watermark' | 'pageNumbers' | 'compress' | 'merge'

const WM: WatermarkConfig = {
  kind: 'text',
  text: 'ENTWURF',
  color: '#ff3b30',
  opacity: 0.16,
  rotation: 45,
  fontSize: 72,
  layout: 'diagonal',
  pages: []
}
const PN: PageNumberConfig = {
  template: 'Seite {n} von {N}',
  prefix: '',
  start: 1,
  corner: 'bottom-center',
  fontSize: 10,
  color: '#555555',
  margin: 28,
  pages: []
}

export function BatchDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [op, setOp] = useState<Op>('watermark')
  const [wmText, setWmText] = useState('ENTWURF')
  const [quality, setQuality] = useState(72)
  const [files, setFiles] = useState<{ name: string; bytes: Uint8Array }[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  const pick = async (): Promise<void> => {
    const loaded = await window.api.openDialog()
    if (loaded)
      setFiles(
        loaded.map((f) => ({
          name: f.name,
          bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes)
        }))
      )
  }

  const run = async (): Promise<void> => {
    if (files.length === 0) return
    const dir = await window.api.pickDirectory()
    if (!dir) return
    setBusy(true)
    setDone(0)
    try {
      if (op === 'merge') {
        const bytes = await mergePdfs(files.map((f) => ({ name: f.name, bytes: f.bytes })))
        await window.api.writeFile(`${dir}/Zusammengeführt.pdf`, bytes)
        setDone(files.length)
      } else {
        for (let i = 0; i < files.length; i++) {
          const doc = await buildDoc({ path: '', name: files[i].name, bytes: files[i].bytes })
          if (op === 'watermark') doc.overlays.watermark = { ...WM, text: wmText }
          if (op === 'pageNumbers') doc.overlays.pageNumbers = { ...PN }
          if (op === 'compress') doc.postProcess.compress = { imageDpi: 150, quality }
          const out = await buildOutputPdf(doc)
          const base = files[i].name.replace(/\.pdf$/i, '')
          await window.api.writeFile(`${dir}/${base}-batch.pdf`, out)
          setDone(i + 1)
        }
      }
      toast.success(`${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} verarbeitet.`, {
        label: 'Ordner zeigen',
        run: () => window.api.showItemInFolder(`${dir}/`)
      })
      onClose()
    } catch (err) {
      toast.error('Stapelverarbeitung fehlgeschlagen.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Stapelverarbeitung"
      onClose={onClose}
      footer={
        <>
          <Button icon="plus" onClick={() => void pick()}>
            PDFs wählen
          </Button>
          <span className="spacer" />
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={busy || files.length === 0}
            onClick={() => void run()}
          >
            {busy ? `${done}/${files.length}` : 'Starten …'}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="Aktion">
          <Select
            value={op}
            onChange={(e) => setOp(e.target.value as Op)}
            options={[
              { value: 'watermark', label: 'Wasserzeichen hinzufügen' },
              { value: 'pageNumbers', label: 'Seitenzahlen hinzufügen' },
              { value: 'compress', label: 'Komprimieren' },
              { value: 'merge', label: 'Alle zu einer Datei zusammenführen' }
            ]}
          />
        </Field>
        {op === 'watermark' && (
          <Field label="Text">
            <TextInput value={wmText} onChange={(e) => setWmText(e.target.value)} />
          </Field>
        )}
        {op === 'compress' && (
          <Field label={`Qualität ${quality} %`}>
            <Slider value={quality} min={20} max={95} step={5} onChange={setQuality} />
          </Field>
        )}
      </FieldGroup>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {files.length ? `${files.length} Datei(en) ausgewählt` : 'Noch keine Dateien ausgewählt.'}
      </div>
      {busy && <Progress value={files.length ? done / files.length : -1} />}
    </Sheet>
  )
}
