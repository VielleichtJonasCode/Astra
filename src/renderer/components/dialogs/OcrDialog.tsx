import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { usePdfProxy } from '../../pdf/pdfProxy'
import { ocrDocument, ocrLinesToAnnotations, type OcrProgress } from '../../pdf/ops/ocr'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { Checkbox } from '../common/controls'
import { Progress } from '../common/misc'
import { toast } from '../common/toast'

const LANGS = [
  { id: 'deu', label: 'Deutsch' },
  { id: 'eng', label: 'Englisch' },
  { id: 'fra', label: 'Französisch' },
  { id: 'spa', label: 'Spanisch' },
  { id: 'ita', label: 'Italienisch' }
]

export function OcrDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const { proxy } = usePdfProxy(doc.key)

  const [langs, setLangs] = useState<Record<string, boolean>>({ deu: true, eng: true })
  const [addLayer, setAddLayer] = useState(true)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<OcrProgress | null>(null)
  const [text, setText] = useState('')

  const run = async (): Promise<void> => {
    if (!proxy) return
    const chosen = Object.keys(langs).filter((k) => langs[k])
    if (!chosen.length) return
    setBusy(true)
    setText('')
    const id = toast.info('OCR wird vorbereitet …')
    try {
      const results = await ocrDocument(proxy, doc.pages, {
        langs: chosen,
        onProgress: setProg
      })
      toast.dismiss(id)
      setText(results.map((r) => `— Seite ${r.pageIndex} —\n${r.text}`).join('\n\n'))

      if (addLayer) {
        mutate(doc.key, 'OCR-Textlayer', (d) => {
          for (const r of results) {
            const page = d.pages[r.pageIndex - 1]
            if (!page) continue
            ;(d.annotations[page.id] ??= []).push(...ocrLinesToAnnotations(r, page.id))
          }
        })
        toast.success('Durchsuchbarer Textlayer hinzugefügt.')
      } else {
        toast.success('Texterkennung abgeschlossen.')
      }
    } catch (err) {
      toast.dismiss(id)
      toast.error(err instanceof Error ? err.message : 'OCR fehlgeschlagen.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
      setProg(null)
    }
  }

  const saveTxt = async (): Promise<void> => {
    const path = await window.api.saveDialog({
      defaultName: doc.name.replace(/\.pdf$/i, '.txt'),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (!path) return
    await window.api.writeFile(path, new TextEncoder().encode(text))
    toast.success('Text gesichert.')
  }

  return (
    <Sheet
      title="OCR / Texterkennung"
      subtitle="Gescannte Seiten durchsuchbar machen"
      wide
      onClose={onClose}
      footer={
        <>
          {text && (
            <Button icon="download" onClick={() => void saveTxt()}>
              Als .txt sichern
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose}>Schließen</Button>
          <Button variant="primary" disabled={busy || !proxy} onClick={() => void run()}>
            {busy ? 'Läuft …' : 'Starten'}
          </Button>
        </>
      }
    >
      <FieldGroup title="Sprachen">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {LANGS.map((l) => (
            <Checkbox
              key={l.id}
              checked={!!langs[l.id]}
              onChange={(v) => setLangs((cur) => ({ ...cur, [l.id]: v }))}
            >
              {l.label}
            </Checkbox>
          ))}
        </div>
      </FieldGroup>
      <Field label="">
        <Checkbox checked={addLayer} onChange={setAddLayer}>
          Durchsuchbaren Textlayer ins PDF einfügen
        </Checkbox>
      </Field>

      {busy && prog && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Seite {prog.page} / {prog.total} · {prog.status}
          </div>
          <Progress value={prog.total ? prog.page / prog.total : -1} />
        </div>
      )}

      {text && (
        <textarea
          className="input"
          readOnly
          value={text}
          style={{ height: 200, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
      )}
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
        Sprachdaten (~10–15 MB je Sprache) werden beim ersten Mal geladen und lokal zwischengespeichert.
      </p>
    </Sheet>
  )
}
