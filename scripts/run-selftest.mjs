/**
 * Führt den Studienplaner-Selbsttest (src/renderer/studienplaner/selftest.ts)
 * headless in Node aus – als `npm test`.
 *
 * esbuild (kommt mit vite/electron-vite) bündelt den TS-Test in ein temporäres
 * ESM-Modul; dessen `runStudienplanerSelfTest()` liefert das Ergebnis, der
 * Exit-Code richtet sich danach.
 */
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = await mkdtemp(join(tmpdir(), 'astra-sptest-'))
const outfile = join(dir, 'selftest.mjs')

try {
  await build({
    entryPoints: [join(root, 'src/renderer/studienplaner/selftest.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    alias: { '@shared/types': join(root, 'src/shared/types.ts') },
    logLevel: 'error'
  })

  const mod = await import(pathToFileURL(outfile).href)
  const res = mod.runStudienplanerSelfTest()

  if (!res || !res.ok) {
    console.error(`\n✖ SPTEST FAIL (${res ? res.failed.length : '?'}): ${res ? res.failed.join(', ') : 'kein Ergebnis'}`)
    process.exitCode = 1
  } else {
    console.log(`\n✔ SPTEST OK – ${res.total} Prüfungen`)
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}
