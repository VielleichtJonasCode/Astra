/**
 * Baut den EventKit-Kalender-Helfer (src/native/cal/main.swift) nach
 * resources/bin/astra-cal. Läuft vor `dist` / `dist:dir` und `build`.
 *
 * Nur macOS. Schlägt der Build fehl, ist das nicht fatal – der Studienplaner
 * zeigt dann einfach keinen Kalender an.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src/native/cal/main.swift')
const plist = join(root, 'src/native/cal/Info.plist')
const outDir = join(root, 'resources/bin')
const out = join(outDir, 'astra-cal')

if (process.platform !== 'darwin') {
  console.log('[cal-helper] übersprungen (nur macOS)')
  process.exit(0)
}

function fresh() {
  try {
    const o = statSync(out).mtimeMs
    return o >= statSync(src).mtimeMs && o >= statSync(plist).mtimeMs
  } catch {
    return false
  }
}

if (fresh() && !process.argv.includes('--force')) {
  console.log('[cal-helper] aktuell, nichts zu tun')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })

try {
  execFileSync(
    'swiftc',
    [
      '-O',
      '-o',
      out,
      src,
      '-framework',
      'EventKit',
      '-framework',
      'AppKit',
      '-Xlinker',
      '-sectcreate',
      '-Xlinker',
      '__TEXT',
      '-Xlinker',
      '__info_plist',
      '-Xlinker',
      plist
    ],
    { stdio: 'inherit' }
  )
  console.log('[cal-helper] gebaut →', out)
} catch (err) {
  console.warn('[cal-helper] Build fehlgeschlagen – Kalender im Studienplaner nicht verfügbar:', err.message)
}
