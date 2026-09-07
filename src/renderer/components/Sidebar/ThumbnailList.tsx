import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { requestDialog } from '../../store/dialogStore'
import { useContextMenu, type MenuAction } from '../common/Menu'
import { Thumbnail } from './Thumbnail'
import { scrollViewerToPage } from '../../lib/viewerBus'

export function ThumbnailList({
  docKey,
  proxy
}: {
  docKey: string
  proxy: PDFDocumentProxy | null
}): JSX.Element {
  const pages = useDocStore((s) => s.docs[docKey]?.pages ?? [])
  const movePages = useDocStore((s) => s.movePages)
  const rotatePages = useDocStore((s) => s.rotatePages)
  const deletePages = useDocStore((s) => s.deletePages)
  const duplicatePages = useDocStore((s) => s.duplicatePages)
  const insertBlankPage = useDocStore((s) => s.insertBlankPage)

  const selectedPages = useUiStore((s) => s.selectedPages)
  const selectPages = useUiStore((s) => s.selectPages)
  const currentPage = useUiStore((s) => s.currentPage)

  const [lastClicked, setLastClicked] = useState(0)
  const menu = useContextMenu()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const ids = useMemo(() => pages.map((p) => p.id), [pages])

  const onSelect = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (e.shiftKey) {
        const [a, b] = [lastClicked, index].sort((x, y) => x - y)
        selectPages(Array.from({ length: b - a + 1 }, (_, i) => a + i))
      } else if (e.metaKey || e.ctrlKey) {
        selectPages(
          selectedPages.includes(index)
            ? selectedPages.filter((i) => i !== index)
            : [...selectedPages, index]
        )
      } else {
        selectPages([index])
        setLastClicked(index)
        scrollViewerToPage(index + 1)
      }
    },
    [lastClicked, selectPages, selectedPages]
  )

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e
      if (!over || active.id === over.id) return
      const from = ids.indexOf(String(active.id))
      const to = ids.indexOf(String(over.id))
      if (from < 0 || to < 0) return
      const group =
        selectedPages.includes(from) && selectedPages.length > 1
          ? [...selectedPages].sort((a, b) => a - b)
          : [from]
      movePages(docKey, group, to)
      selectPages([])
    },
    [ids, selectedPages, movePages, docKey, selectPages]
  )

  const openMenu = (index: number, e: React.MouseEvent): void => {
    const targets =
      selectedPages.length > 1 && selectedPages.includes(index)
        ? [...selectedPages].sort((a, b) => a - b)
        : [index]
    const actions: MenuAction[] = [
      {
        id: 'rot-cw',
        label: 'Nach rechts drehen',
        icon: 'rotate-cw',
        onSelect: () => rotatePages(docKey, targets, 90)
      },
      {
        id: 'rot-ccw',
        label: 'Nach links drehen',
        icon: 'rotate-ccw',
        onSelect: () => rotatePages(docKey, targets, -90)
      },
      {
        id: 'dupe',
        label: targets.length > 1 ? 'Seiten duplizieren' : 'Seite duplizieren',
        icon: 'copy',
        separatorBefore: true,
        onSelect: () => duplicatePages(docKey, targets)
      },
      {
        id: 'blank',
        label: 'Leere Seite danach',
        icon: 'file-plus',
        onSelect: () => insertBlankPage(docKey, targets[targets.length - 1] + 1)
      },
      {
        id: 'extract',
        label: 'In neues PDF extrahieren …',
        icon: 'split',
        separatorBefore: true,
        onSelect: () => {
          selectPages(targets)
          requestDialog('extract')
        }
      },
      {
        id: 'resize',
        label: 'Größe / Format …',
        icon: 'crop',
        onSelect: () => {
          selectPages(targets)
          requestDialog('resize')
        }
      },
      {
        id: 'del',
        label: targets.length > 1 ? `${targets.length} Seiten löschen` : 'Seite löschen',
        icon: 'trash',
        danger: true,
        separatorBefore: true,
        onSelect: () => {
          deletePages(docKey, targets)
          selectPages([])
        }
      }
    ]
    menu.open(actions)(e)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="thumbs">
            {pages.map((page, i) => (
              <Thumbnail
                key={page.id}
                docKey={docKey}
                proxy={proxy}
                page={page}
                index={i}
                selected={selectedPages.includes(i)}
                current={currentPage === i + 1}
                onSelect={onSelect}
                onContextMenu={openMenu}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {menu.node}
    </>
  )
}
