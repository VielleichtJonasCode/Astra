import { useState } from 'react'
import { nanoid } from 'nanoid'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { PDFDocument } from 'pdf-lib'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button, IconButton } from '../common/Button'
import { Icon } from '../common/Icon'
import { toast } from '../common/toast'
import { mergePdfs, type MergeSource } from '../../pdf/ops/merge'

interface Item {
  uid: string
  name: string
  bytes: Uint8Array
  pageCount: number
}

function Row({ item, onRemove }: { item: Item; onRemove: () => void }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.uid
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'var(--bg-input)',
        boxShadow: 'inset 0 0 0 1px var(--border)'
      }}
      {...attributes}
      {...listeners}
    >
      <span style={{ color: 'var(--text-tertiary)', cursor: 'grab' }}>
        <Icon name="grip" size={16} />
      </span>
      <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.name}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {item.pageCount} {item.pageCount === 1 ? 'Seite' : 'Seiten'}
      </span>
      <IconButton name="x" label="Entfernen" onClick={onRemove} />
    </div>
  )
}

export function MergeDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const openDocs = useDocStore((s) => s.order.map((k) => s.docs[k]).filter(Boolean))
  const openFiles = useDocStore((s) => s.openFiles)

  const [items, setItems] = useState<Item[]>(() =>
    openDocs.map((d) => ({
      uid: nanoid(8),
      name: d.name,
      bytes: d.originalBytes,
      pageCount: d.pages.length
    }))
  )
  const [busy, setBusy] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const addFiles = async (): Promise<void> => {
    const files = await window.api.openDialog()
    if (!files) return
    const next: Item[] = []
    for (const f of files) {
      const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes)
      let pageCount = 0
      try {
        pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()
      } catch {
        /* ignore */
      }
      next.push({ uid: nanoid(8), name: f.name, bytes, pageCount })
    }
    setItems((cur) => [...cur, ...next])
  }

  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setItems((cur) => {
      const from = cur.findIndex((i) => i.uid === active.id)
      const to = cur.findIndex((i) => i.uid === over.id)
      const copy = [...cur]
      copy.splice(to, 0, copy.splice(from, 1)[0])
      return copy
    })
  }

  const merge = async (): Promise<void> => {
    if (items.length < 2) return
    setBusy(true)
    try {
      const sources: MergeSource[] = items.map((i) => ({ name: i.name, bytes: i.bytes }))
      const bytes = await mergePdfs(sources)
      await openFiles([{ path: '', name: 'Zusammengeführt.pdf', bytes }])
      toast.success(`${items.length} PDFs zusammengeführt.`)
      onClose()
    } catch (err) {
      toast.error('Zusammenführen fehlgeschlagen.')
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="PDFs zusammenführen"
      subtitle="Reihenfolge per Ziehen ändern"
      onClose={onClose}
      footer={
        <>
          <Button icon="plus" onClick={() => void addFiles()}>
            Datei hinzufügen
          </Button>
          <span className="spacer" />
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={busy || items.length < 2} onClick={() => void merge()}>
            {busy ? 'Führe zusammen …' : `${items.length} PDFs zusammenführen`}
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Noch keine Dateien. Füge mindestens zwei PDFs hinzu.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items.map((i) => i.uid)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((it) => (
                <Row
                  key={it.uid}
                  item={it}
                  onRemove={() => setItems((cur) => cur.filter((x) => x.uid !== it.uid))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Sheet>
  )
}
