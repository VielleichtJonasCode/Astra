import { useState } from 'react'
import { usePasswordStore } from '../../store/passwordStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { TextInput } from '../common/controls'
import { Field } from '../common/Field'

export function PasswordPromptHost(): JSX.Element | null {
  const request = usePasswordStore((s) => s.request)
  const submit = usePasswordStore((s) => s.submit)
  const cancel = usePasswordStore((s) => s.cancel)
  const [value, setValue] = useState('')

  if (!request) return null

  return (
    <Sheet
      title="Passwort erforderlich"
      subtitle={
        request.reason === 'wrong'
          ? 'Das Passwort war falsch. Bitte erneut versuchen.'
          : `„${request.docName}" ist passwortgeschützt.`
      }
      onClose={cancel}
      footer={
        <>
          <Button onClick={cancel}>Abbrechen</Button>
          <Button
            variant="primary"
            onClick={() => {
              submit(value)
              setValue('')
            }}
          >
            Öffnen
          </Button>
        </>
      }
    >
      <Field label="Passwort" stack>
        <TextInput
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submit(value)
              setValue('')
            }
          }}
        />
      </Field>
    </Sheet>
  )
}
