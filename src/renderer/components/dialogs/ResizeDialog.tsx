import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { PAGE_FORMATS } from '../../pdf/model'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { Segmented, Select, NumberInput, Checkbox, Slider } from '../common/controls'
import { toast } from '../common/toast'

export function ResizeDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const key = useDocStore((s) => s.activeKey)!
  const pageCount = useDocStore((s) => s.docs[key]?.pages.length ?? 0)
  const mutate = useDocStore((s) => s.mutate)
  const selectedPages = useUiStore((s) => s.selectedPages)

  const [scope, setScope] = useState<'selected' | 'all'>(selectedPages.length ? 'selected' : 'all')
  const [mode, setMode] = useState<'scale' | 'format'>('scale')
  const [scale, setScale] = useState(100)
  const [format, setFormat] = useState('A4')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [fitContent, setFitContent] = useState(true)

  const targets =
    scope === 'selected' && selectedPages.length
      ? [...selectedPages].sort((a, b) => a - b)
      : Array.from({ length: pageCount }, (_, i) => i)

  const apply = (): void => {
    mutate(key, mode === 'scale' ? 'Seiten skalieren' : 'Format ändern', (d) => {
      for (const i of targets) {
        const p = d.pages[i]
        if (!p) continue
        if (mode === 'scale') {
          p.scale = scale / 100
          p.resizeTo = undefined
        } else {
          const f = PAGE_FORMATS[format]
          const w = orientation === 'portrait' ? f.width : f.height
          const h = orientation === 'portrait' ? f.height : f.width
          p.resizeTo = { width: w, height: h }
          p.scale = fitContent ? Math.min(w / p.baseWidth, h / p.baseHeight) : 1
        }
      }
    })
    toast.success(`${targets.length} ${targets.length === 1 ? 'Seite' : 'Seiten'} angepasst.`)
    onClose()
  }

  return (
    <Sheet
      title="Größe & Format ändern"
      subtitle={`${targets.length} von ${pageCount} Seiten`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={apply}>
            Anwenden
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="Anwenden auf">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'selected', label: `Auswahl (${selectedPages.length})` },
              { value: 'all', label: 'Alle Seiten' }
            ]}
          />
        </Field>
        <Field label="Methode">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'scale', label: 'Skalieren' },
              { value: 'format', label: 'Auf Format' }
            ]}
          />
        </Field>
      </FieldGroup>

      {mode === 'scale' ? (
        <FieldGroup title="Skalierung">
          <Field label={`${scale} %`}>
            <Slider value={scale} min={10} max={400} step={5} onChange={setScale} />
          </Field>
          <Field label="Genau">
            <NumberInput value={scale} min={10} max={400} step={5} suffix=" %" onChange={setScale} width={90} />
          </Field>
        </FieldGroup>
      ) : (
        <FieldGroup title="Zielformat">
          <Field label="Format">
            <Select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              options={Object.keys(PAGE_FORMATS).map((k) => ({ value: k, label: k }))}
            />
          </Field>
          <Field label="Ausrichtung">
            <Segmented
              value={orientation}
              onChange={setOrientation}
              options={[
                { value: 'portrait', label: 'Hoch' },
                { value: 'landscape', label: 'Quer' }
              ]}
            />
          </Field>
          <Field label="Inhalt">
            <Checkbox checked={fitContent} onChange={setFitContent}>
              Inhalt einpassen &amp; zentrieren
            </Checkbox>
          </Field>
        </FieldGroup>
      )}
    </Sheet>
  )
}
