import { useMemo, useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { Segmented, TextInput, NumberInput } from '../common/controls'
import { toast } from '../common/toast'
import { computeSplitGroups, runSplit, type SplitMode } from '../../pdf/ops/split'
import { formatRanges } from '../../lib/ranges'

export function SplitDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const [mode, setMode] = useState<SplitMode>('single')
  const [ranges, setRanges] = useState('1-2, 3-4')
  const [n, setN] = useState(2)
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => computeSplitGroups(doc, { mode, ranges, n }), [doc, mode, ranges, n])

  const run = async (): Promise<void> => {
    const dir = await window.api.pickDirectory()
    if (!dir) return
    setBusy(true)
    try {
      const files = await runSplit(doc, dir, { mode, ranges, n })
      toast.success(`${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} erstellt.`, {
        label: 'Im Finder zeigen',
        run: () => window.api.showItemInFolder(files[0])
      })
      onClose()
    } catch (err) {
      toast.error('Teilen fehlgeschlagen.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="PDF teilen"
      subtitle={`„${doc.name}" · ${doc.pages.length} Seiten`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={busy || groups.length === 0}
            onClick={() => void run()}
          >
            {busy ? 'Erstelle …' : `${groups.length} Dateien speichern …`}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="Aufteilen">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: 'Einzelseiten' },
              { value: 'everyN', label: 'Alle N Seiten' },
              { value: 'ranges', label: 'Bereiche' }
            ]}
          />
        </Field>
        {mode === 'everyN' && (
          <Field label="Seiten pro Datei">
            <NumberInput value={n} min={1} max={doc.pages.length} onChange={setN} width={80} />
          </Field>
        )}
        {mode === 'ranges' && (
          <Field label="Bereiche" hint="Je Komma-Gruppe eine Datei, z. B. „1-3, 4-6, 7“">
            <TextInput value={ranges} onChange={(e) => setRanges(e.target.value)} />
          </Field>
        )}
      </FieldGroup>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Ergebnis: {groups.length} {groups.length === 1 ? 'Datei' : 'Dateien'}
        {groups.length > 0 && groups.length <= 12 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-tertiary)' }}>
            {groups.map((g, i) => (
              <li key={i}>
                {doc.name.replace(/\.pdf$/i, '')}-{i + 1}.pdf · Seiten {formatRanges(g)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
