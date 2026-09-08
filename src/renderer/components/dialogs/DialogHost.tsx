import { useDialogStore, type DialogId } from '../../store/dialogStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { ShortcutsDialog } from './ShortcutsDialog'
import { AboutDialog } from './AboutDialog'
import { ResizeDialog } from './ResizeDialog'
import { SplitDialog } from './SplitDialog'
import { ExportDialog } from './ExportDialog'
import { InsertPagesDialog } from './InsertPagesDialog'
import { MetadataDialog } from './MetadataDialog'
import { WatermarkDialog } from './WatermarkDialog'
import { PageNumbersDialog } from './PageNumbersDialog'
import { HeaderFooterDialog } from './HeaderFooterDialog'
import { MergeDialog } from './MergeDialog'
import { CompressDialog } from './CompressDialog'
import { PasswordDialog } from './PasswordDialog'
import { OcrDialog } from './OcrDialog'
import { BatchDialog } from './BatchDialog'
import { RedactAssistantDialog } from './RedactAssistantDialog'
import { SignatureDialog } from './SignatureDialog'
import { SettingsDialog } from './SettingsDialog'

const TITLES: Partial<Record<DialogId, string>> = {}

export function DialogHost(): JSX.Element | null {
  const active = useDialogStore((s) => s.active)
  const close = useDialogStore((s) => s.close)
  if (!active) return null

  switch (active) {
    case 'shortcuts':
      return <ShortcutsDialog onClose={close} />
    case 'about':
      return <AboutDialog onClose={close} />
    case 'resize':
      return <ResizeDialog onClose={close} />
    case 'split':
      return <SplitDialog onClose={close} />
    case 'export':
    case 'extract':
      return <ExportDialog onClose={close} />
    case 'insertImage':
      return <InsertPagesDialog kind="image" onClose={close} />
    case 'insertPdf':
      return <InsertPagesDialog kind="pdf" onClose={close} />
    case 'metadata':
      return <MetadataDialog onClose={close} />
    case 'watermark':
      return <WatermarkDialog onClose={close} />
    case 'pageNumbers':
      return <PageNumbersDialog onClose={close} />
    case 'headerFooter':
      return <HeaderFooterDialog onClose={close} />
    case 'merge':
      return <MergeDialog onClose={close} />
    case 'compress':
      return <CompressDialog onClose={close} />
    case 'password':
      return <PasswordDialog onClose={close} />
    case 'ocr':
      return <OcrDialog onClose={close} />
    case 'batch':
      return <BatchDialog onClose={close} />
    case 'redactAssistant':
      return <RedactAssistantDialog onClose={close} />
    case 'signature':
      return <SignatureDialog onClose={close} />
    case 'preferences':
      return <SettingsDialog onClose={close} />
    default:
      return (
        <Sheet
          title={TITLES[active] ?? 'Bald verfügbar'}
          subtitle="Dieser Dialog wird in einer der nächsten Phasen umgesetzt."
          onClose={close}
          footer={
            <Button variant="primary" onClick={close}>
              OK
            </Button>
          }
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            Die Funktion „{TITLES[active] ?? active}" ist im Bauplan vorgesehen und folgt in Kürze.
          </p>
        </Sheet>
      )
  }
}
