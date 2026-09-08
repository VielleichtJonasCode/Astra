import { protocol } from 'electron'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'

/**
 * Eigenes Schema `astra-asset://app/<pfad>` für gebündelte Renderer-Assets,
 * die aus einem Worker heraus geladen werden müssen (FFmpeg-Core, WASM …).
 * Im Dev-Modus werden diese Dateien direkt vom Vite-Server geliefert.
 */
const MIME: Record<string, string> = {
  js: 'text/javascript',
  mjs: 'text/javascript',
  wasm: 'application/wasm',
  json: 'application/json',
  css: 'text/css'
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'astra-asset',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
    }
  ])
}

export function registerAssets(): void {
  protocol.handle('astra-asset', async (request) => {
    const rel = normalize(decodeURIComponent(new URL(request.url).pathname)).replace(
      /^(\.\.[/\\])+/,
      ''
    )
    const file = join(__dirname, '../renderer', rel) // out/main → out/renderer
    try {
      const data = await readFile(file)
      const ext = file.split('.').pop()?.toLowerCase() ?? ''
      return new Response(new Uint8Array(data), {
        headers: {
          'content-type': MIME[ext] ?? 'application/octet-stream',
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin'
        }
      })
    } catch (err) {
      console.error('[astra-asset] 404', file, err)
      return new Response('not found', {
        status: 404,
        headers: { 'access-control-allow-origin': '*' }
      })
    }
  })
}
