import { useEffect, useMemo, useState } from 'react'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Tooltip } from './common/Tooltip'
import { TextInput } from './common/controls'
import { toast } from './common/toast'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import {
  UNIT_CATEGORIES,
  convertWithin,
  fmtNumber,
  hexToRgb,
  hslToRgb,
  parseInBase,
  rgbToHex,
  rgbToHsl,
  type UnitCategory
} from '../units/data'
import './unitsapp.css'

type Panel = string // category id | 'numbase' | 'color' | 'datetime'

const EXTRA: { id: Panel; label: string }[] = [
  { id: 'numbase', label: 'Zahlensystem' },
  { id: 'color', label: 'Farbe' },
  { id: 'datetime', label: 'Datum & Zeit' }
]

export function UnitsApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [panel, setPanel] = useState<Panel>('length')

  useEffect(() => {
    if (/[#&]unittest=1/.test(location.hash)) runUnitSelfTest()
  }, [])

  const cat = UNIT_CATEGORIES.find((c) => c.id === panel)

  return (
    <div className="uni">
      <div className="uni__glow" aria-hidden />
      <header className="uni__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="uni__title">Umrechner</div>
        <div style={{ width: 92 }} />
      </header>

      <div className="uni__body">
        <nav className="uni__nav">
          {UNIT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={cx('uni__navitem', panel === c.id && 'is-active')}
              onClick={() => setPanel(c.id)}
            >
              {c.label}
            </button>
          ))}
          <div className="uni__navsep" />
          {EXTRA.map((e) => (
            <button
              key={e.id}
              className={cx('uni__navitem', panel === e.id && 'is-active')}
              onClick={() => setPanel(e.id)}
            >
              {e.label}
            </button>
          ))}
        </nav>

        <div className="uni__panel">
          {cat ? (
            <UnitPanel key={cat.id} cat={cat} />
          ) : panel === 'numbase' ? (
            <NumberBasePanel />
          ) : panel === 'color' ? (
            <ColorPanel />
          ) : (
            <DateTimePanel />
          )}
        </div>
      </div>
    </div>
  )
}

function copy(text: string): void {
  void navigator.clipboard.writeText(text)
  toast.success('Kopiert.')
}

function runUnitSelfTest(): void {
  const near = (a: number, b: number, eps = 1e-6): boolean =>
    Math.abs(a - b) < eps * Math.max(1, Math.abs(b))
  const cat = (id: string): UnitCategory => UNIT_CATEGORIES.find((c) => c.id === id) as UnitCategory
  const checks: [string, boolean][] = [
    ['1 km = 1000 m', near(convertWithin(cat('length'), 1, 'km').m, 1000)],
    ['1 mi = 1609.344 m', near(convertWithin(cat('length'), 1, 'mi').m, 1609.344)],
    ['100 °C = 212 °F', near(convertWithin(cat('temp'), 100, 'c').f, 212, 1e-4)],
    ['0 °C = 273.15 K', near(convertWithin(cat('temp'), 0, 'c').k, 273.15, 1e-4)],
    ['1 KiB = 1024 B', near(convertWithin(cat('data'), 1, 'KiB').B, 1024)],
    ['1 bar = 100000 Pa', near(convertWithin(cat('pressure'), 1, 'bar').pa, 100000)],
    ['180° = π rad', near(convertWithin(cat('angle'), 180, 'deg').rad, Math.PI, 1e-9)],
    ['hex FF = 255', parseInBase('FF', 16) === 255],
    ['bin 1010 = 10', parseInBase('1010', 2) === 10],
    [
      '#4f8cff → rgb',
      (() => {
        const r = hexToRgb('#4f8cff')
        return !!r && r.r === 79 && r.g === 140 && r.b === 255
      })()
    ],
    [
      'rgb→hsl→rgb roundtrip',
      (() => {
        const back = hslToRgb(rgbToHsl({ r: 79, g: 140, b: 255 }))
        return (
          Math.abs(back.r - 79) <= 2 && Math.abs(back.g - 140) <= 2 && Math.abs(back.b - 255) <= 2
        )
      })()
    ]
  ]
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n)
  console.log(failed.length ? `UNITTEST FAIL ${failed.join(' | ')}` : 'UNITTEST OK')
}

