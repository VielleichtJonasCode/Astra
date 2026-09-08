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
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { PDFDocument } from 'pdf-lib'
import { useDocStore } from '../../store/docStore'
import { Sheet } from '../common/Sheet'
import { Button, IconButton } from '../common/Button'
import { Icon } from '../common/Icon'
import { toast } from '../common/toast'
import { mergePdfs, type MergeSource } from '../../pdf/ops/merge'
import {
  MERGE_KIND_LABEL,
  mergeKind,
  toPdfBytes,
  type MergeKind
} from '../../pdf/ops/normalizeToPdf'

interface Item {
  uid: string
  name: string
  bytes: Uint8Array
  kind: MergeKind
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
      <span
        style={{
          flex: 1,
          fontSize: 13,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {item.name}
      </span>
      <span
        style={{
          fontSize: 11,
          color: item.kind === 'unknown' ? 'var(--danger)' : 'var(--text-tertiary)'
        }}
      >
        {item.kind === 'pdf'
          ? `${item.pageCount} ${item.pageCount === 1 ? 'Seite' : 'Seiten'}`
          : MERGE_KIND_LABEL[item.kind]}
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
      kind: 'pdf' as const,
      pageCount: d.pages.length
    }))
  )
  const [busy, setBusy] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const addFiles = async (): Promise<void> => {
    const files = await window.api.openAnyFiles()
    if (!files) return
    const next: Item[] = []
    for (const f of files) {
      const loaded = await window.api.readFile(f.path)
      const kind = mergeKind(f.name)
      let pageCount = 0
      if (kind === 'pdf') {
        try {
          pageCount = (
            await PDFDocument.load(loaded.bytes, { ignoreEncryption: true })
          ).getPageCount()
        } catch {
          /* verschlüsselt o. ä. – 0 lassen */
        }
      }
      next.push({ uid: nanoid(8), name: f.name, bytes: loaded.bytes, kind, pageCount })
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

  const usable = items.filter((i) => i.kind !== 'unknown')

  const merge = async (): Promise<void> => {
    if (usable.length < 2) return
    setBusy(true)
    try {
      const sources: MergeSource[] = []
      for (const it of usable) {
        sources.push({ name: it.name, bytes: await toPdfBytes(it.name, it.bytes) })
      }
      const bytes = await mergePdfs(sources)
      await openFiles([{ path: '', name: 'Zusammengeführt.pdf', bytes }])
      toast.success(`${usable.length} Dateien zusammengeführt.`)
      onClose()
    } catch (err) {
      toast.error(
        `Zusammenführen fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Zusammenführen"
      subtitle="PDFs, Bilder und Dokumente in ein PDF · Reihenfolge per Ziehen"
      onClose={onClose}
      footer={
        <>
          <Button icon="plus" onClick={() => void addFiles()}>
            Datei hinzufügen
          </Button>
          <span className="spacer" />
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={busy || usable.length < 2}
            onClick={() => void merge()}
          >
            {busy ? 'Führe zusammen …' : `${usable.length} Dateien zusammenführen`}
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Noch keine Dateien. Füge mindestens zwei hinzu – PDF, Bild (PNG, JPEG, HEIC, TIFF …) oder
          Dokument (Word, Text, Markdown, HTML).
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
