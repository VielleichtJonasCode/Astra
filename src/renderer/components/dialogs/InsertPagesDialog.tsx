import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { PDFDocument } from 'pdf-lib'
import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { Sheet } from '../common/Sheet'
import { Button } from '../common/Button'
import { Field, FieldGroup } from '../common/Field'
import { Select } from '../common/controls'
import { toast } from '../common/toast'
import type { PageModel } from '../../pdf/model'
import { bytesToBlob } from '../../lib/bytes'

const PT = 72 / 96

async function imageSize(bytes: Uint8Array, mime: string): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(bytesToBlob(bytes, mime))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { w: img.naturalWidth, h: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function InsertPagesDialog({
  kind,
  onClose
}: {
  kind: 'image' | 'pdf'
  onClose: () => void
}): JSX.Element {
  const key = useDocStore((s) => s.activeKey)!
  const pageCount = useDocStore((s) => s.docs[key]?.pages.length ?? 0)
  const mutate = useDocStore((s) => s.mutate)
  const currentPage = useUiStore((s) => s.currentPage)
  const [posMode, setPosMode] = useState<'start' | 'afterCurrent' | 'end'>('afterCurrent')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const atIndex = (): number =>
    posMode === 'start' ? 0 : posMode === 'end' ? pageCount : currentPage

  const insertImages = async (files: FileList): Promise<void> => {
    setBusy(true)
    try {
      const newPages: { assetBytes: Uint8Array; mime: string; w: number; h: number }[] = []
      for (const f of Array.from(files)) {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const mime = f.type || 'image/png'
        const { w, h } = await imageSize(bytes, mime)
        newPages.push({ assetBytes: bytes, mime, w, h })
      }
      mutate(key, 'Seiten aus Bild', (d) => {
        const models: PageModel[] = newPages.map((p) => {
          const assetId = nanoid(10)
          d.assets[assetId] = { id: assetId, type: 'image', mime: p.mime, bytes: p.assetBytes }
          const width = Math.max(1, p.w * PT)
          const height = Math.max(1, p.h * PT)
          return {
            id: nanoid(10),
            source: { kind: 'image', assetId, width, height },
            rotation: 0,
            baseWidth: width,
            baseHeight: height
          }
        })
        d.pages.splice(atIndex(), 0, ...models)
      })
      toast.success(`${newPages.length} ${newPages.length === 1 ? 'Seite' : 'Seiten'} eingefügt.`)
      onClose()
    } catch (err) {
      toast.error('Bild konnte nicht eingefügt werden.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const insertPdf = async (): Promise<void> => {
    const files = await window.api.openDialog()
    if (!files || !files.length) return
    setBusy(true)
    try {
      for (const file of files) {
        const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes)
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const sizes = src.getPages().map((p) => p.getSize())
        mutate(key, 'Seiten aus PDF', (d) => {
          const assetId = nanoid(10)
          d.assets[assetId] = { id: assetId, type: 'pdf', mime: 'application/pdf', bytes }
          const models: PageModel[] = sizes.map((s, i) => ({
            id: nanoid(10),
            source: { kind: 'external', docKey: assetId, index: i },
            rotation: 0,
            baseWidth: s.width,
            baseHeight: s.height
          }))
          d.pages.splice(atIndex(), 0, ...models)
        })
      }
      toast.success('Seiten eingefügt.')
      onClose()
    } catch (err) {
      toast.error('PDF konnte nicht eingefügt werden.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={kind === 'image' ? 'Seiten aus Bild' : 'Seiten aus PDF'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          {kind === 'image' ? (
            <Button variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              Bilder wählen …
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void insertPdf()}>
              PDF wählen …
            </Button>
          )}
        </>
      }
    >
      <FieldGroup>
        <Field label="Einfügen">
          <Select
            value={posMode}
            onChange={(e) => setPosMode(e.target.value as typeof posMode)}
            options={[
              { value: 'start', label: 'Am Anfang' },
              { value: 'afterCurrent', label: `Nach Seite ${currentPage}` },
              { value: 'end', label: 'Am Ende' }
            ]}
          />
        </Field>
      </FieldGroup>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        multiple
        hidden
        onChange={(e) => e.target.files && void insertImages(e.target.files)}
      />
    </Sheet>
  )
}
