import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { AstraMark } from '../AstraMark'

export function AboutDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Sheet
      title="Über Astra"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          OK
        </Button>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          textAlign: 'center'
        }}
      >
        <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
          <AstraMark size={76} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Astra</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Version 0.1.0 · Apple Silicon
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            lineHeight: 1.6,
            maxWidth: 400
          }}
        >
          Werkzeugsammlung für macOS mit einem voll ausgestatteten PDF-Editor. Basiert auf Electron,
          React, pdf.js, pdf-lib, MuPDF und Tesseract. Lizenz: AGPL-3.0-or-later (wegen MuPDF).
        </p>
      </div>
    </Sheet>
  )
}
