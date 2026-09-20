import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { AstraMark } from './AstraMark'
import { Progress, Spinner } from './common/misc'
import { Segmented } from './common/controls'
import { toast } from './common/toast'
import { cx } from '../lib/cx'
import { baseName, categoryOf, extOf, targetsFor, type Category } from '../convert/catalog'
import { runJob, type ResultFile } from '../convert/run'
import './converter.css'

type Status = 'idle' | 'running' | 'done' | 'error'

interface Row {
  id: string
  name: string
  path: string
  dir: string
  bytes?: Uint8Array
  cat: Category
  targets: { ext: string; label: string; note?: string }[]
  targetExt: string
  status: Status
  progress: number
  statusText: string
  outputs: string[]
  error?: string
}

const CAT_ICON: Record<Category, Parameters<typeof Icon>[0]['name']> = {
  image: 'image',
  pdf: 'page',
  document: 'type',
  spreadsheet: 'grid',
  audio: 'droplet',
  video: 'presentation',
  other: 'file-plus'
}
const CAT_TINT: Record<Category, string> = {
  image: '#30d158',
  pdf: '#ff453a',
  document: '#0a84ff',
  spreadsheet: '#34c759',
  audio: '#bf5af2',
  video: '#ff9f0a',
  other: '#8e8e93'
}

const FMT_GROUPS: { label: string; tint: string; items: string[] }[] = [
  {
    label: 'Bilder',
    tint: '#30d158',
    items: ['HEIC', 'PNG', 'JPEG', 'WebP', 'AVIF', 'SVG', 'TIFF']
  },
  { label: 'Dokumente', tint: '#0a84ff', items: ['PDF', 'Word', 'Text', 'Markdown', 'HTML'] },
  { label: 'Tabellen', tint: '#34c759', items: ['Excel', 'CSV'] },
  { label: 'Audio', tint: '#bf5af2', items: ['MP3', 'WAV', 'M4A', 'FLAC', 'OGG', 'Opus'] },
  { label: 'Video', tint: '#ff9f0a', items: ['MP4', 'MOV', 'MKV', 'WebM', 'GIF'] }
]

function rowFromFile(name: string, path: string, bytes?: Uint8Array): Row | null {
  const targets = targetsFor(name)
  if (targets.length === 0) return null
  return {
    id: nanoid(8),
    name,
    path,
    dir: path ? path.slice(0, path.lastIndexOf('/')) : '',
    bytes,
    cat: categoryOf(name),
    targets,
    targetExt: targets[0].ext,
    status: 'idle',
    progress: 0,
    statusText: '',
    outputs: []
  }
}

