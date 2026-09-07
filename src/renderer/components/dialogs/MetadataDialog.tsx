import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { TextInput } from '../common/controls'
import { toast } from '../common/toast'

export function MetadataDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const [m, setM] = useState(doc.metadata)

  const save = (): void => {
    mutate(doc.key, 'Metadaten ändern', (d) => {
      d.metadata = { ...m }
    })
    toast.success('Metadaten aktualisiert.')
    onClose()
  }

  const row = (label: string, key: keyof typeof m): JSX.Element => (
    <Field label={label}>
      <TextInput value={m[key]} onChange={(e) => setM({ ...m, [key]: e.target.value })} />
    </Field>
  )

  return (
    <Sheet
      title="Metadaten"
      subtitle={`„${doc.name}"`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save}>
            Übernehmen
          </Button>
        </>
      }
    >
      <FieldGroup>
        {row('Titel', 'title')}
        {row('Autor', 'author')}
        {row('Betreff', 'subject')}
        {row('Stichwörter', 'keywords')}
        {row('Programm', 'creator')}
      </FieldGroup>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
        Stichwörter durch Komma trennen. Änderungen greifen beim Sichern/Exportieren.
      </p>
    </Sheet>
  )
}
