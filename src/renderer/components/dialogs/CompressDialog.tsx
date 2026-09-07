import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { Segmented, Slider } from '../common/controls'
import { toast } from '../common/toast'
import { buildOutputPdf } from '../../pdf/exportPdf'

const PRESETS = {
  screen: { imageDpi: 96, quality: 55, label: 'Bildschirm (klein)' },
  ebook: { imageDpi: 150, quality: 72, label: 'E-Book (ausgewogen)' },
  print: { imageDpi: 220, quality: 88, label: 'Druck (hohe Qualität)' }
}

export function CompressDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const [preset, setPreset] = useState<keyof typeof PRESETS>('ebook')
  const [quality, setQuality] = useState(PRESETS.ebook.quality)
  const [busy, setBusy] = useState(false)

  const chosen = { imageDpi: PRESETS[preset].imageDpi, quality }

  const saveCopy = async (): Promise<void> => {
    const path = await window.api.saveDialog({
      defaultName: doc.name.replace(/\.pdf$/i, '-komprimiert.pdf')
    })
    if (!path) return
    setBusy(true)
    const id = toast.info('Komprimiere …')
    try {
      mutate(doc.key, 'Komprimierung', (d) => {
        d.postProcess.compress = chosen
      })
      const bytes = await buildOutputPdf(useDocStore.getState().getDoc(doc.key)!)
      await window.api.writeFile(path, bytes)
      toast.dismiss(id)
      toast.success('Komprimierte Kopie gesichert.', {
        label: 'Zeigen',
        run: () => window.api.showItemInFolder(path)
      })
      onClose()
    } catch (err) {
      toast.dismiss(id)
      toast.error('Komprimierung fehlgeschlagen.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Komprimieren"
      subtitle={`„${doc.name}"`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={busy} onClick={() => void saveCopy()}>
            {busy ? 'Komprimiere …' : 'Als Kopie sichern …'}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="Profil">
          <Segmented
            value={preset}
            onChange={(p) => {
              setPreset(p)
              setQuality(PRESETS[p].quality)
            }}
            options={(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => ({
              value: k,
              label: PRESETS[k].label
            }))}
          />
        </Field>
        <Field label={`Bildqualität ${quality} %`}>
          <Slider value={quality} min={20} max={95} step={5} onChange={setQuality} />
        </Field>
        <Field label="Bild-Auflösung">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            bis {chosen.imageDpi} dpi
          </span>
        </Field>
      </FieldGroup>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
        Bilder werden neu codiert, Objektströme optimiert (MuPDF). Text bleibt unverändert.
      </p>
    </Sheet>
  )
}
