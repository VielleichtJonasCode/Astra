import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Datei',
    rows: [
      ['⌘O', 'PDF öffnen'],
      ['⌘S', 'Sichern'],
      ['⇧⌘S', 'Sichern unter'],
      ['⇧⌘E', 'Exportieren'],
      ['⌘W', 'Tab schließen']
    ]
  },
  {
    title: 'Bearbeiten',
    rows: [
      ['⌘Z', 'Widerrufen'],
      ['⇧⌘Z', 'Wiederholen'],
      ['⌘C', 'Objekt kopieren'],
      ['⌘V', 'Objekt einfügen'],
      ['⌘F', 'Im Dokument suchen'],
      ['⌫ / ⌦', 'Auswahl löschen'],
      ['Esc', 'Werkzeug zurücksetzen']
    ]
  },
  {
    title: 'Ansicht',
    rows: [
      ['⌘+ / ⌘-', 'Zoomen'],
      ['⌘0', 'Tatsächliche Größe'],
      ['⌘1 / ⌘2', 'An Breite / Seite anpassen'],
      ['⌘R', 'Seite drehen'],
      ['⌥⌘N', 'Nachtmodus'],
      ['⌥⌘P', 'Präsentation']
    ]
  }
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Sheet
      title="Tastaturkurzbefehle"
      wide
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Fertig
        </Button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="fieldgroup__title" style={{ marginBottom: 8 }}>
              {g.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.rows.map(([k, v]) => (
                <div
                  key={k + v}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
