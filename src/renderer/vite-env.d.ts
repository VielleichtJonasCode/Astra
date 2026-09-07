/// <reference types="vite/client" />

import type { PdfStudioApi } from '../shared/types'

declare global {
  interface Window {
    api: PdfStudioApi
  }
}

declare module '*.css' {
  const content: string
  export default content
}