/* ==================== Einheiten ==================== */

function UnitPanel({ cat }: { cat: UnitCategory }): JSX.Element {
  const [fromId, setFromId] = useState(cat.units[Math.min(4, cat.units.length - 1)].id)
  const [raw, setRaw] = useState('1')

  const value = parseFloat(raw.replace(',', '.'))
  const results = useMemo(
    () => (isFinite(value) ? convertWithin(cat, value, fromId) : {}),
    [cat, value, fromId]
  )

  return (
    <div className="uni__unitgrid">
      <h2 className="uni__h2">{cat.label}</h2>
      {cat.units.map((u) => {
        const active = u.id === fromId
        const shown = active ? raw : isFinite(value) ? fmtNumber(results[u.id] ?? NaN) : ''
        return (
          <div key={u.id} className={cx('uni__row', active && 'is-active')}>
            <label className="uni__rowlabel">{u.label}</label>
            <input
              className="uni__rowinput"
              inputMode="decimal"
              value={shown}
              onChange={(e) => {
                setFromId(u.id)
                setRaw(e.target.value)
              }}
            />
            <button
              className="uni__rowcopy"
              title="Wert kopieren"
              onClick={() => copy(active ? raw : String(results[u.id] ?? ''))}
            >
              <Icon name="copy" size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ==================== Zahlensystem ==================== */

function NumberBasePanel(): JSX.Element {
  const [dec, setDec] = useState(255)
  const [active, setActive] = useState<'bin' | 'oct' | 'dec' | 'hex'>('dec')
  const [raw, setRaw] = useState('255')

  const bases: {
    id: 'bin' | 'oct' | 'dec' | 'hex'
    label: string
    base: number
    render: (n: number) => string
  }[] = [
    { id: 'bin', label: 'Binär', base: 2, render: (n) => n.toString(2) },
    { id: 'oct', label: 'Oktal', base: 8, render: (n) => n.toString(8) },
    { id: 'dec', label: 'Dezimal', base: 10, render: (n) => n.toString(10) },
    { id: 'hex', label: 'Hexadezimal', base: 16, render: (n) => n.toString(16).toUpperCase() }
  ]

  return (
    <div className="uni__unitgrid">
      <h2 className="uni__h2">Zahlensystem</h2>
      {bases.map((b) => {
        const isA = active === b.id
        const shown = isA ? raw : b.render(dec)
        return (
          <div key={b.id} className={cx('uni__row', isA && 'is-active')}>
            <label className="uni__rowlabel">{b.label}</label>
            <input
              className="uni__rowinput uni__rowinput--mono"
              value={shown}
              onChange={(e) => {
                setActive(b.id)
                setRaw(e.target.value)
                const n = parseInBase(e.target.value, b.base)
                if (n != null) setDec(n)
              }}
            />
            <button className="uni__rowcopy" title="Kopieren" onClick={() => copy(shown)}>
              <Icon name="copy" size={13} />
            </button>
          </div>
        )
      })}
      <p className="uni__note">
        {parseInBase(raw, bases.find((x) => x.id === active)!.base) == null
          ? 'Aktuelle Eingabe ist für dieses System ungültig.'
          : `Wert: ${dec.toLocaleString('de-DE')}`}
      </p>
    </div>
  )
}

/* ==================== Farbe ==================== */

function ColorPanel(): JSX.Element {
  const [hex, setHex] = useState('#4f8cff')
  const rgb = hexToRgb(hex) ?? { r: 79, g: 140, b: 255 }
  const hsl = rgbToHsl(rgb)

  const setRgb = (patch: Partial<{ r: number; g: number; b: number }>): void =>
    setHex(rgbToHex({ ...rgb, ...patch }))
  const setHsl = (patch: Partial<{ h: number; s: number; l: number }>): void =>
    setHex(rgbToHex(hslToRgb({ ...hsl, ...patch })))

  const rgbStr = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  const hslStr = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`

  return (
    <div className="uni__color">
      <h2 className="uni__h2">Farbe</h2>
      <div className="uni__swatch" style={{ background: hexToRgb(hex) ? hex : '#000' }}>
        <input
          type="color"
          value={hexToRgb(hex) ? hex : '#000000'}
          onChange={(e) => setHex(e.target.value)}
        />
      </div>

      <div className="uni__colorrow">
        <label>HEX</label>
        <TextInput
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <button className="uni__rowcopy" onClick={() => copy(hex)}>
          <Icon name="copy" size={13} />
        </button>
      </div>

      <div className="uni__triple">
        {(['r', 'g', 'b'] as const).map((k) => (
          <label key={k}>
            {k.toUpperCase()}
            <input
              type="number"
              className="input"
              min={0}
              max={255}
              value={rgb[k]}
              onChange={(e) => setRgb({ [k]: Number(e.target.value) } as Partial<typeof rgb>)}
            />
          </label>
        ))}
        <button className="uni__rowcopy" onClick={() => copy(rgbStr)}>
          <Icon name="copy" size={13} />
        </button>
      </div>

      <div className="uni__triple">
        {(['h', 's', 'l'] as const).map((k) => (
          <label key={k}>
            {k.toUpperCase()}
            <input
              type="number"
              className="input"
              min={0}
              max={k === 'h' ? 360 : 100}
              value={hsl[k]}
              onChange={(e) => setHsl({ [k]: Number(e.target.value) } as Partial<typeof hsl>)}
            />
          </label>
        ))}
        <button className="uni__rowcopy" onClick={() => copy(hslStr)}>
          <Icon name="copy" size={13} />
        </button>
      </div>

      <div className="uni__colorout">
        <code>{rgbStr}</code>
        <code>{hslStr}</code>
      </div>
    </div>
  )
}

/* ==================== Datum & Zeit ==================== */

function DateTimePanel(): JSX.Element {
  const [ms, setMs] = useState(() => Date.now())
  const d = new Date(ms)
  const valid = !Number.isNaN(d.getTime())

  const rel = (): string => {
    const diff = ms - Date.now()
    const abs = Math.abs(diff)
    const units: [number, string][] = [
      [86400000, 'Tag'],
      [3600000, 'Std.'],
      [60000, 'Min.'],
      [1000, 'Sek.']
    ]
    for (const [u, name] of units) {
      if (abs >= u) {
        const n = Math.round(diff / u)
        return n === 0 ? 'jetzt' : n > 0 ? `in ${n} ${name}` : `vor ${-n} ${name}`
      }
    }
    return 'jetzt'
  }

  const rows: { label: string; value: string; onChange: (v: string) => void }[] = [
    {
      label: 'Unix (Sekunden)',
      value: valid ? String(Math.floor(ms / 1000)) : '',
      onChange: (v) => {
        if (v.trim() && isFinite(Number(v))) setMs(Number(v) * 1000)
      }
    },
    {
      label: 'Unix (Millisek.)',
      value: valid ? String(ms) : '',
      onChange: (v) => {
        if (v.trim() && isFinite(Number(v))) setMs(Number(v))
      }
    },
    {
      label: 'ISO 8601 (UTC)',
      value: valid ? d.toISOString() : '',
      onChange: (v) => {
        const t = Date.parse(v)
        if (!Number.isNaN(t)) setMs(t)
      }
    },
    {
      label: 'Lokal',
      value: valid ? d.toLocaleString('de-DE') : '',
      onChange: (v) => {
        const t = Date.parse(v)
        if (!Number.isNaN(t)) setMs(t)
      }
    }
  ]

  return (
    <div className="uni__unitgrid">
      <h2 className="uni__h2">Datum &amp; Zeit</h2>
      {rows.map((r) => (
        <div key={r.label} className="uni__row">
          <label className="uni__rowlabel">{r.label}</label>
          <input
            className="uni__rowinput uni__rowinput--mono"
            value={r.value}
            onChange={(e) => r.onChange(e.target.value)}
          />
          <button className="uni__rowcopy" onClick={() => copy(r.value)}>
            <Icon name="copy" size={13} />
          </button>
        </div>
      ))}
      <div className="uni__dtfoot">
        <span>{valid ? rel() : 'ungültiges Datum'}</span>
        <button onClick={() => setMs(Date.now())}>Jetzt</button>
      </div>
    </div>
  )
}