export function ConverterApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [rows, setRows] = useState<Row[]>([])
  const [outMode, setOutMode] = useState<'beside' | 'folder'>('beside')
  const [outDir, setOutDir] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dropDepth = useRef(0)

  const canBeside = useMemo(() => rows.every((r) => r.dir), [rows])
  const effMode = canBeside ? outMode : 'folder'

  // Dev-Vorschau: #convdemo=1 – Zeilen in allen Zuständen (nur für Screenshots)
  useEffect(() => {
    if (!/convdemo=1/.test(location.hash)) return
    const mk = (name: string, target: string, status: Status, extra: Partial<Row> = {}): Row => {
      const base = rowFromFile(name, `/Users/du/Downloads/${name}`)!
      return { ...base, targetExt: target, status, ...extra }
    }
    setRows([
      mk('urlaubsfoto.HEIC'.replace('HEIC', 'jpg'), 'png', 'idle'),
      mk('praesentation.pdf', 'docx', 'idle'),
      mk('podcast-folge-12.wav', 'mp3', 'running', { progress: 0.62, statusText: 'Konvertiere …' }),
      mk('rechnung.png', 'pdf', 'done', {
        progress: 1,
        statusText: '1 Datei',
        outputs: ['/Users/du/Downloads/rechnung.pdf']
      }),
      mk('clip.mov', 'gif', 'error', {
        statusText: 'Fehler',
        error: 'FFmpeg: Codec nicht verfügbar.'
      })
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dev-Selbsttest: #convtest=<pfad>|<zielext>
  useEffect(() => {
    const m = /convtest=([^&]+)/.exec(location.hash)
    if (!m) return
    const [path, ext] = decodeURIComponent(m[1]).split('|')
    const name = path.split('/').pop() ?? path
    const row = rowFromFile(name, path)
    if (!row) {
      // eslint-disable-next-line no-console
      console.log('CONVTEST: no targets for', name)
      return
    }
    row.targetExt = ext || row.targetExt
    ;(async () => {
      try {
        const files = await runJob(
          { id: row.id, name: row.name, path: row.path, targetExt: row.targetExt },
          { onStatus: (t) => console.log('CONVTEST status:', t), quality: 0.9, imageDpi: 120 }
        )
        for (const f of files) {
          const out = `${row.dir}/${baseName(name)}${f.suffix}.${f.ext}`
          await window.api.writeFile(out, f.bytes)
          // eslint-disable-next-line no-console
          console.log('CONVTEST OK ->', out, f.bytes.length, 'bytes')
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log('CONVTEST FAIL:', err instanceof Error ? err.message : err)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addViaDialog = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked) return
    const next = picked.map((p) => rowFromFile(p.name, p.path)).filter((r): r is Row => !!r)
    const skipped = picked.length - next.length
    if (skipped) toast.info(`${skipped} Datei(en) übersprungen (Format nicht unterstützt).`)
    setRows((cur) => [...cur, ...next])
  }

  const addDropped = async (files: FileList): Promise<void> => {
    const next: Row[] = []
    for (const f of Array.from(files)) {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const p = (f as File & { path?: string }).path ?? ''
      const row = rowFromFile(f.name, p, p ? undefined : bytes)
      if (row) next.push(row)
    }
    if (next.length) setRows((cur) => [...cur, ...next])
  }

  const pickFolder = async (): Promise<void> => {
    const dir = await window.api.pickDirectory()
    if (dir) {
      setOutDir(dir)
      setOutMode('folder')
    }
  }

  const patch = (id: string, p: Partial<Row>): void =>
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const writeResult = async (row: Row, files: ResultFile[]): Promise<string[]> => {
    const dir = effMode === 'folder' ? outDir : row.dir
    if (!dir) throw new Error('Kein Zielordner gewählt.')
    const base = baseName(row.name)
    const written: string[] = []
    for (const f of files) {
      let target = `${dir}/${base}${f.suffix}.${f.ext}`
      // Kollision mit der Quelle vermeiden
      if (target === row.path) target = `${dir}/${base}${f.suffix} (konvertiert).${f.ext}`
      await window.api.writeFile(target, f.bytes)
      written.push(target)
    }
    return written
  }

  const runAll = async (): Promise<void> => {
    if (effMode === 'folder' && !outDir) {
      await pickFolder()
      if (!useShellStore.getState()) return
    }
    setBusy(true)
    let ok = 0
    for (const row of rows) {
      if (row.status === 'done') {
        ok++
        continue
      }
      patch(row.id, { status: 'running', progress: 0, statusText: 'Start …', error: undefined })
      try {
        const files = await runJob(
          {
            id: row.id,
            name: row.name,
            path: row.path,
            targetExt: row.targetExt,
            bytes: row.bytes
          },
          {
            onProgress: (r) => patch(row.id, { progress: r }),
            onStatus: (t) => patch(row.id, { statusText: t }),
            quality: 0.92,
            imageDpi: 150
          }
        )
        const written = await writeResult(row, files)
        patch(row.id, {
          status: 'done',
          progress: 1,
          statusText: `${written.length} Datei(en)`,
          outputs: written
        })
        ok++
      } catch (err) {
        patch(row.id, {
          status: 'error',
          statusText: 'Fehler',
          error: err instanceof Error ? err.message : String(err)
        })
        // eslint-disable-next-line no-console
        console.error(err)
      }
    }
    setBusy(false)
    if (ok) toast.success(`${ok} von ${rows.length} Datei(en) konvertiert.`)
  }

  const overall = rows.length
    ? rows.reduce((s, r) => s + (r.status === 'done' ? 1 : r.progress), 0) / rows.length
    : 0

  return (
    <div
      className="conv"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.stopPropagation()
        dropDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDragLeave={(e) => {
        e.stopPropagation()
        if (--dropDepth.current <= 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        dropDepth.current = 0
        setDragging(false)
        if (e.dataTransfer.files.length) void addDropped(e.dataTransfer.files)
      }}
    >
      <div className="conv__glow" aria-hidden />

      <header className="conv__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="conv__title">
          Konverter
          {rows.length > 0 && <span className="conv__count">{rows.length}</span>}
        </div>
        <div style={{ width: 92 }} />
      </header>

      <div className="conv__scroll">
        <div className="conv__inner">
          {rows.length === 0 ? (
            <div className={cx('conv__drop', dragging && 'is-over')}>
              <div className="conv__dropicon">
                <Icon name="upload" size={34} />
              </div>
              <div className="conv__droptitle">Dateien hierher ziehen</div>
              <div className="conv__dropsub">alles zu (fast) allem – lokal, ohne Upload</div>
              <div className="conv__groups">
                {FMT_GROUPS.map((g) => (
                  <div key={g.label} className="conv__group">
                    <span className="conv__grouplabel" style={{ color: g.tint }}>
                      {g.label}
                    </span>
                    <span className="conv__chips">
                      {g.items.map((it) => (
                        <span key={it} className="conv__fmt" style={{ ['--c' as string]: g.tint }}>
                          {it}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <Button variant="primary" icon="plus" onClick={() => void addViaDialog()}>
                Dateien wählen …
              </Button>
            </div>
          ) : (
            <>
              <div className="conv__list">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className={cx('convrow', `is-${r.status}`)}
                    style={{ ['--tint' as string]: CAT_TINT[r.cat] }}
                  >
                    <span className="convrow__icon">
                      <Icon name={CAT_ICON[r.cat]} size={19} />
                    </span>
                    <div className="convrow__main">
                      <div className="convrow__name" title={r.path || r.name}>
                        {r.name}
                      </div>
                      <div className="convrow__flow">
                        <span className="convrow__src">
                          {extOf(r.name).toUpperCase() || 'DATEI'}
                        </span>
                        <span className="convrow__arrow">
                          <Icon name="chevron-right" size={13} />
                        </span>
                        <div className="convrow__sel">
                          <select
                            value={r.targetExt}
                            disabled={busy}
                            onChange={(e) =>
                              patch(r.id, {
                                targetExt: e.target.value,
                                status: 'idle',
                                outputs: []
                              })
                            }
                          >
                            {r.targets.map((t) => (
                              <option key={t.ext} value={t.ext}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <Icon name="chevron-down" size={12} />
                        </div>
                        {r.targets.find((t) => t.ext === r.targetExt)?.note && (
                          <span className="convrow__note">
                            {r.targets.find((t) => t.ext === r.targetExt)?.note}
                          </span>
                        )}
                      </div>
                      {(r.status === 'running' || r.status === 'done') && (
                        <div className="convrow__prog">
                          <Progress
                            value={r.status === 'done' ? 1 : r.progress > 0 ? r.progress : -1}
                          />
                          <span>{r.statusText}</span>
                        </div>
                      )}
                      {r.status === 'error' && <div className="convrow__err">{r.error}</div>}
                    </div>
                    <div className="convrow__actions">
                      {r.status === 'running' && <Spinner size={15} />}
                      {r.status === 'done' && (
                        <>
                          <span className="convrow__badge is-ok">
                            <Icon name="check" size={13} />
                          </span>
                          {r.outputs[0] && (
                            <IconButton
                              name="search"
                              label="Im Finder zeigen"
                              onClick={() => window.api.showItemInFolder(r.outputs[0])}
                            />
                          )}
                        </>
                      )}
                      {r.status === 'error' && (
                        <span className="convrow__badge is-err">
                          <Icon name="x" size={13} />
                        </span>
                      )}
                      {r.status === 'idle' && !busy && (
                        <IconButton
                          name="x"
                          label="Entfernen"
                          onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))}
                        />
                      )}
                    </div>
                  </div>
                ))}

                <button
                  className={cx('conv__ghost', dragging && 'is-over')}
                  disabled={busy}
                  onClick={() => void addViaDialog()}
                >
                  <Icon name="plus" size={16} />
                  Weitere Dateien hinzufügen
                </button>
              </div>

              {!busy && (
                <button className="conv__clear" onClick={() => setRows([])}>
                  Liste leeren
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <footer className="conv__foot">
          <div className="conv__outopt">
            <span className="conv__outlabel">Ausgabe</span>
            <Segmented
              value={effMode}
              onChange={(m) => (m === 'folder' ? void pickFolder() : setOutMode('beside'))}
              options={[
                { value: 'beside', label: 'Neben Original' },
                {
                  value: 'folder',
                  label: outDir ? outDir.split('/').pop() || 'Ordner' : 'Ordner …'
                }
              ]}
            />
          </div>
          <div className="conv__footright">
            {busy && (
              <div className="conv__overall">
                <Progress value={overall} />
              </div>
            )}
            <Button
              variant="primary"
              size="lg"
              icon={busy ? undefined : 'compress'}
              disabled={busy || rows.length === 0}
              onClick={() => void runAll()}
            >
              {busy
                ? 'Konvertiere …'
                : `${rows.length} Datei${rows.length === 1 ? '' : 'en'} konvertieren`}
            </Button>
          </div>
        </footer>
      )}

      {dragging && (
        <div className="conv__overlay">
          <div className="conv__overlaybox">
            <Icon name="upload" size={28} />
            <span>Dateien hier ablegen</span>
          </div>
        </div>
      )}
    </div>
  )
}
