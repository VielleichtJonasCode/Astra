import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShellStore, type AstraView } from '../store/shellStore'
import { Icon, type IconName } from './common/Icon'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import { openPaths, openViaDialog } from '../lib/fileActions'
import { getRecentApps, noteAppUsed } from '../lib/recent'
import { requestDialog } from '../store/dialogStore'
import './home.css'

type GroupId = 'dokumente' | 'medien' | 'daten' | 'bald'

interface Tool {
  id: string
  name: string
  desc: string
  icon: IconName
  tint: string
  ready: boolean
  group: GroupId
  view?: AstraView
}

const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'dokumente', label: 'Dokumente' },
  { id: 'medien', label: 'Bild & Ton' },
  { id: 'daten', label: 'Text & Daten' },
  { id: 'bald', label: 'In Arbeit' }
]

const TOOLS: Tool[] = [
  {
    id: 'pdf',
    name: 'PDF-Editor',
    desc: 'Bearbeiten, zusammenführen, schwärzen, unterschreiben, OCR',
    icon: 'page',
    tint: '#0a84ff',
    ready: true,
    group: 'dokumente',
    view: 'pdf'
  },
  {
    id: 'convert',
    name: 'Konverter',
    desc: 'Bilder, PDF, Word, Text, Audio & Video zwischen Formaten umwandeln',
    icon: 'compress',
    tint: '#bf5af2',
    ready: true,
    group: 'dokumente',
    view: 'convert'
  },
  {
    id: 'scan',
    name: 'Dokumentenscan',
    desc: 'Foto entzerren, begradigen, in S/W säubern und als PDF speichern',
    icon: 'scan',
    tint: '#30d158',
    ready: true,
    group: 'dokumente',
    view: 'scan'
  },
  {
    id: 'images',
    name: 'Bild-Werkzeug',
    desc: 'Schwärzen, Text, Formen, Verpixeln, Filter, Zuschneiden, Metadaten entfernen',
    icon: 'image',
    tint: '#ff9f0a',
    ready: true,
    group: 'medien',
    view: 'image'
  },
  {
    id: 'audio',
    name: 'Audio-Editor',
    desc: 'Mehrere Spuren verbinden, Ränder ziehen, normalisieren, blenden, Tempo, Format',
    icon: 'droplet',
    tint: '#bf5af2',
    ready: true,
    group: 'medien',
    view: 'audio'
  },
  {
    id: 'text',
    name: 'Text-Werkzeug',
    desc: 'Groß/klein, Zeilen sortieren, bereinigen, Base64, Hash, JSON & CSV',
    icon: 'type',
    tint: '#5e5ce6',
    ready: true,
    group: 'daten',
    view: 'text'
  },
  {
    id: 'table',
    name: 'Tabellen',
    desc: 'Tabelle bauen und als CSV, TSV, JSON, Markdown, HTML oder LaTeX ausgeben',
    icon: 'columns',
    tint: '#ff9f0a',
    ready: true,
    group: 'daten',
    view: 'table'
  },
  {
    id: 'units',
    name: 'Umrechner',
    desc: 'Einheiten, Temperatur, Datenmengen, Zahlensysteme, Farben, Zeitstempel',
    icon: 'hash',
    tint: '#64d2ff',
    ready: true,
    group: 'daten',
    view: 'units'
  },
  {
    id: 'qr',
    name: 'QR & Barcode',
    desc: 'QR-Codes und Barcodes erstellen und aus Bildern auslesen',
    icon: 'grid',
    tint: '#30d158',
    ready: true,
    group: 'daten',
    view: 'qr'
  },
  {
    id: 'notes',
    name: 'Notizen',
    desc: 'Schnelle Notizen mit Anhängen und Suche',
    icon: 'note',
    tint: '#ffd60a',
    ready: false,
    group: 'bald'
  },
  {
    id: 'sign',
    name: 'Signatur-Werkzeug',
    desc: 'PDF unsichtbar mit deinem Mac-Schlüssel signieren und Signaturen prüfen',
    icon: 'signature-pen',
    tint: '#ff375f',
    ready: true,
    group: 'dokumente',
    view: 'sign'
  }
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Gute Nacht'
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

interface RecentFile {
  path: string
  name: string
  dir: string
}

function AppCard({
  t,
  num,
  onLaunch
}: {
  t: Tool
  num: number
  onLaunch: (t: Tool) => void
}): JSX.Element {
  return (
    <button
      className={cx('appcard', !t.ready && 'is-soon')}
      disabled={!t.ready}
      onClick={() => onLaunch(t)}
      style={{ ['--tint' as string]: t.tint }}
    >
      <span className="appcard__icon">
        <Icon name={t.icon} size={24} />
      </span>
      <span className="appcard__text">
        <span className="appcard__name">
          {t.name}
          {!t.ready && <span className="appcard__pill">Bald</span>}
        </span>
        <span className="appcard__desc">{t.desc}</span>
      </span>
      {t.ready && num > 0 && num < 10 && <span className="appcard__key">{num}</span>}
      {t.ready && <Icon name="chevron-right" size={16} className="appcard__go" />}
    </button>
  )
}

export function AstraHome(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<RecentFile[]>([])
  // AstraHome wird bei jedem Rücksprung zur Startseite neu gemountet, daher genügt der Initializer.
  const [recentAppIds] = useState<string[]>(() => getRecentApps().map((a) => a.id))
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api
      ?.recentFiles()
      .then((paths) =>
        setFiles(
          paths.slice(0, 12).map((p) => {
            const parts = p.split('/')
            return { path: p, name: parts.pop() ?? p, dir: parts.pop() ?? '' }
          })
        )
      )
      .catch(() => undefined)
  }, [])

  const launch = useCallback(
    (tool: Tool) => {
      if (!tool.ready || !tool.view) return
      noteAppUsed(tool.id)
      setView(tool.view)
    },
    [setView]
  )

  const q = query.trim().toLowerCase()
  const spMatches =
    !q ||
    'studienplaner studium semester kurse kurs notizen mitschriften uni vorlesung scannen handschrift'.includes(
      q
    )
  const apps = useMemo(
    () => (q ? TOOLS.filter((t) => `${t.name} ${t.desc}`.toLowerCase().includes(q)) : TOOLS),
    [q]
  )
  const filteredFiles = useMemo(
    () => (q ? files.filter((r) => `${r.name} ${r.dir}`.toLowerCase().includes(q)) : files),
    [q, files]
  )
  const readyApps = useMemo(() => TOOLS.filter((t) => t.ready), [])
  const recentApps = useMemo(
    () =>
      recentAppIds
        .map((id) => TOOLS.find((t) => t.id === id && t.ready))
        .filter((t): t is Tool => Boolean(t))
        .slice(0, 4),
    [recentAppIds]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      if (e.key === 'Escape') {
        if (query) setQuery('')
        else searchRef.current?.blur()
        return
      }
      if (typing || e.metaKey || e.ctrlKey) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (/^[1-9]$/.test(e.key)) {
        const app = readyApps[Number(e.key) - 1]
        if (app) {
          e.preventDefault()
          launch(app)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [query, readyApps, launch])

  const openFile = (path: string): void => void openPaths([path])
  const openFirst = (): void => {
    const app = apps.find((a) => a.ready)
    if (app) return launch(app)
    if (filteredFiles[0]) openFile(filteredFiles[0].path)
  }

  const showRecent = recentApps.length > 0 || filteredFiles.length > 0

  return (
    <div className="home">
      <div className="home__deco" aria-hidden>
        <div className="home__glow" />
        <svg viewBox="0 0 400 400" className="home__ring">
          <ellipse
            cx="200"
            cy="200"
            rx="230"
            ry="70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            transform="rotate(-20 200 200)"
          />
        </svg>
      </div>

      <div className="home__bar drag-region">
        <button
          className="home__settings no-drag"
          aria-label="Einstellungen"
          title="Einstellungen (⌘,)"
          onClick={() => requestDialog('preferences')}
        >
          <Icon name="gear" size={17} />
        </button>
      </div>

      <div className="home__scroll">
        <div className="home__inner">
          <header className="home__hero">
            <div className="home__markwrap">
              <AstraMark size={62} />
            </div>
            <div>
              <div className="home__greeting">{greeting()}</div>
              <h1 className="home__name">Astra</h1>
              <p className="home__tag">Deine Werkzeugsammlung für den Mac</p>
            </div>
          </header>

          <label className="home__search">
            <Icon name="search" size={16} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Apps & zuletzt geöffnete Dateien durchsuchen …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openFirst()
              }}
            />
            {query ? (
              <button
                className="home__searchclear"
                onClick={() => setQuery('')}
                aria-label="Leeren"
              >
                <Icon name="x" size={13} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>

          {spMatches && (
            <button
              className="home__sp"
              onClick={() => {
                noteAppUsed('studienplaner')
                setView('studienplaner')
              }}
            >
              <span className="home__sp-icon">
                <Icon name="graduation" size={30} />
              </span>
              <span className="home__sp-text">
                <span className="home__sp-title">Studienplaner</span>
                <span className="home__sp-desc">
                  Handschriftliche Notizen scannen, per Texterkennung nach Semester und Kurs
                  einsortieren und alles durchsuchen. Liegt in iCloud – auch am iPhone.
                </span>
              </span>
              <Icon name="chevron-right" size={18} className="home__sp-go" />
            </button>
          )}

          {showRecent && !q && (
            <section className="home__section">
              <h2 className="home__h2">Zuletzt</h2>
              <div className="home__recentrow">
                {recentApps.map((t) => (
                  <button
                    key={`a-${t.id}`}
                    className="rchip rchip--app"
                    style={{ ['--tint' as string]: t.tint }}
                    onClick={() => launch(t)}
                  >
                    <span className="rchip__icon">
                      <Icon name={t.icon} size={15} />
                    </span>
                    <span className="rchip__label">{t.name}</span>
                  </button>
                ))}
                {filteredFiles.slice(0, 8).map((r) => (
                  <button
                    key={`f-${r.path}`}
                    className="rchip"
                    title={r.path}
                    onClick={() => openFile(r.path)}
                  >
                    <span className="rchip__icon rchip__icon--file">
                      <Icon name="page" size={14} />
                    </span>
                    <span className="rchip__label">{r.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {q ? (
            <section className="home__section">
              <h2 className="home__h2">Ergebnisse</h2>
              {apps.length === 0 ? (
                <p className="home__none">Keine App gefunden.</p>
              ) : (
                <div className="home__grid">
                  {apps.map((t) => (
                    <AppCard key={t.id} t={t} num={readyApps.indexOf(t) + 1} onLaunch={launch} />
                  ))}
                </div>
              )}
            </section>
          ) : (
            GROUPS.map((g) => {
              const groupApps = apps.filter((t) => t.group === g.id)
              if (groupApps.length === 0) return null
              return (
                <section className="home__section" key={g.id}>
                  <h2 className="home__h2">{g.label}</h2>
                  <div className="home__grid">
                    {groupApps.map((t) => (
                      <AppCard key={t.id} t={t} num={readyApps.indexOf(t) + 1} onLaunch={launch} />
                    ))}
                  </div>
                </section>
              )
            })
          )}

          {files.length === 0 && !query && (
            <section className="home__section">
              <h2 className="home__h2">Loslegen</h2>
              <button className="home__open" onClick={() => void openViaDialog()}>
                <Icon name="upload" size={18} />
                <span>
                  <strong>PDF öffnen</strong>
                  <em>oder eine Datei ins Fenster ziehen</em>
                </span>
              </button>
            </section>
          )}
        </div>
      </div>

      <footer className="home__foot">
        <span>Astra 0.1.0</span>
        <span>·</span>
        <span>AGPL-3.0</span>
        <span className="home__foot-hint">
          <kbd>1</kbd>–<kbd>{Math.min(readyApps.length, 9)}</kbd> öffnet eine App · <kbd>/</kbd>{' '}
          sucht · <kbd>⌘,</kbd> Einstellungen
        </span>
      </footer>
    </div>
  )
}
