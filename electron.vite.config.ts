import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react()],
    worker: {
      format: 'es'
    },
    optimizeDeps: {
      // mupdf ships seinen eigenen wasm-Loader; @ffmpeg lädt einen relativen
      // Worker – beide müssen unverändert ausgeliefert werden.
      exclude: ['mupdf', '@ffmpeg/ffmpeg', '@ffmpeg/util']
    },
    build: {
      target: 'chrome128',
      // out/renderer liegt außerhalb von root – Vite leert es sonst NICHT und
      // alte gehashte Chunks + kopierte Assets sammeln sich über Builds an
      // (aufgeblähtes app.asar → langsamer Start).
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
