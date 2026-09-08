import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from '../../pdf/pdfjs'
import { scrollViewerToPage } from '../../lib/viewerBus'
import { Icon } from '../common/Icon'

interface RawItem {
  title: string
  bold?: boolean
  italic?: boolean
  dest: string | unknown[] | null
  items: RawItem[]
}

interface Node {
  title: string
  bold: boolean
  italic: boolean
  page: number | null
  children: Node[]
}

async function resolvePage(proxy: PDFDocumentProxy, dest: RawItem['dest']): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await proxy.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const ref = explicit[0]
    if (ref && typeof ref === 'object') return (await proxy.getPageIndex(ref as never)) + 1
    if (typeof ref === 'number') return ref + 1
    return null
  } catch {
    return null
  }
}

async function build(proxy: PDFDocumentProxy, items: RawItem[]): Promise<Node[]> {
  return Promise.all(
    items.map(async (it) => ({
      title: it.title || '—',
      bold: Boolean(it.bold),
      italic: Boolean(it.italic),
      page: await resolvePage(proxy, it.dest),
      children: await build(proxy, it.items ?? [])
    }))
  )
}

function OutlineRow({ node, depth }: { node: Node; depth: number }): JSX.Element {
  const [open, setOpen] = useState(depth < 1)
  const hasKids = node.children.length > 0
  return (
    <li className="outline__li">
      <div
        className="outline__row"
        style={{ paddingLeft: 8 + depth * 13 }}
        role="button"
        tabIndex={0}
        onClick={() => node.page != null && scrollViewerToPage(node.page)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && node.page != null)
            scrollViewerToPage(node.page)
        }}
      >
        {hasKids ? (
          <button
            className="outline__twist"
            aria-label={open ? 'Zuklappen' : 'Aufklappen'}
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
          </button>
        ) : (
          <span className="outline__twist outline__twist--empty" />
        )}
        <span
          className="outline__title"
          style={{
            fontWeight: node.bold ? 600 : 400,
            fontStyle: node.italic ? 'italic' : undefined
          }}
        >
          {node.title}
        </span>
        {node.page != null && <span className="outline__page">{node.page}</span>}
      </div>
      {hasKids && open && (
        <ul className="outline__ul">
          {node.children.map((c, i) => (
            <OutlineRow key={i} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function Outline({ proxy }: { proxy: PDFDocumentProxy | null }): JSX.Element {
  const [nodes, setNodes] = useState<Node[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setNodes(null)
    if (!proxy) return
    void proxy
      .getOutline()
      .then(async (raw) => {
        const tree = raw ? await build(proxy, raw as unknown as RawItem[]) : []
        if (!cancelled) setNodes(tree)
      })
      .catch(() => {
        if (!cancelled) setNodes([])
      })
    return () => {
      cancelled = true
    }
  }, [proxy])

  if (nodes == null) {
    return <div className="outline__empty">Lesezeichen werden geladen …</div>
  }
  if (nodes.length === 0) {
    return <div className="outline__empty">Dieses PDF hat keine Lesezeichen.</div>
  }
  return (
    <ul className="outline">
      {nodes.map((n, i) => (
        <OutlineRow key={i} node={n} depth={0} />
      ))}
    </ul>
  )
}
