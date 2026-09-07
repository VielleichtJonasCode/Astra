import { contextBridge, ipcRenderer } from 'electron'
import type { MenuAction, PdfStudioApi } from '../shared/types'

const api: PdfStudioApi = {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveDialog: (options) => ipcRenderer.invoke('dialog:save', options),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  listPdfsInDirectory: (dir) => ipcRenderer.invoke('fs:listPdfs', dir),
  writeFile: (path, bytes) => ipcRenderer.invoke('file:write', path, bytes),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItem', path),
  recentFiles: () => ipcRenderer.invoke('app:recent'),
  confirmDiscard: (name) => ipcRenderer.invoke('dialog:confirmDiscard', name),
  prepareOcr: (langs) => ipcRenderer.invoke('ocr:prepare', langs),
  setRepresentedFilename: (path) => ipcRenderer.send('win:setRepresentedFilename', path),
  setDocumentEdited: (edited) => ipcRenderer.send('win:setDocumentEdited', edited),
  platform: process.platform,
  onMenu: (callback) => {
    const listener = (_e: unknown, action: MenuAction, payload?: unknown): void =>
      callback(action, payload)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  },
  onOpenFiles: (callback) => {
    const listener = (_e: unknown, paths: string[]): void => callback(paths)
    ipcRenderer.on('open-files', listener)
    return () => ipcRenderer.removeListener('open-files', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
