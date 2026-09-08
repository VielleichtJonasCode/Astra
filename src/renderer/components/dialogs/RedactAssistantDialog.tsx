import { useState } from 'react'
import { nanoid } from 'nanoid'
import { useDocStore } from '../../store/docStore'
import { usePdfProxy } from '../../pdf/pdfProxy'
import { searchDocument, searchDocumentRegex } from '../../pdf/searchPdf'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup, Divider } from '../common/Field'
import { TextInput, Checkbox, Segmented } from '../common/controls'
import { Spinner } from '../common/misc'
import { toast } from '../common/toast'

const PRESETS: { id: string; label: string; regex: RegExp }[] = [
  {
    id: 'email',
    label: 'E-Mail-Adressen',
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  },
  {
    id: 'phone',
    label: 'Telefonnummern',
    regex: /(?:\+?\d{1,3}[ /-]?)?\(?\d{2,5}\)?[ /-]?\d[\d ./-]{4,}\d/g
  },
  { id: 'iban', label: 'IBAN', regex: /[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){3,7}[A-Z0-9]{1,4}/g },
  { id: 'card', label: 'Kreditkartennummern', regex: /\b(?:\d[ -]?){13,16}\b/g }
]

export function RedactAssistantDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const { proxy } = usePdfProxy(doc.key)

  const [active, setActive] = useState<Record<string, boolean>>({ email: true })
  const [customMode, setCustomMode] = useState<'text' | 'regex'>('text')
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  const run = async (apply: boolean): Promise<void> => {
    if (!proxy) return
    setBusy(true)
    try {
      const all: {
        pageIndex: number
        rect: { x: number; y: number; width: number; height: number }
      }[] = []
      for (const p of PRESETS) {
        if (active[p.id]) all.push(...(await searchDocumentRegex(proxy, doc.pages, p.regex)))
      }
      if (custom.trim()) {
        if (customMode === 'regex') {
          try {
            all.push(...(await searchDocumentRegex(proxy, doc.pages, new RegExp(custom, 'gi'))))
          } catch {
            toast.error('Ungültiger regulärer Ausdruck.')
            return
          }
        } else {
          all.push(...(await searchDocument(proxy, doc.pages, custom)))
        }
      }

      setCount(all.length)
      if (!apply) return
      if (all.length === 0) {
        toast.info('Keine Treffer gefunden.')
        return
      }
      mutate(doc.key, 'Schwärzungen (Assistent)', (d) => {
        for (const m of all) {
          const page = d.pages[m.pageIndex - 1]
          if (!page) continue
          ;(d.redactions[page.id] ??= []).push({
            id: nanoid(10),
            pageId: page.id,
            rect: { ...m.rect },
            fill: '#000000'
          })
        }
      })
      toast.success(`${all.length} Bereiche zum Schwärzen markiert.`)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Redaktions-Assistent"
      subtitle="Sensible Daten automatisch finden und schwärzen"
      onClose={onClose}
      footer={
        <>
          <Button disabled={busy || !proxy} onClick={() => void run(false)}>
            Vorschau
          </Button>
          <span className="spacer" />
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={busy || !proxy} onClick={() => void run(true)}>
            {busy ? <Spinner size={14} /> : 'Markieren'}
          </Button>
        </>
      }
    >
      <FieldGroup title="Muster">
        {PRESETS.map((p) => (
          <Checkbox
            key={p.id}
            checked={!!active[p.id]}
            onChange={(v) => setActive((cur) => ({ ...cur, [p.id]: v }))}
          >
            {p.label}
          </Checkbox>
        ))}
      </FieldGroup>
      <Divider horizontal />
      <FieldGroup title="Eigener Begriff">
        <Field label="Suche als">
          <Segmented
            value={customMode}
            onChange={setCustomMode}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'regex', label: 'Regex' }
            ]}
          />
        </Field>
        <Field label="Begriff" stack>
          <TextInput
            value={custom}
            placeholder={customMode === 'regex' ? '\\d{4,}' : 'z. B. Projektname'}
            onChange={(e) => setCustom(e.target.value)}
          />
        </Field>
      </FieldGroup>
      {count !== null && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          {count} Treffer gefunden.
        </p>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
        Die eigentliche Entfernung geschieht beim Sichern/Exportieren (echte Redaktion via MuPDF).
      </p>
    </Sheet>
  )
}
