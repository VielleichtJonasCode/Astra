import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { Select, Toggle } from './common/controls'
import { toast } from './common/toast'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import {
  EXPORT_EXT,
  EXPORT_LABEL,
  guessAndParse,
  normalize,
  serialize,
  type ExportFmt,
  type Grid
} from '../table/format'
import './tableapp.css'

const START: Grid = [
  ['Name', 'Menge', 'Preis'],
  ['Kaffee', '2', '3,50'],
  ['Tee', '1', '2,20'],
  ['Wasser', '6', '0,90']
]

export function TableApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [grid, setGrid] = useState<Grid>(START)
  const [hasHeader, setHasHeader] = useState(true)
  const [fmt, setFmt] = useState<ExportFmt>('csv')
  const [past, setPast] = useState<Grid[]>([])
  const [future, setFuture] = useState<Grid[]>([])
  const editing = useRef(false)

  useEffect(() => {
    if (/[#&]tabletest=1/.test(location.hash)) runTableSelfTest()
  }, [])

  const rows = grid.length
  const cols = grid[0]?.length ?? 0

  const commit = (g: Grid): void => {
    setPast((p) => [...p.slice(-60), grid])
    setFuture([])
    setGrid(normalize(g))
  }
  const undo = (): void => {
    setPast((p) => {
      if (!p.length) return p
      setFuture((f) => [grid, ...f].slice(0, 60))
      setGrid(p[p.length - 1])
      return p.slice(0, -1)
    })
  }
  const redo = (): void => {
    setFuture((f) => {
      if (!f.length) return f
      setPast((p) => [...p, grid])
      setGrid(f[0])
      return f.slice(1)
    })
  }

  const setCell = (r: number, c: number, v: string): void => {
    if (!editing.current) {
      setPast((p) => [...p.slice(-60), grid])
      setFuture([])
      editing.current = true
    }
    setGrid((g) =>
      g.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row))
    )
  }

  const addRow = (): void => commit([...grid, Array(cols).fill('')])
  const delRow = (i: number): void =>
    commit(grid.length > 1 ? grid.filter((_, ri) => ri !== i) : grid)
  const addCol = (): void => commit(grid.map((r) => [...r, '']))
  const delCol = (i: number): void =>
    commit(cols > 1 ? grid.map((r) => r.filter((_, ci) => ci !== i)) : grid)
  const sortBy = (c: number, dir: 1 | -1): void => {
    const head = hasHeader ? grid.slice(0, 1) : []
    const body = hasHeader ? grid.slice(1) : grid
    const sorted = [...body].sort((a, b) => {
      const x = a[c] ?? ''
      const y = b[c] ?? ''
      const nx = parseFloat(x.replace(',', '.'))
      const ny = parseFloat(y.replace(',', '.'))
      const cmp =
        isFinite(nx) && isFinite(ny) ? nx - ny : x.localeCompare(y, 'de', { numeric: true })
      return cmp * dir
    })
    commit([...head, ...sorted])
  }

  const importText = (text: string): void => {
    const g = guessAndParse(text)
    if (g.length) commit(g)
  }
  const paste = async (): Promise<void> => {
    try {
      importText(await navigator.clipboard.readText())
    } catch {
      toast.error('Zwischenablage nicht lesbar.')
    }
  }
  const openFile = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked?.[0]) return
    const f = await window.api.readFile(picked[0].path)
    importText(new TextDecoder().decode(f.bytes))
  }

  const output = useMemo(() => serialize(grid, fmt, hasHeader), [grid, fmt, hasHeader])

  const save = async (): Promise<void> => {
    const path = await window.api.saveDialog({
      defaultName: `tabelle.${EXPORT_EXT[fmt]}`,
      filters: [{ name: EXPORT_LABEL[fmt], extensions: [EXPORT_EXT[fmt]] }]
    })
    if (!path) return
    await window.api.writeFile(path, new TextEncoder().encode(output))
    toast.success('Gesichert.', { label: 'Zeigen', run: () => window.api.showItemInFolder(path) })
  }

  return (
    <div
      className="tbl"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f) f.text().then(importText)
      }}
    >
      <div className="tbl__glow" aria-hidden />
      <header className="tbl__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="tbl__title">Tabellen</div>
        <div className="tbl__headact no-drag">
          <IconButton name="undo" label="Rückgängig" disabled={!past.length} onClick={undo} />
          <IconButton name="redo" label="Wiederholen" disabled={!future.length} onClick={redo} />
        </div>
      </header>

      <div className="tbl__tools">
        <span className="tbl__hdr">
          <Toggle checked={hasHeader} onChange={setHasHeader} label="Kopfzeile" />
          Erste Zeile ist Kopfzeile
        </span>
        <div className="toolbar__spacer" />
        <Button icon="upload" onClick={() => void paste()}>
          Einfügen
        </Button>
        <Button icon="upload" onClick={() => void openFile()}>
          Öffnen
        </Button>
        <Button
          variant="ghost"
          icon="trash"
          onClick={() =>
            commit([
              ['', '', ''],
              ['', '', '']
            ])
          }
        >
          Leeren
        </Button>
      </div>

      <div className="tbl__body">
        <div className="tbl__gridwrap">
          <div
            className="tbl__grid"
            style={{ gridTemplateColumns: `34px repeat(${cols}, minmax(96px, 1fr)) 34px` }}
          >
            {/* Spalten-Steuerzeile */}
            <div className="tbl__corner" />
            {Array.from({ length: cols }, (_, c) => (
              <div key={`h${c}`} className="tbl__colhead">
                <span className="tbl__colname">{colName(c)}</span>
                <button title="Aufsteigend sortieren" onClick={() => sortBy(c, 1)}>
                  <Icon name="chevron-up" size={12} />
                </button>
                <button title="Absteigend sortieren" onClick={() => sortBy(c, -1)}>
                  <Icon name="chevron-down" size={12} />
                </button>
                <button title="Spalte löschen" onClick={() => delCol(c)}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
            <button className="tbl__addcol" title="Spalte hinzufügen" onClick={addCol}>
              <Icon name="plus" size={13} />
            </button>

            {/* Datenzeilen */}
            {grid.map((row, r) => (
              <Fragment key={r}>
                <div className="tbl__rowhead">
                  <span>{hasHeader ? (r === 0 ? '•' : r) : r + 1}</span>
                  <button title="Zeile löschen" onClick={() => delRow(r)}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
                {row.map((val, c) => (
                  <input
                    key={c}
                    className={cx('tbl__cell', hasHeader && r === 0 && 'is-head')}
                    value={val}
                    onFocus={() => (editing.current = false)}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    onBlur={() => (editing.current = false)}
                  />
                ))}
                <div className="tbl__rowend" />
              </Fragment>
            ))}
            <button className="tbl__addrow" title="Zeile hinzufügen" onClick={addRow}>
              <Icon name="plus" size={13} />
            </button>
          </div>
          <div className="tbl__dims">
            {rows} {rows === 1 ? 'Zeile' : 'Zeilen'} · {cols} {cols === 1 ? 'Spalte' : 'Spalten'}
          </div>
        </div>

        <aside className="tbl__side">
          <div className="tbl__sectitle">
            <Icon name="download" size={13} /> Ausgabe
          </div>
          <Select
            value={fmt}
            onChange={(e) => setFmt(e.target.value as ExportFmt)}
            options={(Object.keys(EXPORT_LABEL) as ExportFmt[]).map((f) => ({
              value: f,
              label: EXPORT_LABEL[f]
            }))}
          />
          <pre className="tbl__preview">{output}</pre>
          <div className="tbl__exprow">
            <Button
              variant="primary"
              icon="copy"
              onClick={() => {
                void navigator.clipboard.writeText(output)
                toast.success(`${EXPORT_LABEL[fmt]} kopiert.`)
              }}
            >
              Kopieren
            </Button>
            <Button icon="download" onClick={() => void save()}>
              Speichern
            </Button>
          </div>
          <Button
            block
            icon="columns"
            onClick={() => {
              void navigator.clipboard.writeText(serialize(grid, 'tsv', hasHeader))
              toast.success('Als Tabellen-Zellen kopiert – in Excel/Numbers einfügen.')
            }}
          >
            Für Tabellenkalkulation kopieren
          </Button>
        </aside>
      </div>
    </div>
  )
}

function colName(i: number): string {
  let s = ''
  let n = i
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function runTableSelfTest(): void {
  const checks: [string, boolean][] = []
  const g = guessAndParse('a,b\n1,2\n3,4')
  checks.push(['csv parse', g.length === 3 && g[1][1] === '2'])
  checks.push(['tsv detect', guessAndParse('x\ty\n1\t2')[0][1] === 'y'])
  checks.push(['json parse', guessAndParse('[{"a":1,"b":2}]')[1][0] === '1'])
  checks.push(['csv out quotes', serialize([['a,x', 'b']], 'csv', false) === '"a,x",b'])
  checks.push([
    'md out',
    serialize(
      [
        ['A', 'B'],
        ['1', '2']
      ],
      'markdown',
      true
    ) === '| A | B |\n| --- | --- |\n| 1 | 2 |'
  ])
  checks.push([
    'json out objects',
    JSON.parse(serialize([['a'], ['1'], ['2']], 'json', true)).length === 2
  ])
  checks.push(['html out', serialize([['A'], ['1']], 'html', true).includes('<th>A</th>')])
  checks.push(['latex out', serialize([['a']], 'latex', false).includes('\\begin{tabular}')])
  checks.push(['normalize pads', normalize([['a', 'b'], ['c']])[1].length === 2])
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n)
  console.log(failed.length ? `TABLETEST FAIL ${failed.join(' | ')}` : 'TABLETEST OK')
}
