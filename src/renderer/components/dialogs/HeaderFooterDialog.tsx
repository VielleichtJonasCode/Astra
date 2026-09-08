import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup, Divider } from '../common/Field'
import { TextInput, NumberInput } from '../common/controls'
import { ColorWell } from '../common/ColorWell'
import { toast } from '../common/toast'
import type { HeaderFooterConfig } from '../../pdf/model'
import { parsePageRanges } from '../../lib/ranges'

const EMPTY = { left: '', center: '', right: '' }
const DEFAULT: HeaderFooterConfig = {
  header: { ...EMPTY },
  footer: { left: '{title}', center: '', right: '{date}' },
  fontSize: 9,
  color: '#666666',
  margin: 24,
  pages: []
}

export function HeaderFooterDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const [cfg, setCfg] = useState<HeaderFooterConfig>(doc.overlays.headerFooter ?? DEFAULT)
  const [rangeStr, setRangeStr] = useState(cfg.pages.map((p) => p + 1).join(', '))

  const band = (which: 'header' | 'footer', pos: 'left' | 'center' | 'right', v: string): void =>
    setCfg({ ...cfg, [which]: { ...cfg[which], [pos]: v } })

  const apply = (remove = false): void => {
    mutate(doc.key, remove ? 'Kopf-/Fußzeile entfernen' : 'Kopf-/Fußzeile', (d) => {
      d.overlays.headerFooter = remove
        ? null
        : { ...cfg, pages: parsePageRanges(rangeStr, d.pages.length).map((i) => i + 1) }
    })
    toast.success(remove ? 'Entfernt.' : 'Angewendet.')
    onClose()
  }

  const triple = (which: 'header' | 'footer'): JSX.Element => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
      {(['left', 'center', 'right'] as const).map((pos) => (
        <TextInput
          key={pos}
          placeholder={pos === 'left' ? 'links' : pos === 'center' ? 'mitte' : 'rechts'}
          value={cfg[which][pos]}
          onChange={(e) => band(which, pos, e.target.value)}
        />
      ))}
    </div>
  )

  return (
    <Sheet
      title="Kopf- & Fußzeile"
      wide
      onClose={onClose}
      footer={
        <>
          {doc.overlays.headerFooter && (
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
      <FieldGroup title="Kopfzeile">{triple('header')}</FieldGroup>
      <FieldGroup title="Fußzeile">{triple('footer')}</FieldGroup>
      <Divider horizontal />
      <FieldGroup>
        <Field label="Schriftgröße">
          <NumberInput
            value={cfg.fontSize}
            min={6}
            max={18}
            suffix=" pt"
            width={84}
            onChange={(fontSize) => setCfg({ ...cfg, fontSize })}
          />
        </Field>
        <Field label="Farbe">
          <ColorWell value={cfg.color} onChange={(color) => setCfg({ ...cfg, color })} />
        </Field>
        <Field label="Rand">
          <NumberInput
            value={cfg.margin}
            min={8}
            max={96}
            suffix=" pt"
            width={84}
            onChange={(margin) => setCfg({ ...cfg, margin })}
          />
        </Field>
        <Field label="Seiten" hint="Leer = alle">
          <TextInput value={rangeStr} onChange={(e) => setRangeStr(e.target.value)} />
        </Field>
      </FieldGroup>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
        Platzhalter: {'{page}'} {'{pages}'} {'{date}'} {'{title}'} {'{filename}'}
      </p>
    </Sheet>
  )
}
