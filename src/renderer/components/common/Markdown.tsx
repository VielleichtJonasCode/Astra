import { useEffect, useState } from 'react'
import { cx } from '../../lib/cx'
import './markdown.css'

/** Markdown → sanitisiertes HTML (lazy `marked`). Leerer String bei leerem Input. */
export function useMarkdown(md: string): string {
  const [html, setHtml] = useState('')
  useEffect(() => {
    let alive = true
    if (!md.trim()) {
      setHtml('')
      return
    }
    void import('marked').then(({ marked }) => {
      if (!alive) return
      const raw = String(marked.parse(md, { async: false, breaks: true }))
      // einfache Absicherung gegen eingeschleustes HTML aus dem Modell
      const safe = raw
        .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/javascript:/gi, '')
      setHtml(safe)
    })
    return () => {
      alive = false
    }
  }, [md])
  return html
}

/** Gerenderter Markdown-Block (KI-Zusammenfassung, -Antwort, -Auswertung …). */
export function Markdown({ md, className }: { md: string; className?: string }): JSX.Element {
  const html = useMarkdown(md)
  return <div className={cx('md', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
