import { memo, useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pageDisplaySize, type PageModel } from '../../pdf/model'
import { getCachedThumb, loadThumbnail, thumbKey } from '../../pdf/thumbnails'
import { cx } from '../../lib/cx'
import { Spinner } from '../common/misc'

interface Props {
  docKey: string
  proxy: PDFDocumentProxy | null
  page: PageModel
  index: number
  selected: boolean
  current: boolean
  onSelect: (index: number, e: React.MouseEvent) => void
  onContextMenu: (index: number, e: React.MouseEvent) => void
}

function ThumbnailImpl({
  docKey,
  proxy,
  page,
  index,
  selected,
  current,
  onSelect,
  onContextMenu
}: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id
  })
  const key = thumbKey(docKey, page.id, page.rotation)
  const [url, setUrl] = useState<string | undefined>(() => getCachedThumb(key))
  const elRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const cached = getCachedThumb(key)
    if (cached) {
      setUrl(cached)
      return
    }
    setUrl(undefined)
    if (page.source.kind !== 'original' || !proxy) return

    let alive = true
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          loadThumbnail(
            proxy,
            docKey,
            page.id,
            page.source.kind === 'original' ? page.source.index + 1 : 1,
            page.rotation
          )
            .then((u) => alive && setUrl(u))
            .catch(() => undefined)
        }
      },
      { root: elRef.current?.closest('.sidebar__scroll'), rootMargin: '400px' }
    )
    if (elRef.current) io.observe(elRef.current)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [key, proxy, docKey, page.id, page.rotation, page.source])

  const size = pageDisplaySize(page)
  const ar = size.width / size.height

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        elRef.current = node
      }}
      className={cx(
        'thumb',
        selected && 'is-selected',
        current && 'is-current',
        isDragging && 'is-dragging'
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => onSelect(index, e)}
      onContextMenu={(e) => onContextMenu(index, e)}
      {...attributes}
      {...listeners}
    >
      <div className={cx('thumb__frame', !url && 'is-loading')} style={{ ['--ar' as string]: ar }}>
        {url ? (
          <img src={url} alt={`Seite ${index + 1}`} draggable={false} />
        ) : page.source.kind === 'original' ? (
          <Spinner size={16} />
        ) : (
          <span className="thumb__blank">
            {page.source.kind === 'blank' ? 'Leer' : page.source.kind === 'image' ? 'Bild' : 'PDF'}
          </span>
        )}
        {(page.rotation !== 0 || page.cropBox || page.scale) && (
          <div className="thumb__badge">
            {page.rotation !== 0 && <span>{page.rotation}°</span>}
            {page.cropBox && <span>✂</span>}
            {page.scale && page.scale !== 1 && <span>{Math.round(page.scale * 100)}%</span>}
          </div>
        )}
      </div>
      <span className="thumb__label">{index + 1}</span>
    </div>
  )
}

export const Thumbnail = memo(ThumbnailImpl)
