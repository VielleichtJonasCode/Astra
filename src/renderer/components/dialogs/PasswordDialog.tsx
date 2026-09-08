import { useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { TextInput, Segmented } from '../common/controls'
import { toast } from '../common/toast'

export function PasswordDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))!
  const mutate = useDocStore((s) => s.mutate)
  const [mode, setMode] = useState<'set' | 'remove'>(doc.encryption ? 'set' : 'set')
  const [user, setUser] = useState(doc.encryption?.userPassword ?? '')
  const [owner, setOwner] = useState(doc.encryption?.ownerPassword ?? '')

  const apply = (): void => {
    mutate(doc.key, mode === 'set' ? 'Passwort setzen' : 'Passwort entfernen', (d) => {
      d.encryption =
        mode === 'remove'
          ? null
          : { userPassword: user || undefined, ownerPassword: owner || undefined }
    })
    toast.success(
      mode === 'remove'
        ? 'Passwort wird beim Sichern entfernt.'
        : 'Passwort wird beim Sichern gesetzt.'
    )
    onClose()
  }

  return (
    <Sheet
      title="Passwortschutz"
      subtitle="Wirkt beim Sichern / Exportieren"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={apply} disabled={mode === 'set' && !user && !owner}>
            Übernehmen
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="Aktion">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'set', label: 'Setzen' },
              { value: 'remove', label: 'Entfernen' }
            ]}
          />
        </Field>
        {mode === 'set' && (
          <>
            <Field label="Öffnen-Passwort" hint="Zum Öffnen des PDFs erforderlich">
              <TextInput type="password" value={user} onChange={(e) => setUser(e.target.value)} />
            </Field>
            <Field label="Rechte-Passwort" hint="Für Änderungen / Drucken (optional)">
              <TextInput type="password" value={owner} onChange={(e) => setOwner(e.target.value)} />
            </Field>
          </>
        )}
        {mode === 'remove' && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              margin: 0,
              gridColumn: '1 / -1'
            }}
          >
            Beim Sichern wird die Verschlüsselung entfernt (das PDF ist derzeit entsperrt geöffnet).
          </p>
        )}
      </FieldGroup>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
        Verschlüsselung: AES-256 (via MuPDF).
      </p>
    </Sheet>
  )
}
