import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { TextInput, Select, NumberInput } from '../common/controls'
import { ColorWell } from '../common/ColorWell'
import { toast } from '../common/toast'
import type { OverlayCorner, PageNumberConfig } from '../../pdf/model'
import { parsePageRanges } from '../../lib/ranges'

const DEFAULT: PageNumberConfig = {
  template: 'Seite {n} von {N}',
  prefix: '',
  start: 1,
  corner: 'bottom-center',
  fontSize: 10,
  color: '#555555',
  margin: 28,
  pages: []
}

const CORNERS: { value: OverlayCorner; label: string }[] = [
  { value: 'top-left', label: 'Oben links' },
  { value: 'top-center', label: 'Oben Mitte' },
  { value: 'top-right', label: 'Oben rechts' },
  { value: 'bottom-left', label: 'Unten links' },
  { value: 'bottom-center', label: 'Unten Mitte' },
  { value: 'bottom-right', label: 'Unten rechts' }
]

const PRESETS = [
  { label: 'Seite 1 von N', template: 'Seite {n} von {N}' },
  { label: 'Nur Zahl', template: '{n}' },
  { label: '– 1 –', template: '– {n} –' },
  { label: 'Bates', template: '{prefix}{n}' }
]

export function PageNumbersDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const [cfg, setCfg] = useState<PageNumberConfig>(doc.overlays.pageNumbers ?? DEFAULT)
  const [rangeStr, setRangeStr] = useState(cfg.pages.map((p) => p + 1).join(', '))

  const apply = (remove = false): void => {
    mutate(doc.key, remove ? 'Seitenzahlen entfernen' : 'Seitenzahlen', (d) => {
      d.overlays.pageNumbers = remove
        ? null
        : { ...cfg, pages: parsePageRanges(rangeStr, d.pages.length).map((i) => i + 1) }
    })
    toast.success(remove ? 'Seitenzahlen entfernt.' : 'Seitenzahlen angewendet.')
    onClose()
  }

  const isBates = cfg.template.includes('{prefix}')

  return (
    <Sheet
      title="Seitenzahlen / Bates"
      onClose={onClose}
      footer={
        <>
          {doc.overlays.pageNumbers && (
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
        <Field label="Vorlage">
          <Select
            value={PRESETS.find((p) => p.template === cfg.template)?.template ?? cfg.template}
            onChange={(e) => setCfg({ ...cfg, template: e.target.value })}
            options={PRESETS.map((p) => ({ value: p.template, label: p.label }))}
          />
        </Field>
        <Field label="Eigene Vorlage" hint="Platzhalter: {n} {N} {prefix}">
          <TextInput value={cfg.template} onChange={(e) => setCfg({ ...cfg, template: e.target.value })} />
        </Field>
        {isBates && (
          <Field label="Präfix">
            <TextInput value={cfg.prefix} onChange={(e) => setCfg({ ...cfg, prefix: e.target.value })} />
          </Field>
        )}
        <Field label="Startnummer">
          <NumberInput value={cfg.start} min={0} max={99999} onChange={(start) => setCfg({ ...cfg, start })} width={90} />
        </Field>
        <Field label="Position">
          <Select
            value={cfg.corner}
            onChange={(e) => setCfg({ ...cfg, corner: e.target.value as OverlayCorner })}
            options={CORNERS}
          />
        </Field>
        <Field label="Schriftgröße">
          <NumberInput value={cfg.fontSize} min={6} max={24} suffix=" pt" width={86} onChange={(fontSize) => setCfg({ ...cfg, fontSize })} />
        </Field>
        <Field label="Farbe">
          <ColorWell value={cfg.color} onChange={(color) => setCfg({ ...cfg, color })} />
        </Field>
        <Field label="Rand">
          <NumberInput value={cfg.margin} min={4} max={120} suffix=" pt" width={86} onChange={(margin) => setCfg({ ...cfg, margin })} />
        </Field>
        <Field label="Seiten" hint="Leer = alle">
          <TextInput value={rangeStr} onChange={(e) => setRangeStr(e.target.value)} />
        </Field>
      </FieldGroup>
    </Sheet>
  )
}
