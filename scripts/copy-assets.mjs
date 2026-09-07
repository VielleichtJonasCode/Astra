/**
 * Kopiert Laufzeit-Assets, die nicht gebündelt werden können, nach
 * src/renderer/public/. Läuft automatisch vor `dev` und `build`.
 */
import { cp, mkdir, rm, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pub = resolve(root, 'src/renderer/public')

const jobs = [
  {
    from: resolve(root, 'node_modules/pdfjs-dist/cmaps'),
    to: resolve(pub, 'pdfjs/cmaps')
  },
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
  }
]

for (const job of jobs) {
  try {
    await access(job.from)
  } catch {
    console.warn(`[copy-assets] übersprungen (fehlt): ${job.from}`)
    continue
  }
  await rm(job.to, { recursive: true, force: true })
  await mkdir(dirname(job.to), { recursive: true })
  await cp(job.from, job.to, { recursive: true, filter: job.filter })
  console.log(`[copy-assets] ${job.from} → ${job.to}`)
}
