/**
 * Baut die macOS-Widget-Erweiterung (src/native/widgets) nach
 * resources/AstraWidgets.appex, damit electron-builder sie in
 * Contents/PlugIns/ einbetten kann.
 *
 * Läuft NICHT automatisch – nur mit `npm run widgets` oder
 * ASTRA_BUILD_WIDGETS=1. Braucht Xcode + `brew install xcodegen`.
 * Ohne diese Werkzeuge (oder nicht-macOS) wird sauber übersprungen.
 *
 * Die eingebettete .appex erscheint erst in der Widget-Galerie, wenn
 * electron-builder die App signiert (siehe src/native/widgets/README.md).
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const widgetDir = join(root, 'src/native/widgets')
const outAppex = join(root, 'resources/AstraWidgets.appex')

const wanted = process.argv.includes('--force') || process.env.ASTRA_BUILD_WIDGETS === '1'
if (!wanted && !process.argv.includes('--run')) {
  console.log('[widgets] übersprungen (ASTRA_BUILD_WIDGETS=1 oder `npm run widgets` zum Bauen)')
  process.exit(0)
}
if (process.platform !== 'darwin') {
  console.log('[widgets] übersprungen (nur macOS)')
  process.exit(0)
}

function has(cmd) {
  try {
    execFileSync('command', ['-v', cmd], { shell: '/bin/bash', stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (!has('xcodebuild') || !has('xcodegen')) {
  console.warn(
    '[widgets] xcodebuild und/oder xcodegen fehlen – Widget-Erweiterung wird nicht gebaut.\n' +
      '          Xcode installieren und `brew install xcodegen`, dann `npm run widgets`.'
  )
  process.exit(0)
}

try {
  execFileSync('xcodegen', ['generate'], { cwd: widgetDir, stdio: 'inherit' })

  const derived = join(widgetDir, '.build')
  rmSync(derived, { recursive: true, force: true })
  execFileSync(
    'xcodebuild',
    [
      '-project',
      'AstraWidgets.xcodeproj',
      '-scheme',
      'AstraWidgets',
      '-configuration',
      'Release',
      '-derivedDataPath',
      '.build',
      // electron-builder signiert die App als Ganzes noch einmal – hier unsigniert bauen:
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO',
      'build'
    ],
    { cwd: widgetDir, stdio: 'inherit' }
  )

  const built = join(derived, 'Build/Products/Release/AstraWidgets.appex')
  if (!existsSync(built)) throw new Error(`Erwartete .appex nicht gefunden: ${built}`)
  rmSync(outAppex, { recursive: true, force: true })
  mkdirSync(dirname(outAppex), { recursive: true })
  cpSync(built, outAppex, { recursive: true })
  console.log('[widgets] gebaut →', outAppex)
  console.log(
    '[widgets] Jetzt in electron-builder.yml unter `mac.extraFiles` einbinden und Signierung aktivieren – siehe src/native/widgets/README.md'
  )
} catch (err) {
  console.warn('[widgets] Build fehlgeschlagen:', err.message)
  process.exit(0)
}
