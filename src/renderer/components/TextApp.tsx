import { useEffect, useMemo, useState } from 'react'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { TextInput } from './common/controls'
import { toast } from './common/toast'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import {
  OP_GROUPS,
  TEXT_OPS,
  analyze,
  topWords,
  type OpGroup,
  type TextOp
} from '../text/operations'
import './textapp.css'

export function TextApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [text, setText] = useState('')
  const [past, setPast] = useState<string[]>([])
  const [future, setFuture] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const [find, setFind] = useState('')
  const [repl, setRepl] = useState('')
  const [useRe, setUseRe] = useState(false)
  const [caseSens, setCaseSens] = useState(false)

  const commit = (next: string): void => {
    setPast((p) => [...p.slice(-80), text])
    setFuture([])
    setText(next)
  }
  const undo = (): void => {
    setPast((p) => {
      if (!p.length) return p
      setFuture((f) => [text, ...f].slice(0, 80))
      setText(p[p.length - 1])
      return p.slice(0, -1)
    })
  }
  const redo = (): void => {
    setFuture((f) => {
      if (!f.length) return f
      setPast((p) => [...p, text])
      setText(f[0])
      return f.slice(1)
    })
  }

  const runOp = async (op: TextOp): Promise<void> => {
    if (!text) return
    setBusy(true)
    try {
      const out = await op.run(text)
      commit(out)
    } catch (e) {
      toast.error(`${op.label}: ${e instanceof Error ? e.message : 'Fehler'}`)
    } finally {
      setBusy(false)
    }
  }

  const regex = useMemo(() => {
    if (!find) return null
    try {
      const src = useRe ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(src, caseSens ? 'g' : 'gi')
    } catch {
      return null
    }
  }, [find, useRe, caseSens])

  const matchCount = useMemo(() => {
    if (!regex || !text) return 0
    return (text.match(regex) ?? []).length
  }, [regex, text])

  const doReplace = (): void => {
    if (!regex) return
    commit(text.replace(regex, repl))
  }

  const openFile = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked?.[0]) return
    const f = await window.api.readFile(picked[0].path)
    commit(new TextDecoder().decode(f.bytes))
  }
  const save = async (): Promise<void> => {
    const path = await window.api.saveDialog({
      defaultName: 'text.txt',
      filters: [{ name: 'Text', extensions: ['txt', 'md', 'csv', 'json'] }]
    })
    if (!path) return
    await window.api.writeFile(path, new TextEncoder().encode(text))
    toast.success('Gesichert.', { label: 'Zeigen', run: () => window.api.showItemInFolder(path) })
  }

  const stats = useMemo(() => analyze(text), [text])
  const words = useMemo(() => topWords(text), [text])
  const maxWord = words[0]?.count ?? 1

  useEffect(() => {
    if (/[#&]texttest=1/.test(location.hash)) void runTextSelfTest()
    else if (/[#&]view=text/.test(location.hash) && !text) {
      setText(
        'Hallo Welt\nzebra\nApfel\napfel\n\nJSON: {"b":2,"a":1}\n\nEine kurze Demo für das Text-Werkzeug. Sie zeigt Wörter, Zeilen und Sätze.'
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="txt"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f) f.text().then((t) => commit(t))
      }}
    >
      <div className="txt__glow" aria-hidden />

      <header className="txt__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="txt__title">Text-Werkzeug</div>
        <div className="txt__headact no-drag">
          <IconButton
            name="undo"
            label="Aktion rückgängig"
            disabled={!past.length}
            onClick={undo}
          />
          <IconButton
            name="redo"
            label="Aktion wiederholen"
            disabled={!future.length}
            onClick={redo}
          />
        </div>
      </header>

      <div className="txt__body">
        <div className="txt__main">
          <div className="txt__ops">
            {OP_GROUPS.map((g) => (
              <OpGroupRow key={g} group={g} busy={busy} run={runOp} />
            ))}
          </div>

          <textarea
            className="txt__area"
            value={text}
            spellCheck={false}
            placeholder="Text hier einfügen oder eine Datei hineinziehen …"
            onChange={(e) => setText(e.target.value)}
          />

          <div className="txt__actionbar">
            <Button icon="upload" onClick={() => void openFile()}>
              Öffnen
            </Button>
            <Button
              icon="copy"
              disabled={!text}
              onClick={() => {
                void navigator.clipboard.writeText(text)
                toast.success('Kopiert.')
              }}
            >
              Kopieren
            </Button>
            <Button icon="download" disabled={!text} onClick={() => void save()}>
              Speichern
            </Button>
            <span className="txt__spacer" />
            <Button variant="ghost" icon="trash" disabled={!text} onClick={() => commit('')}>
              Leeren
            </Button>
          </div>
        </div>

        <aside className="txt__side">
          <section className="txt__sec">
            <div className="txt__sectitle">
              <Icon name="search" size={13} /> Suchen &amp; Ersetzen
            </div>
            <TextInput
              placeholder="Suchen"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
            <TextInput
              placeholder="Ersetzen durch"
              value={repl}
              onChange={(e) => setRepl(e.target.value)}
            />
            <div className="txt__reopts">
              <button
                className={cx('txt__toggle', useRe && 'is-on')}
                title="Regulärer Ausdruck"
                onClick={() => setUseRe((x) => !x)}
              >
                .*
              </button>
              <button
                className={cx('txt__toggle', caseSens && 'is-on')}
                title="Groß-/Kleinschreibung beachten"
                onClick={() => setCaseSens((x) => !x)}
              >
                Aa
              </button>
              <span className="txt__matches">
                {find ? (regex ? `${matchCount} Treffer` : 'ungültig') : ''}
              </span>
            </div>
            <Button block disabled={!regex || matchCount === 0} onClick={doReplace}>
              Alle ersetzen
            </Button>
          </section>

          <section className="txt__sec">
            <div className="txt__sectitle">
              <Icon name="hash" size={13} /> Statistik
            </div>
            <div className="txt__stats">
              <Stat k="Zeichen" v={stats.chars} />
              <Stat k="ohne Leerzeichen" v={stats.charsNoSpace} />
              <Stat k="Wörter" v={stats.words} />
              <Stat k="Zeilen" v={stats.linesCount} />
              <Stat k="Absätze" v={stats.paragraphs} />
              <Stat k="Sätze" v={stats.sentences} />
              <Stat k="Bytes (UTF-8)" v={stats.bytes} />
              <Stat k="Lesezeit" v={`~${stats.readMin} min`} />
            </div>
          </section>

          {words.length > 0 && (
            <section className="txt__sec">
              <div className="txt__sectitle">
                <Icon name="layers" size={13} /> Häufige Wörter
              </div>
              <div className="txt__words">
                {words.map((w) => (
                  <div key={w.word} className="txt__word">
                    <span
                      className="txt__wordbar"
                      style={{ width: `${(w.count / maxWord) * 100}%` }}
                    />
                    <span className="txt__wordlabel">{w.word}</span>
                    <span className="txt__wordcount">{w.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function OpGroupRow({
  group,
  busy,
  run
}: {
  group: OpGroup
  busy: boolean
  run: (op: TextOp) => void
}): JSX.Element {
  const ops = TEXT_OPS.filter((o) => o.group === group)
  return (
    <div className="txt__opgroup">
      <span className="txt__opcap">{group}</span>
      <div className="txt__opchips">
        {ops.map((o) => (
          <button key={o.id} className="txt__opchip" disabled={busy} onClick={() => run(o)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

async function runTextSelfTest(): Promise<void> {
  const get = (id: string): TextOp => TEXT_OPS.find((o) => o.id === id) as TextOp
  const checks: [string, boolean][] = []
  try {
    checks.push([
      'base64 roundtrip',
      (await get('b64dec').run(await get('b64enc').run('Grüße äöü €'))) === 'Grüße äöü €'
    ])
    checks.push(['sort A→Z', (await get('sortAsc').run('b\na\nc')) === 'a\nb\nc'])
    checks.push(['dedupe', (await get('dedupe').run('x\nx\ny')) === 'x\ny'])
    checks.push(['json pretty', (await get('jsonPretty').run('{"a":1}')).includes('\n  "a": 1')])
    checks.push([
      'json sort keys',
      (await get('jsonSort').run('{"b":2,"a":1}')).startsWith('{\n  "a"')
    ])
    checks.push(['csv→json', JSON.parse(await get('csv2json').run('a,b\n1,2'))[0].b === '2'])
    checks.push([
      'sha256',
      (await get('sha256').run('abc')) ===
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    ])
    checks.push([
      'slug',
      (await get('slug').run('Ärger mit Öl & Wasser')) === 'aerger-mit-oel-wasser'
    ])
    checks.push(['rot13', (await get('rot13').run('Hello')) === 'Uryyb'])
  } catch (e) {
    console.log(`TEXTTEST FAIL exception ${e instanceof Error ? e.message : e}`)
    return
  }
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n)
  console.log(failed.length ? `TEXTTEST FAIL ${failed.join(', ')}` : 'TEXTTEST OK')
}

function Stat({ k, v }: { k: string; v: number | string }): JSX.Element {
  return (
    <div className="txt__stat">
      <span className="txt__statk">{k}</span>
      <span className="txt__statv">{typeof v === 'number' ? v.toLocaleString('de-DE') : v}</span>
    </div>
  )
}
