import { useEffect, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { useSearchStore } from '../../store/searchStore'
import { searchDocument } from '../../pdf/searchPdf'
import { IconButton } from '../common/Button'
import { Spinner } from '../common/misc'
import type { PageLayout } from './PageView'

export function FindBar({
  proxy,
  layouts,
  cssScale,
  scrollRef
}: {
  proxy: PDFDocumentProxy | null
  layouts: PageLayout[]
  cssScale: number
  scrollRef: React.RefObject<HTMLDivElement>
}): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))
  const setSearchUi = useUiStore((s) => s.setSearch)
  const { query, setQuery, matches, active, running, setResult, setRunning, next, prev } =
    useSearchStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!proxy || !doc || query.trim().length < 1) {
      setResult([])
      return
    }
    setRunning(true)
    debounce.current = setTimeout(() => {
      void searchDocument(proxy, doc.pages, query).then(setResult)
    }, 220)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [query, proxy, doc, setResult, setRunning])

  useEffect(() => {
    setSearchUi({ total: matches.length, activeIndex: active })
    const m = matches[active]
    const el = scrollRef.current
    const layout = m ? layouts[m.pageIndex - 1] : null
    if (!m || !el || !layout) return
    const targetTop = layout.top + m.rect.y * cssScale - el.clientHeight * 0.32
    el.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  }, [active, matches, layouts, cssScale, scrollRef, setSearchUi])

  const close = (): void => {
    setSearchUi({ open: false })
    useSearchStore.getState().reset()
  }

  return (
    <div className="findbar no-drag">
      <input
        ref={inputRef}
        className="input findbar__input"
        placeholder="Im Dokument suchen"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.shiftKey ? prev : next)()
          if (e.key === 'Escape') close()
        }}
      />
      <span className="findbar__count">
        {running ? (
          <Spinner size={12} />
        ) : matches.length ? (
          `${active + 1} / ${matches.length}`
        ) : query ? (
          'Keine Treffer'
        ) : (
          ''
        )}
      </span>
      <IconButton
        name="chevron-up"
        label="Vorheriger Treffer"
        onClick={prev}
        disabled={!matches.length}
      />
      <IconButton
        name="chevron-down"
        label="Nächster Treffer"
        onClick={next}
        disabled={!matches.length}
      />
      <IconButton name="x" label="Suche schließen" onClick={close} />
    </div>
  )
}
