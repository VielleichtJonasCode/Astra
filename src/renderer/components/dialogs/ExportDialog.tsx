import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { Select, TextInput, NumberInput } from '../common/controls'
import { toast } from '../common/toast'
import { buildOutputPdf } from '../../pdf/exportPdf'
import { exportPagesAsImages } from '../../pdf/ops/pageImages'
import { parsePageRanges, formatRanges } from '../../lib/ranges'

type Target = 'pdf' | 'pdf-range' | 'png' | 'jpeg'

export function ExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const selectedPages = useUiStore((s) => s.selectedPages)

  const [target, setTarget] = useState<Target>('pdf')
  const [range, setRange] = useState(
    selectedPages.length ? formatRanges(selectedPages) : `1-${doc.pages.length}`
  )
  const [dpi, setDpi] = useState(150)
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      if (target === 'pdf' || target === 'pdf-range') {
        const indices =
          target === 'pdf-range' ? parsePageRanges(range, doc.pages.length) : undefined
        if (target === 'pdf-range' && (!indices || indices.length === 0)) {
          toast.error('Kein gültiger Seitenbereich.')
          return
        }
        const path = await window.api.saveDialog({
          defaultName: doc.name.replace(
            /\.pdf$/i,
            target === 'pdf-range' ? '-auszug.pdf' : '-kopie.pdf'
          )
        })
        if (!path) return
        const bytes = await buildOutputPdf(doc, { pageIndices: indices })
        await window.api.writeFile(path, bytes)
        toast.success('Exportiert.', {
          label: 'Zeigen',
          run: () => window.api.showItemInFolder(path)
        })
      } else {
        const dir = await window.api.pickDirectory()
        if (!dir) return
        const indices = parsePageRanges(range, doc.pages.length)
        const files = await exportPagesAsImages(doc, dir, {
          format: target,
          dpi,
          pageIndices: indices.length ? indices : undefined
        })
        toast.success(`${files.length} Bilder exportiert.`, {
          label: 'Ordner zeigen',
          run: () => files[0] && window.api.showItemInFolder(files[0])
        })
      }
      onClose()
    } catch (err) {
      toast.error('Export fehlgeschlagen.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const isImage = target === 'png' || target === 'jpeg'

  return (
    <Sheet
      title="Exportieren"
      subtitle={`„${doc.name}"`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Exportiere …' : 'Exportieren …'}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="Als">
          <Select
            value={target}
            onChange={(e) => setTarget(e.target.value as Target)}
            options={[
              { value: 'pdf', label: 'PDF-Kopie (alle Seiten)' },
              { value: 'pdf-range', label: 'PDF – Seitenbereich' },
              { value: 'png', label: 'Bilder (PNG)' },
              { value: 'jpeg', label: 'Bilder (JPEG)' }
            ]}
          />
        </Field>
        {(target === 'pdf-range' || isImage) && (
          <Field label="Seiten" hint={isImage ? 'Leer = alle Seiten' : undefined}>
            <TextInput value={range} onChange={(e) => setRange(e.target.value)} />
          </Field>
        )}
        {isImage && (
          <Field label="Auflösung">
            <NumberInput
              value={dpi}
              min={72}
              max={600}
              step={24}
              suffix=" dpi"
              onChange={setDpi}
              width={100}
            />
          </Field>
        )}
      </FieldGroup>
    </Sheet>
  )
}
