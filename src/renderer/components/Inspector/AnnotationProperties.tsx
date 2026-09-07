import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import type { Annotation, StandardFont } from '../../pdf/model'
import { FONT_LABELS } from '../../pdf/fonts'
import { Field, FieldGroup } from '../common/Field'
import { Button } from '../common/Button'
import { ColorWell } from '../common/ColorWell'
import { Segmented, Select, NumberInput, Slider, Checkbox } from '../common/controls'

export function AnnotationProperties({ docKey }: { docKey: string }): JSX.Element | null {
  const selectedIds = useUiStore((s) => s.selectedAnnotations)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const annos = useDocStore((s) => s.docs[docKey]?.annotations ?? {})
  const update = useDocStore((s) => s.updateAnnotation)
  const remove = useDocStore((s) => s.removeAnnotations)

  const all: Annotation[] = Object.values(annos).flat()
  const a = all.find((x) => selectedIds.includes(x.id))
  if (!a) return null

  const set = (patch: Partial<Annotation>): void => update(docKey, a.id, patch)
  const setStyle = (patch: Partial<Extract<Annotation, { kind: 'text' }>['style']>): void => {
    if (a.kind === 'text') update(docKey, a.id, { style: { ...a.style, ...patch } })
  }

  return (
    <>
      <FieldGroup title={kindLabel(a.kind)}>
        {a.kind === 'text' && (
          <>
            <Field label="Schrift">
              <Select
                value={a.style.font}
                onChange={(e) => setStyle({ font: e.target.value as StandardFont })}
                options={(Object.keys(FONT_LABELS) as StandardFont[]).map((f) => ({
                  value: f,
                  label: FONT_LABELS[f]
                }))}
              />
            </Field>
            <Field label="Größe">
              <NumberInput
                value={a.style.size}
                min={4}
                max={200}
                step={1}
                suffix=" pt"
                width={88}
                onChange={(size) => setStyle({ size })}
              />
            </Field>
            <Field label="Farbe">
              <ColorWell value={a.style.color} onChange={(color) => setStyle({ color })} />
            </Field>
            <Field label="Ausrichtung">
              <Segmented
                value={a.style.align}
                onChange={(align) => setStyle({ align })}
                options={[
                  { value: 'left', label: 'Links' },
                  { value: 'center', label: 'Mitte' },
                  { value: 'right', label: 'Rechts' }
                ]}
              />
            </Field>
            <Field label="Hintergrund">
              <Checkbox
                checked={!!a.cover}
                onChange={(on) => set({ cover: on ? { color: '#ffffff' } : null })}
              >
                Fläche darunter decken
              </Checkbox>
            </Field>
            {a.cover && (
              <Field label="Deckfarbe">
                <ColorWell
                  value={a.cover.color}
                  onChange={(color) => set({ cover: { color } })}
                />
              </Field>
            )}
          </>
        )}

        {(a.kind === 'highlight' || a.kind === 'underline' || a.kind === 'strikeout') && (
          <Field label="Farbe">
            <ColorWell value={a.color} onChange={(color) => set({ color })} />
          </Field>
        )}

        {(a.kind === 'rect' || a.kind === 'ellipse' || a.kind === 'line' || a.kind === 'arrow') && (
          <>
            <Field label="Linie">
              <ColorWell value={a.stroke} onChange={(stroke) => set({ stroke })} />
            </Field>
            <Field label="Stärke">
              <Slider
                value={a.strokeWidth}
                min={0.5}
                max={16}
                step={0.5}
                onChange={(strokeWidth) => set({ strokeWidth })}
              />
            </Field>
            {(a.kind === 'rect' || a.kind === 'ellipse') && (
              <Field label="Füllung">
                <Checkbox
                  checked={!!a.fill}
                  onChange={(on) => set({ fill: on ? a.stroke : null })}
                >
                  Füllen
                </Checkbox>
              </Field>
            )}
            {(a.kind === 'rect' || a.kind === 'ellipse') && a.fill && (
              <Field label="Füllfarbe">
                <ColorWell value={a.fill} onChange={(fill) => set({ fill })} />
              </Field>
            )}
          </>
        )}

        {a.kind === 'ink' && (
          <>
            <Field label="Farbe">
              <ColorWell value={a.color} onChange={(color) => set({ color })} />
            </Field>
            <Field label="Stärke">
              <Slider value={a.width} min={0.5} max={16} step={0.5} onChange={(width) => set({ width })} />
            </Field>
          </>
        )}

        {a.kind === 'note' && (
          <>
            <Field label="Farbe">
              <ColorWell value={a.color} onChange={(color) => set({ color })} />
            </Field>
            <Field label="Text" stack>
              <textarea
                className="input"
                rows={3}
                value={a.text}
                onChange={(e) => set({ text: e.target.value })}
              />
            </Field>
          </>
        )}

        {a.kind === 'stamp' && (
          <>
            <Field label="Text">
              <input
                className="input"
                value={a.label}
                onChange={(e) => set({ label: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Farbe">
              <ColorWell value={a.color} onChange={(color) => set({ color })} />
            </Field>
          </>
        )}
      </FieldGroup>

      <FieldGroup title="Allgemein">
        <Field label="Deckkraft">
          <Slider
            value={Math.round((a.opacity ?? 1) * 100)}
            min={10}
            max={100}
            step={5}
            onChange={(v) => set({ opacity: v / 100 })}
          />
        </Field>
        <Field label="Position">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(a.rect.x)}, {Math.round(a.rect.y)} · {Math.round(a.rect.width)}×
            {Math.round(a.rect.height)} pt
          </span>
        </Field>
      </FieldGroup>

      <Button
        variant="danger"
        icon="trash"
        block
        onClick={() => {
          remove(docKey, [a.id])
          clearSelection()
        }}
      >
        Objekt löschen
      </Button>
    </>
  )
}

function kindLabel(kind: Annotation['kind']): string {
  const map: Record<Annotation['kind'], string> = {
    text: 'Text',
    highlight: 'Hervorhebung',
    underline: 'Unterstreichung',
    strikeout: 'Durchstreichung',
    ink: 'Freihand',
    rect: 'Rechteck',
    ellipse: 'Ellipse',
    line: 'Linie',
    arrow: 'Pfeil',
    image: 'Bild',
    note: 'Notiz',
    stamp: 'Stempel',
    signature: 'Unterschrift'
  }
  return map[kind]
}
