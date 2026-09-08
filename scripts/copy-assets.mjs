/**
 * Kopiert Laufzeit-Assets, die nicht gebündelt werden können, nach
 * src/renderer/public/. Läuft automatisch vor `dev` und `build`.
 *
 * Überspringt bereits vorhandene, nicht-leere Zielordner (Assets ändern sich nur
 * bei einem Paket-Update). Erzwingen: `node scripts/copy-assets.mjs --force`.
 */
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pub = resolve(root, 'src/renderer/public')
const force = process.argv.includes('--force')

const jobs = [
  { from: resolve(root, 'node_modules/pdfjs-dist/cmaps'), to: resolve(pub, 'pdfjs/cmaps') },
  {
    from: resolve(root, 'node_modules/pdfjs-dist/standard_fonts'),
    to: resolve(pub, 'pdfjs/standard_fonts')
  },
  {
    from: resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'),
    to: resolve(pub, 'tesseract/worker.min.js')
  },
  {
    from: resolve(root, 'node_modules/tesseract.js-core'),
    to: resolve(pub, 'tesseract/core'),
    filter: (src) => src.endsWith('tesseract.js-core') || /\.(wasm|js)$/.test(src)
  },
  {
    from: resolve(root, 'node_modules/@ffmpeg/core/dist/esm'),
    to: resolve(pub, 'ffmpeg')
  }
]

async function present(path) {
  try {
    const st = await stat(path)
    if (st.isDirectory()) return (await readdir(path)).length > 0
    return st.size > 0
  } catch {
    return false
  }
}

for (const job of jobs) {
  if (!(await present(job.from))) {
    console.warn(`[copy-assets] übersprungen (Quelle fehlt): ${job.from}`)
    continue
  }
  if (!force && (await present(job.to))) {
    // Ziel existiert schon – nichts tun (verhindert ENOTEMPTY-Races beim Löschen)
    continue
  }
  try {
    await rm(job.to, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 })
  } catch (err) {
    console.warn(`[copy-assets] rm fehlgeschlagen, überspringe: ${job.to} (${err.code ?? err})`)
    continue
  }
  await mkdir(dirname(job.to), { recursive: true })
  await cp(job.from, job.to, { recursive: true, filter: job.filter })
  console.log(`[copy-assets] ${job.from} → ${job.to}`)
}
