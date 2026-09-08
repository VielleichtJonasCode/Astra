import { useEffect, useState } from 'react'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup, Divider } from '../common/Field'
import { Segmented, TextInput, Toggle } from '../common/controls'
import { toast } from '../common/toast'
import { useSettingsStore, applyTheme } from '../../store/settingsStore'
import { clearRecentApps } from '../../lib/recent'

export function SettingsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const {
    theme,
    converterOutputDir,
    pdfZoom,
    autoSign,
    geminiModel,
    setTheme,
    setConverterOutputDir,
    setPdfZoom,
    setAutoSign,
    setGeminiModel
  } = useSettingsStore()
  const [dir, setDir] = useState(converterOutputDir)
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiSaved, setGeminiSaved] = useState(false)

  useEffect(() => {
    void window.api.getSecret('geminiApiKey').then((k) => {
      if (k) {
        setGeminiKey(k.trim().replace(/^"|"$/g, ''))
        setGeminiSaved(true)
      }
    })
  }, [])

  const saveGemini = async (): Promise<void> => {
    await window.api.setSecret('geminiApiKey', geminiKey.trim())
    setGeminiSaved(Boolean(geminiKey.trim()))
    toast.success(geminiKey.trim() ? 'Gemini-Schlüssel gespeichert.' : 'Gemini-Schlüssel entfernt.')
  }

  const pickDir = async (): Promise<void> => {
    const chosen = await window.api.pickDirectory()
    if (chosen) {
      setDir(chosen)
      setConverterOutputDir(chosen)
    }
  }

  return (
    <Sheet
      title="Einstellungen"
      wide
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Fertig
        </Button>
      }
    >
      <FieldGroup title="Erscheinungsbild">
        <Field label="Design">
          <Segmented
            value={theme}
            onChange={(t) => {
              setTheme(t)
              applyTheme(t)
            }}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Hell' },
              { value: 'dark', label: 'Dunkel' }
            ]}
          />
        </Field>
      </FieldGroup>

      <Divider horizontal />

      <FieldGroup title="Konverter">
        <Field label="Ausgabe" hint="Wohin konvertierte Dateien standardmäßig geschrieben werden">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Segmented
              value={dir ? 'folder' : 'beside'}
              onChange={(m) => {
                if (m === 'beside') {
                  setDir(null)
                  setConverterOutputDir(null)
                } else {
                  void pickDir()
                }
              }}
              options={[
                { value: 'beside', label: 'Neben Original' },
                { value: 'folder', label: dir ? (dir.split('/').pop() ?? 'Ordner') : 'Ordner …' }
              ]}
            />
            {dir && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                {dir}
              </span>
            )}
          </div>
        </Field>
      </FieldGroup>

      <Divider horizontal />

      <FieldGroup title="PDF-Editor">
        <Field label="Standard-Zoom">
          <Segmented
            value={pdfZoom}
            onChange={setPdfZoom}
            options={[
              { value: 'fit-width', label: 'An Breite' },
              { value: 'fit-page', label: 'An Seite' }
            ]}
          />
        </Field>
        <Field
          label="Unterschriebene PDF signieren"
          hint="PDFs mit deiner Unterschrift bekommen beim Speichern zusätzlich die unsichtbare Mac-Signatur (prüfbar im Signatur-Werkzeug)."
        >
          <Toggle checked={autoSign} onChange={setAutoSign} label="Automatisch signieren" />
        </Field>
      </FieldGroup>

      <Divider horizontal />

      <FieldGroup title="Studienplaner · KI">
        <Field
          label="Gemini-Schlüssel"
          hint="Kostenlos bei Google AI Studio (aistudio.google.com/apikey). Nötig für Zusammenfassungen, Quiz, Fragen und Lernplan. Liegt lokal in userData/secrets, nie im Repo. Notiz-Inhalte werden dann an Google gesendet."
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextInput
              type="password"
              placeholder={geminiSaved ? '•••••••••• (gespeichert)' : 'AIza…'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              style={{ minWidth: 220, flex: 1 }}
            />
            <Button onClick={() => void saveGemini()}>Speichern</Button>
          </div>
        </Field>
        <Field
          label="Modell"
          hint="Leer = Standard (gemini-flash-latest, folgt Googles aktuellem Flash). Bei „Modell nicht verfügbar“ hier einen anderen Namen eintragen, z. B. gemini-2.5-flash."
        >
          <TextInput
            placeholder="gemini-flash-latest"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value.trim())}
            style={{ minWidth: 220 }}
          />
        </Field>
      </FieldGroup>

      <Divider horizontal />

      <FieldGroup title="Daten">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            onClick={() => {
              clearRecentApps()
              toast.success('Zuletzt-Liste geleert.')
            }}
          >
            Zuletzt-Liste löschen
          </Button>
          <Button
            onClick={() => {
              try {
                localStorage.removeItem('astra.signatures')
              } catch {
                /* ignore */
              }
              toast.success('Gespeicherte Unterschriften gelöscht.')
            }}
          >
            Unterschriften löschen
          </Button>
        </div>
      </FieldGroup>

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
        Astra 0.1.0 · AGPL-3.0 · Einstellungen liegen lokal (localStorage), nicht im Repo.
      </p>
    </Sheet>
  )
}
