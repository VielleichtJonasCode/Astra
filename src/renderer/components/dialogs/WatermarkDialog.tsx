import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { TextInput, Slider, Segmented, NumberInput } from '../common/controls'
import { ColorWell } from '../common/ColorWell'
import { toast } from '../common/toast'
import type { WatermarkConfig } from '../../pdf/model'
import { parsePageRanges } from '../../lib/ranges'

const DEFAULT: WatermarkConfig = {
  kind: 'text',
  text: 'ENTWURF',
  color: '#ff3b30',
  opacity: 0.18,
  rotation: 45,
  fontSize: 72,
  layout: 'diagonal',
  pages: []
}

export function WatermarkDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const [cfg, setCfg] = useState<WatermarkConfig>(doc.overlays.watermark ?? DEFAULT)
  const [rangeStr, setRangeStr] = useState(cfg.pages.map((p) => p + 1).join(', '))

  const apply = (remove = false): void => {
    mutate(doc.key, remove ? 'Wasserzeichen entfernen' : 'Wasserzeichen', (d) => {
      d.overlays.watermark = remove
        ? null
        : { ...cfg, pages: parsePageRanges(rangeStr, d.pages.length).map((i) => i + 1) }
    })
    toast.success(remove ? 'Wasserzeichen entfernt.' : 'Wasserzeichen angewendet.')
    onClose()
  }

  return (
    <Sheet
      title="Wasserzeichen"
      onClose={onClose}
      footer={
        <>
          {doc.overlays.watermark && (
            <Button variant="danger" onClick={() => apply(true)}>
              Entfernen
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={() => apply(false)}>
            Anwenden
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="Text">
          <TextInput value={cfg.text} onChange={(e) => setCfg({ ...cfg, text: e.target.value })} />
        </Field>
        <Field label="Anordnung">
          <Segmented
            value={cfg.layout}
            onChange={(layout) => setCfg({ ...cfg, layout })}
            options={[
              { value: 'diagonal', label: 'Diagonal' },
              { value: 'center', label: 'Zentriert' },
              { value: 'tiled', label: 'Gekachelt' }
            ]}
          />
        </Field>
        <Field label="Farbe">
          <ColorWell value={cfg.color} onChange={(color) => setCfg({ ...cfg, color })} />
        </Field>
        <Field label={`Deckkraft ${Math.round(cfg.opacity * 100)} %`}>
          <Slider
            value={Math.round(cfg.opacity * 100)}
            min={5}
            max={100}
            step={5}
            onChange={(v) => setCfg({ ...cfg, opacity: v / 100 })}
          />
        </Field>
        <Field label={`Drehung ${cfg.rotation}°`}>
          <Slider
            value={cfg.rotation}
            min={-90}
            max={90}
            step={5}
            onChange={(rotation) => setCfg({ ...cfg, rotation })}
          />
        </Field>
        <Field label="Schriftgröße">
          <NumberInput
            value={cfg.fontSize}
            min={12}
            max={240}
            step={4}
            suffix=" pt"
            width={90}
            onChange={(fontSize) => setCfg({ ...cfg, fontSize })}
          />
        </Field>
        <Field label="Seiten" hint="Leer = alle Seiten, z. B. „1-3, 5“">
          <TextInput value={rangeStr} onChange={(e) => setRangeStr(e.target.value)} />
        </Field>
      </FieldGroup>
    </Sheet>
  )
}
