import type { ReactNode, SVGProps } from 'react'

/**
 * Schlanke Icon-Sammlung im Lucide-Stil (24×24, Strich, currentColor).
 * Bewusst inline gehalten – keine Icon-Font, keine externen Assets (CSP).
 */
export type IconName =
  | 'cursor'
  | 'hand'
  | 'text'
  | 'text-edit'
  | 'highlighter'
  | 'underline'
  | 'strikethrough'
  | 'pen'
  | 'shapes'
  | 'square'
  | 'circle'
  | 'line'
  | 'arrow-up-right'
  | 'image'
  | 'signature'
  | 'stamp'
  | 'note'
  | 'redact'
  | 'eraser'
  | 'search'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-width'
  | 'fit-page'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'trash'
  | 'copy'
  | 'plus'
  | 'merge'
  | 'split'
  | 'download'
  | 'upload'
  | 'sidebar'
  | 'inspector'
  | 'sun'
  | 'moon'
  | 'page'
  | 'pages'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'check'
  | 'x'
  | 'lock'
  | 'unlock'
  | 'sparkles'
  | 'layers'
  | 'gear'
  | 'info'
  | 'undo'
  | 'redo'
  | 'grip'
  | 'grid'
  | 'columns'
  | 'crop'
  | 'droplet'
  | 'type'
  | 'hash'
  | 'panel-top'
  | 'compress'
  | 'file-plus'
  | 'more'
  | 'presentation'
  | 'planet'
  | 'signature-pen'
  | 'apps'
  | 'home'
  | 'text-select'
  | 'save'
  | 'export'
  | 'flip-h'
  | 'flip-v'
  | 'play'
  | 'pause'
  | 'scan'
  | 'graduation'
  | 'folder'
  | 'folder-open'
  | 'inbox'
  | 'camera'
  | 'calendar'

const P = (d: string): ReactNode => <path d={d} />

