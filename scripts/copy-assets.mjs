/**
 * Kopiert Laufzeit-Assets, die nicht gebündelt werden können, nach
 * src/renderer/public/. Läuft automatisch vor `dev` / `build` / `dist`.
 *
 * Kopiert nur neu, wenn die Quelle neuer ist als der letzte Lauf (Stempel-Datei).
 * Räumt bei jedem Lauf versehentliche „datei 2.js"-Dubletten weg – die haben sich
 * früher über viele Builds angesammelt und das app.asar aufgebläht.
 * Erzwingen: `node scripts/copy-assets.mjs --force`.
 */
import { cp, mkdir, rm, readdir, stat, utimes, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
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

async function newestMtime(path) {
  let newest = 0
  const st = await stat(path).catch(() => null)
  if (!st) return 0
  if (!st.isDirectory()) return st.mtimeMs
  for (const name of await readdir(path)) {
    newest = Math.max(newest, await newestMtime(join(path, name)))
  }
  return Math.max(newest, st.mtimeMs)
}

/** Löscht „name 2.js", „name 3.wasm" … rekursiv unter `dir`. */
async function pruneNumberedDupes(dir) {
  const st = await stat(dir).catch(() => null)
  if (!st?.isDirectory()) return 0
  let removed = 0
  for (const name of await readdir(dir)) {
    const full = join(dir, name)
    if (/ \d+\.[A-Za-z0-9]+$/.test(name)) {
      await rm(full, { recursive: true, force: true }).catch(() => undefined)
      removed++
      continue
    }
    removed += await pruneNumberedDupes(full)
  }
  return removed
}

let dupes = 0
for (const job of jobs) {
  const src = await stat(job.from).catch(() => null)
  if (!src) {
    console.warn(`[copy-assets] übersprungen (Quelle fehlt): ${job.from}`)
    continue
  }

  const stamp = `${job.to}.stamp`
  const stampSt = await stat(stamp).catch(() => null)
  const fresh = stampSt && stampSt.mtimeMs >= (await newestMtime(job.from))

  if (fresh && !force) {
    dupes += await pruneNumberedDupes(job.to)
    continue
  }

  await rm(job.to, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }).catch(
    () => undefined
  )
  await mkdir(dirname(job.to), { recursive: true })
  await cp(job.from, job.to, { recursive: true, force: true, filter: job.filter })
  dupes += await pruneNumberedDupes(job.to)
  await writeFile(stamp, '')
  await utimes(stamp, new Date(), new Date()).catch(() => undefined)
  console.log(`[copy-assets] ${job.from} → ${job.to}`)
}

if (dupes) console.log(`[copy-assets] ${dupes} Dubletten-Dateien entfernt`)
