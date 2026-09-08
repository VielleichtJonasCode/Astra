/**
 * Baut den Apple-Vision-OCR-Helfer (src/native/ocr/main.swift) nach
 * resources/bin/astra-ocr. Läuft vor `dist` / `dist:dir` und `build`.
 *
 * Nur macOS. Schlägt der Build fehl (z. B. kein swiftc), ist das nicht fatal –
 * Astra nutzt dann tesseract.js für die Texterkennung.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src/native/ocr/main.swift')
const outDir = join(root, 'resources/bin')
const out = join(outDir, 'astra-ocr')

if (process.platform !== 'darwin') {
  console.log('[ocr-helper] übersprungen (nur macOS)')
  process.exit(0)
}

function fresh() {
  try {
    return statSync(out).mtimeMs >= statSync(src).mtimeMs
  } catch {
    return false
  }
}

if (fresh() && !process.argv.includes('--force')) {
  console.log('[ocr-helper] aktuell, nichts zu tun')
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
      'Vision',
      '-framework',
      'PDFKit',
      '-framework',
      'Quartz',
      '-framework',
      'ImageIO'
    ],
    { stdio: 'inherit' }
  )
  console.log('[ocr-helper] gebaut →', out)
} catch (err) {
  console.warn(
    '[ocr-helper] Build fehlgeschlagen – Vision-OCR nicht verfügbar, tesseract.js wird genutzt:',
    err.message
  )
}
