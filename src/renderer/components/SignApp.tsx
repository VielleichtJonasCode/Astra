import { useEffect, useState } from 'react'
import { useShellStore } from '../store/shellStore'
import { Icon } from './common/Icon'
import { Button } from './common/Button'
import { Tooltip } from './common/Tooltip'
import { Sheet } from './common/Sheet'
import { TextInput } from './common/controls'
import { Field } from './common/Field'
import { toast } from './common/toast'
import { AstraMark } from './AstraMark'
import { cx } from '../lib/cx'
import {
  exportEncryptedKey,
  getMacKey,
  importEncryptedKey,
  regenerateMacKey,
  type MacKey
} from '../sign/keys'
import { appendMacSignature, verifyMacSignature, type VerifyResult } from '../sign/trailer'
import './signapp.css'

interface KnownKey {
  keyId: string
  label: string
}
interface AskState {
  title: string
  label: string
  password?: boolean
  hint?: string
  resolve: (value: string | null) => void
}
const KNOWN = 'astra.knownKeys'
function loadKnown(): KnownKey[] {
  try {
    return JSON.parse(localStorage.getItem(KNOWN) ?? '[]') as KnownKey[]
  } catch {
    return []
  }
}
function saveKnown(list: KnownKey[]): void {
  try {
    localStorage.setItem(KNOWN, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

const STATUS: Record<
  VerifyResult['status'],
  { icon: Parameters<typeof Icon>[0]['name']; title: string; cls: string }
> = {
  ok: { icon: 'check', title: 'Von diesem Mac signiert', cls: 'is-ok' },
  foreign: { icon: 'signature', title: 'Gültig signiert – anderer Schlüssel', cls: 'is-foreign' },
  modified: { icon: 'info', title: 'Dokument nach dem Signieren verändert', cls: 'is-warn' },
  invalid: { icon: 'x', title: 'Signatur ungültig', cls: 'is-bad' },
  none: { icon: 'info', title: 'Keine Astra-Signatur gefunden', cls: 'is-none' }
}

export function SignApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const [key, setKey] = useState<MacKey | null>(null)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [over, setOver] = useState(false)
  const [known, setKnown] = useState<KnownKey[]>(() => loadKnown())
  const [ask, setAsk] = useState<AskState | null>(null)
  const [askVal, setAskVal] = useState('')

  // window.prompt() gibt es in Electron nicht – eigener Mini-Dialog.
  const askInput = (opts: Omit<AskState, 'resolve'>): Promise<string | null> => {
    setAskVal('')
    return new Promise((resolve) => setAsk({ ...opts, resolve }))
  }
  const askDone = (value: string | null): void => {
    ask?.resolve(value)
    setAsk(null)
    setAskVal('')
  }

  useEffect(() => {
    getMacKey()
      .then(setKey)
      .catch(() => undefined)
    if (/[#&]signtest=1/.test(location.hash)) void runSignSelfTest()
  }, [])

  const check = async (bytes: Uint8Array): Promise<void> => {
    setChecking(true)
    setResult(null)
    try {
      setResult(await verifyMacSignature(bytes))
    } catch {
      setResult({ status: 'invalid' })
    } finally {
      setChecking(false)
    }
  }
  const pickAndCheck = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked?.[0]) return
    const f = await window.api.readFile(picked[0].path)
    void check(f.bytes)
  }

  const signPdf = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked?.[0]) return
    const f = await window.api.readFile(picked[0].path)
    if (!/\.pdf$/i.test(f.name)) {
      toast.error('Bitte eine PDF-Datei wählen.')
      return
    }
    try {
      const out = await appendMacSignature(f.bytes)
      const path = await window.api.saveDialog({
        defaultName: f.name.replace(/\.pdf$/i, '-signiert.pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (!path) return
      await window.api.writeFile(path, out)
      toast.success('PDF signiert.', {
        label: 'Zeigen',
        run: () => window.api.showItemInFolder(path)
      })
    } catch (e) {
      toast.error(`Signieren fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannt'}`)
    }
  }

  const sharePublic = async (): Promise<void> => {
    if (!key) return
    const text = [
      'Astra – öffentlicher Signaturschlüssel',
      `Kennung: ${key.keyId}`,
      `Erstellt: ${new Date(key.created).toLocaleString('de-DE')}`,
      `Schlüssel (Base64): ${key.publicRawB64}`,
      '',
      'Mit diesem Schlüssel kann jemand im Signatur-Werkzeug prüfen,',
      'ob eine PDF wirklich von diesem Mac signiert wurde.'
    ].join('\n')
    const path = await window.api.saveDialog({
      defaultName: 'astra-schluessel.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (!path) return
    await window.api.writeFile(path, new TextEncoder().encode(text))
    toast.success('Öffentlichen Schlüssel gesichert.')
  }

  const regenerate = async (): Promise<void> => {
    if (
      !confirm(
        'Neuen Schlüssel erzeugen? Bereits signierte PDFs gelten danach als „fremd signiert".'
      )
    )
      return
    setKey(await regenerateMacKey())
    setResult(null)
    toast.success('Neuer Schlüssel erzeugt.')
  }

  const backupKey = async (): Promise<void> => {
    const pw = (
      await askInput({
        title: 'Schlüssel sichern',
        label: 'Passwort für die Datei',
        password: true,
        hint: 'Mindestens 6 Zeichen. Ohne dieses Passwort lässt sich der Schlüssel nicht wieder laden.'
      })
    )?.trim()
    if (!pw) return
    if (pw.length < 6) {
      toast.error('Passwort zu kurz (mindestens 6 Zeichen).')
      return
    }
    try {
      const text = await exportEncryptedKey(pw)
      const path = await window.api.saveDialog({
        defaultName: 'astra-signaturschluessel.txt',
        filters: [{ name: 'Text', extensions: ['txt', 'astrakey'] }]
      })
      if (!path) return
      await window.api.writeFile(path, new TextEncoder().encode(text))
      toast.success('Verschlüsselte Schlüsseldatei gesichert.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export fehlgeschlagen.')
    }
  }

  const copyKeyForPhone = async (): Promise<void> => {
    const pw = (
      await askInput({
        title: 'Schlüssel als Text kopieren',
        label: 'Passwort für den Schlüssel',
        password: true,
        hint: 'Der verschlüsselte Text landet in der Zwischenablage. Schick ihn dir aufs iPhone (z. B. per Notizen) und füge ihn dort in der Web-App ein.'
      })
    )?.trim()
    if (!pw) return
    if (pw.length < 6) {
      toast.error('Passwort zu kurz (mindestens 6 Zeichen).')
      return
    }
    try {
      await navigator.clipboard.writeText(await exportEncryptedKey(pw))
      toast.success('Verschlüsselter Schlüssel in der Zwischenablage.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kopieren fehlgeschlagen.')
    }
  }

  const restoreKey = async (): Promise<void> => {
    if (!confirm('Schlüssel aus Datei laden? Der aktuelle Schlüssel dieses Macs wird ersetzt.'))
      return
    const picked = await window.api.openAnyFiles()
    if (!picked?.[0]) return
    const pw = (
      await askInput({
        title: 'Schlüssel laden',
        label: 'Passwort der Schlüsseldatei',
        password: true
      })
    )?.trim()
    if (!pw) return
    try {
      const f = await window.api.readFile(picked[0].path)
      const k = await importEncryptedKey(new TextDecoder().decode(f.bytes), pw)
      setKey(k)
      setResult(null)
      toast.success('Schlüssel übernommen – dieser Mac signiert jetzt mit derselben Identität.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import fehlgeschlagen.')
    }
  }

  const rememberForeign = async (): Promise<void> => {
    if (!result?.keyId) return
    const label = (
      await askInput({
        title: 'Schlüssel merken',
        label: 'Name für diesen Schlüssel (z. B. Person)'
      })
    )?.trim()
    if (!label) return
    const next = [...known.filter((k) => k.keyId !== result.keyId), { keyId: result.keyId, label }]
    setKnown(next)
    saveKnown(next)
    toast.success('Schlüssel gemerkt.')
  }

  const knownLabel = result?.keyId ? known.find((k) => k.keyId === result.keyId)?.label : undefined

  return (
    <div
      className="sig"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) f.arrayBuffer().then((ab) => check(new Uint8Array(ab)))
      }}
    >
      <div className="sig__glow" aria-hidden />
      <header className="sig__bar drag-region">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <div className="sig__title">Signatur-Werkzeug</div>
        <div style={{ width: 92 }} />
      </header>

      <div className="sig__scroll">
        <div className="sig__inner">
          <section className="sig__card">
            <div className="sig__cardtitle">
              <Icon name="lock" size={14} /> Dein Mac-Schlüssel
            </div>
            <p className="sig__lead">
              Jedes PDF, das du in Astra mit deiner Unterschrift versiehst, bekommt zusätzlich diese
              unsichtbare Kennung angehängt – unabhängig von deiner gezeichneten Signatur. Der
              private Schlüssel bleibt nur auf diesem Mac.
            </p>
            <div className="sig__keyid">{key ? key.keyId : '– – – –'}</div>
            <div className="sig__keymeta">
              {key
                ? `erstellt am ${new Date(key.created).toLocaleDateString('de-DE')}`
                : 'wird geladen …'}
            </div>
            <div className="sig__row">
              <Button icon="signature-pen" onClick={() => void signPdf()}>
                Vorhandene PDF signieren …
              </Button>
              <Button icon="upload" onClick={() => void sharePublic()}>
                Öffentlichen Schlüssel teilen
              </Button>
              <Button variant="ghost" onClick={() => void regenerate()}>
                Neuen Schlüssel …
              </Button>
            </div>
            <div className="sig__subcard">
              <div className="sig__subtitle">Auf iPhone & Windows mitnehmen</div>
              <p className="sig__lead">
                Sichere den Schlüssel verschlüsselt und lade ihn auf dem anderen Gerät – dann
                signierst du überall mit derselben Identität. Fürs iPhone gibt es die Web-App
                („astra-signieren"). Tipp: dort am einfachsten den kopierten Text einfügen.
              </p>
              <div className="sig__row">
                <Button icon="copy" onClick={() => void copyKeyForPhone()}>
                  Als Text kopieren (fürs iPhone)
                </Button>
                <Button icon="download" onClick={() => void backupKey()}>
                  Als Datei sichern …
                </Button>
                <Button icon="upload" onClick={() => void restoreKey()}>
                  Schlüssel laden …
                </Button>
              </div>
            </div>
          </section>

          <section className="sig__card">
            <div className="sig__cardtitle">
              <Icon name="search" size={14} /> Signatur prüfen
            </div>
            <div className={cx('sig__drop', over && 'is-over')}>
              <Icon name="signature" size={26} />
              <span>PDF hierher ziehen oder wählen</span>
              <Button variant="primary" icon="page" onClick={() => void pickAndCheck()}>
                PDF wählen …
              </Button>
            </div>

            {checking && <div className="sig__result">Wird geprüft …</div>}

            {result && !checking && (
              <div className={cx('sig__result', STATUS[result.status].cls)}>
                <div className="sig__resulthead">
                  <span className="sig__resulticon">
                    <Icon name={STATUS[result.status].icon} size={16} />
                  </span>
                  <strong>{STATUS[result.status].title}</strong>
                </div>
                {result.status !== 'none' && (
                  <dl className="sig__details">
                    {result.keyId && (
                      <>
                        <dt>Kennung</dt>
                        <dd className="sig__mono">
                          {result.keyId}
                          {result.isMine && <span className="sig__badge">dein Mac</span>}
                          {!result.isMine && knownLabel && (
                            <span className="sig__badge sig__badge--known">{knownLabel}</span>
                          )}
                        </dd>
                      </>
                    )}
                    {result.created && (
                      <>
                        <dt>Signiert</dt>
                        <dd>{new Date(result.created).toLocaleString('de-DE')}</dd>
                      </>
                    )}
                    {result.note && (
                      <>
                        <dt>Notiz</dt>
                        <dd>{result.note}</dd>
                      </>
                    )}
                  </dl>
                )}
                {result.status === 'foreign' && !knownLabel && (
                  <Button onClick={() => void rememberForeign()}>Diesen Schlüssel merken …</Button>
                )}
                {result.status === 'modified' && (
                  <p className="sig__hint">
                    Die Signatur ist echt, aber die Datei wurde nach dem Signieren gespeichert oder
                    bearbeitet.
                  </p>
                )}
              </div>
            )}
          </section>

          {known.length > 0 && (
            <section className="sig__card">
              <div className="sig__cardtitle">
                <Icon name="layers" size={14} /> Bekannte Schlüssel
              </div>
              <ul className="sig__known">
                {known.map((k) => (
                  <li key={k.keyId}>
                    <span>{k.label}</span>
                    <code>{k.keyId}</code>
                    <button
                      onClick={() => {
                        const next = known.filter((x) => x.keyId !== k.keyId)
                        setKnown(next)
                        saveKnown(next)
                      }}
                      title="Entfernen"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {ask && (
        <Sheet
          title={ask.title}
          subtitle={ask.hint}
          onClose={() => askDone(null)}
          footer={
            <>
              <Button onClick={() => askDone(null)}>Abbrechen</Button>
              <Button variant="primary" onClick={() => askDone(askVal)}>
                OK
              </Button>
            </>
          }
        >
          <Field label={ask.label} stack>
            <TextInput
              type={ask.password ? 'password' : 'text'}
              autoFocus
              value={askVal}
              onChange={(e) => setAskVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') askDone(askVal)
              }}
            />
          </Field>
        </Sheet>
      )}
    </div>
  )
}

/* ---------- Dev-Selbsttest ---------- */

async function runSignSelfTest(): Promise<void> {
  try {
    const base = new TextEncoder().encode('%PDF-1.7\n... beispielhafter Inhalt ...\n%%EOF\n')
    const signed = await appendMacSignature(base)
    const r1 = await verifyMacSignature(signed)
    const tampered = new Uint8Array(signed)
    tampered[20] = tampered[20] ^ 0xff
    const r2 = await verifyMacSignature(tampered)
    const r3 = await verifyMacSignature(base)

    // Verschlüsselter Export/Import (Format der geteilten .astrakey-Datei)
    const mod = await import('../sign/keys')
    const before = (await mod.getMacKey()).keyId
    const file = await mod.exportEncryptedKey('geheim123')
    let wrongOk = false
    try {
      await mod.importEncryptedKey(file, 'falsch')
    } catch {
      wrongOk = true
    }
    const after = (await mod.importEncryptedKey(file, 'geheim123')).keyId
    const signed2 = await appendMacSignature(base)
    const r4 = await verifyMacSignature(signed2)

    const ok =
      r1.status === 'ok' &&
      r1.isMine === true &&
      (r2.status === 'modified' || r2.status === 'invalid') &&
      r3.status === 'none' &&
      wrongOk &&
      after === before &&
      r4.status === 'ok'
    console.log(
      ok
        ? 'SIGNTEST OK'
        : `SIGNTEST FAIL r1=${r1.status} r2=${r2.status} r3=${r3.status} pwGuard=${wrongOk} keyRT=${after === before} r4=${r4.status}`
    )
  } catch (e) {
    console.log(`SIGNTEST FAIL ${e instanceof Error ? e.message : e}`)
  }
}
