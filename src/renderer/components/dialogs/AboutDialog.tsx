import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Icon } from '../common/Icon'

export function AboutDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Sheet
      title="Über PDF Studio"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          OK
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: 'linear-gradient(160deg, var(--accent), #5e5ce6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}
        >
          <Icon name="page" size={34} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>PDF Studio</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Version 0.1.0 · Apple Silicon</div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6, maxWidth: 380 }}>
          Ein voll ausgestatteter PDF-Editor auf Basis von Electron, React, pdf.js, pdf-lib und MuPDF.
          MuPDF steht unter AGPL-3.0.
        </p>
      </div>
    </Sheet>
  )
}
