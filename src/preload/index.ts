import { contextBridge, ipcRenderer } from 'electron'
import type { MenuAction, PdfStudioApi } from '../shared/types'

const api: PdfStudioApi = {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  openAnyFiles: () => ipcRenderer.invoke('dialog:openAny'),
  htmlToPdf: (html, options) => ipcRenderer.invoke('convert:htmlToPdf', html, options),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveDialog: (options) => ipcRenderer.invoke('dialog:save', options),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  listPdfsInDirectory: (dir) => ipcRenderer.invoke('fs:listPdfs', dir),
  writeFile: (path, bytes) => ipcRenderer.invoke('file:write', path, bytes),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItem', path),
  recentFiles: () => ipcRenderer.invoke('app:recent'),
  confirmDiscard: (name) => ipcRenderer.invoke('dialog:confirmDiscard', name),
  prepareOcr: (langs) => ipcRenderer.invoke('ocr:prepare', langs),
  setNativeTheme: (source) => ipcRenderer.send('app:setNativeTheme', source),
  sipsConvert: (input, format) => ipcRenderer.invoke('convert:sips', input, format),
  getSecret: (key) => ipcRenderer.invoke('secret:get', key),
  setSecret: (key, value) => ipcRenderer.invoke('secret:set', key, value),
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
  },
  consumePendingFiles: () => ipcRenderer.invoke('app:consumePendingFiles'),

  spTree: (root) => ipcRenderer.invoke('sp:tree', root),
  spListDir: (path) => ipcRenderer.invoke('sp:listdir', path),
  spRead: (path) => ipcRenderer.invoke('sp:read', path),
  spExists: (path) => ipcRenderer.invoke('sp:exists', path),
  spBackup: (root) => ipcRenderer.invoke('sp:backup', root),
  spSeedDemo: (opts) => ipcRenderer.invoke('sp:seedDemo', opts),
  spWrite: (path, bytes) => ipcRenderer.invoke('sp:write', path, bytes),
  spMkdirp: (path) => ipcRenderer.invoke('sp:mkdirp', path),
  spMove: (from, to) => ipcRenderer.invoke('sp:move', from, to),
  spTrash: (path) => ipcRenderer.invoke('sp:trash', path),
  spReveal: (path) => ipcRenderer.send('sp:reveal', path),
  spWatch: (root) => ipcRenderer.invoke('sp:watch', root),
  spUnwatch: () => ipcRenderer.invoke('sp:unwatch'),
  onStudienplanerChange: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('sp:changed', listener)
    return () => ipcRenderer.removeListener('sp:changed', listener)
  },

  ocrRecognize: (input) => ipcRenderer.invoke('ocr:recognize', input),
  ocrRectify: (input) => ipcRenderer.invoke('ocr:rectify', input),

  calStatus: () => ipcRenderer.invoke('cal:status'),
  calRequestAccess: () => ipcRenderer.invoke('cal:request'),
  calList: () => ipcRenderer.invoke('cal:list'),
  calEvents: (fromIso, toIso, calendarIds) =>
    ipcRenderer.invoke('cal:events', fromIso, toIso, calendarIds),
  calCreateCalendar: (title) => ipcRenderer.invoke('cal:create', title),
  calAddEvents: (calendarId, events) => ipcRenderer.invoke('cal:add', calendarId, events),
  calUpdateEvents: (calendarId, events) => ipcRenderer.invoke('cal:update', calendarId, events),
  calDeleteEvents: (calendarId, eventIds) => ipcRenderer.invoke('cal:delete', calendarId, eventIds),

  llmHasKey: () => ipcRenderer.invoke('llm:hasKey'),
  llmGenerate: (req) => ipcRenderer.invoke('llm:generate', req),

  trayUpdate: (payload) => ipcRenderer.send('tray:update', payload),
  onTrayToggleTask: (cb) => {
    const listener = (_e: unknown, t: { semester: string; kurs: string; id: string }): void => cb(t)
    ipcRenderer.on('tray:toggle-task', listener)
    return () => ipcRenderer.removeListener('tray:toggle-task', listener)
  },
  onShellSetView: (cb) => {
    const listener = (_e: unknown, v: string): void => cb(v)
    ipcRenderer.on('shell:set-view', listener)
    return () => ipcRenderer.removeListener('shell:set-view', listener)
  },

  widgetPush: (snapshot) => ipcRenderer.send('widget:push', snapshot),
  widgetSnapshotPath: () => ipcRenderer.invoke('widget:snapshotPath')
}

contextBridge.exposeInMainWorld('api', api)