const ICONS: Record<IconName, ReactNode> = {
  cursor: P('m4 4 7.07 17 2.51-7.42L21 11.07 4 4Z'),
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-4 0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L12 15" />
    </>
  ),
  text: (
    <>
      <path d="M17 6.1H3" />
      <path d="M21 12.1H3" />
      <path d="M15.1 18H3" />
    </>
  ),
  'text-edit': (
    <>
      <path d="M12 20h9" />
      <path d="M4 16V5h11" />
      <path d="M9 5v11" />
      <path d="m15 17 2 2 4-4" />
    </>
  ),
  highlighter: (
    <>
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </>
  ),
  underline: (
    <>
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <line x1="4" x2="20" y1="20" y2="20" />
    </>
  ),
  strikethrough: (
    <>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" x2="20" y1="12" y2="12" />
    </>
  ),
  pen: P('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'),
  shapes: (
    <>
      <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <circle cx="17.5" cy="17.5" r="3.5" />
    </>
  ),
  square: <rect x="3" y="3" width="18" height="18" rx="2" />,
  circle: <circle cx="12" cy="12" r="9" />,
  line: <line x1="5" y1="19" x2="19" y2="5" />,
  'arrow-up-right': (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
    </>
  ),
  signature: (
    <>
      <path d="M20 20c-2 0-4-1-4-3s2-3 2-5-1-3-3-3-3 2-3 5-1 6-3 6-2-2-2-4" />
      <path d="M3 20h18" />
    </>
  ),
  stamp: (
    <>
      <path d="M5 22h14" />
      <path d="M19.27 17.73A2.5 2.5 0 0 0 17 16h-2.5V9.5a3.5 3.5 0 1 0-5 0V16H7a2.5 2.5 0 0 0-2.27 1.73" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  note: (
    <>
      <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z" />
      <path d="M15 3v6h6" />
    </>
  ),
  redact: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  eraser: (
    <>
      <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a2 2 0 0 1 2.8 0l4.7 4.7a2 2 0 0 1 0 2.8L13 21" />
      <path d="M22 21H7" />
      <path d="m5 12 5 5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </>
  ),
  'fit-width': (
    <>
      <path d="M3 8v8" />
      <path d="M21 8v8" />
      <path d="M7 12h10" />
      <path d="m9 9-3 3 3 3" />
      <path d="m15 9 3 3-3 3" />
    </>
  ),
  'fit-page': (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m9 9 6 6" />
      <path d="M15 9v6H9" />
    </>
  ),
  'rotate-cw': (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </>
  ),
  'rotate-ccw': (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  merge: (
    <>
      <path d="M8 3v4a4 4 0 0 0 4 4 4 4 0 0 1 4 4v5" />
      <path d="M16 3v4a4 4 0 0 1-4 4" />
      <path d="m13 18 3 3 3-3" />
    </>
  ),
  split: (
    <>
      <path d="M16 3h5v5" />
      <path d="M8 3H3v5" />
      <path d="M21 3 3 21" />
      <path d="M16 21h5v-5" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </>
  ),
  inspector: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: P('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'),
  page: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
    </>
  ),
  pages: (
    <>
      <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2" />
      <path d="M16 3h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2" />
      <rect x="9" y="6" width="6" height="12" rx="1" />
    </>
  ),
  'chevron-left': P('m15 18-6-6 6-6'),
  'chevron-right': P('m9 18 6-6-6-6'),
  'chevron-up': P('m18 15-6-6-6 6'),
  'chevron-down': P('m6 9 6 6 6-6'),
  check: P('M20 6 9 17l-5-5'),
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>
  ),
  sparkles: P(
    'M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9ZM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8ZM5 15l.6 1.5L7 17l-1.4.5L5 19l-.6-1.5L3 17l1.4-.5Z'
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15a1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.14.75.22 1.15.22H21a2 2 0 0 1 0 4h-.09c-.66 0-1.26.4-1.51 1Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a6 6 0 0 1 0 12H8" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a6 6 0 0 0 0 12h7" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </>
  ),
  droplet: P('M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0Z'),
  type: (
    <>
      <path d="M4 7V5h16v2" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </>
  ),
  hash: (
    <>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </>
  ),
  'panel-top': (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  compress: (
    <>
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
      <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
      <path d="M9 12h6" />
    </>
  ),
  'file-plus': (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
      <path d="M12 11v6M9 14h6" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  presentation: (
    <>
      <path d="M2 3h20" />
      <path d="M3 3v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V3" />
      <path d="m8 21 4-4 4 4" />
    </>
  ),
  planet: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-22 12 12)" />
    </>
  ),
  'signature-pen': (
    <>
      <path d="M3 17c2 0 3-1.4 3-4s-.9-4-2-4-2 1.6-2 4 1 6 3.5 6 3.5-3 3.5-6 .8-4 2-4 2 1.5 2 3.5" />
      <path d="M15 12c1 0 2 .8 2 2.2 0 1.4-1.2 2.3-1.2 3.3 0 .7.6 1.2 1.4 1.2 1.6 0 2.8-1.6 3.8-3.9" />
      <path d="M3 21h18" />
    </>
  ),
  apps: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  'text-select': (
    <>
      <path d="M5 3H4a1 1 0 0 0-1 1v1M9 3h2M15 3h2M20 3h1a1 1 0 0 1 1 1v1M3 9v2M3 15v2M22 9v2M22 15v2M3 20v-1a1 1 0 0 1 1-1h1M9 21h2M15 21h2M20 21h1a1 1 0 0 0 1-1v-1" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </>
  ),
  export: (
    <>
      <path d="M12 3v13" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </>
  ),
  'flip-h': (
    <>
      <path d="M12 3v18" />
      <path d="M8 8 4 12l4 4Z" />
      <path d="m16 8 4 4-4 4Z" />
    </>
  ),
  'flip-v': (
    <>
      <path d="M3 12h18" />
      <path d="M8 8 12 4l4 4Z" />
      <path d="m8 16 4 4 4-4Z" />
    </>
  ),
  play: <path d="M6 4v16l14-8Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </>
  ),
  graduation: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
      <path d="M22 10v6" />
    </>
  ),
  folder: <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" />,
  'folder-open': (
    <>
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2" />
      <path d="m2.5 19 2.3-7a1 1 0 0 1 1-.7h15.4a1 1 0 0 1 1 1.3L20.5 19a1 1 0 0 1-1 .7H3.5a1 1 0 0 1-1-1.4Z" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </>
  )
}

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 17, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  )
}
