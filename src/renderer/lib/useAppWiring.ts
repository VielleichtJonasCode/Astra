import { useEffect } from 'react'
import type { MenuAction } from '@shared/types'
import { useDocStore } from '../store/docStore'
import { useUiStore, type ToolId } from '../store/uiStore'
import { openPaths, openViaDialog } from './fileActions'
import { toast } from '../components/common/toast'
import { requestDialog, type DialogId } from '../store/dialogStore'
import { saveActive, saveActiveAs, exportActive } from './saveActions'

const TOOL_ACTIONS: Partial<Record<MenuAction, ToolId>> = {
  'tool.hand': 'hand',
  'tool.select': 'select',
  'tool.text': 'text',
  'tool.editText': 'editText',
  'tool.redact': 'redact',
  'tool.highlight': 'highlight',
  'tool.underline': 'underline',
  'tool.strike': 'strikeout',
  'tool.draw': 'ink',
  'tool.shapes': 'shape-rect',
  'tool.image': 'image',
  'tool.note': 'note',
  'tool.stamp': 'stamp',
  'tool.signature': 'signature'
}

const DIALOG_ACTIONS: Partial<Record<MenuAction, DialogId>> = {
  'tools.merge': 'merge',
  'tools.split': 'split',
  'tools.resize': 'resize',
  'tools.watermark': 'watermark',
  'tools.pageNumbers': 'pageNumbers',
  'tools.headerFooter': 'headerFooter',
  'tools.metadata': 'metadata',
  'tools.compress': 'compress',
  'tools.password': 'password',
  'tools.ocr': 'ocr',
  'tools.batch': 'batch',
  'tools.redactAssistant': 'redactAssistant',
  'file.export': 'export',
  'help.shortcuts': 'shortcuts',
  'help.about': 'about',
  'app.preferences': 'preferences'
}

function handleMenuAction(action: MenuAction): void {
  const ui = useUiStore.getState()
  const docs = useDocStore.getState()
  const key = docs.activeKey

  if (TOOL_ACTIONS[action]) {
    ui.setTool(TOOL_ACTIONS[action] as ToolId)
    return
  }
  if (DIALOG_ACTIONS[action]) {
    if (!key && action !== 'tools.merge' && action !== 'tools.batch' && !action.startsWith('help') && action !== 'app.preferences') {
      toast.info('Bitte zuerst ein PDF öffnen.')
      return
    }
    requestDialog(DIALOG_ACTIONS[action] as DialogId)
    return
  }

  switch (action) {
    case 'file.open':
      void openViaDialog()
      break
    case 'file.save':
      void saveActive()
      break
    case 'file.saveAs':
      void saveActiveAs()
      break
    case 'file.export':
      void exportActive()
      break
    case 'file.close':
      if (key) void docs.closeDoc(key)
      break

    case 'edit.undo':
      docs.undo()
      break
    case 'edit.redo':
      docs.redo()
      break
    case 'edit.find':
      ui.setSearch({ open: true })
      break
    case 'edit.delete':
      if (key && ui.selectedAnnotations.length) {
        docs.removeAnnotations(key, ui.selectedAnnotations)
        ui.clearSelection()
      }
      break

    case 'view.zoomIn':
      ui.zoomIn()
      break
    case 'view.zoomOut':
      ui.zoomOut()
      break
    case 'view.zoomReset':
      ui.resetZoom()
      break
    case 'view.fitWidth':
      ui.setZoom(1, 'fit-width')
      break
    case 'view.fitPage':
      ui.setZoom(1, 'fit-page')
      break
    case 'view.single':
      ui.setViewMode('single')
      break
    case 'view.continuous':
      ui.setViewMode('continuous')
      break
    case 'view.spread':
      ui.setViewMode('spread')
      break
    case 'view.night':
      ui.toggleNight()
      break
    case 'view.presentation':
      ui.setPresentation(!ui.presentation)
      break
    case 'view.rotateView':
      toast.info('Ansicht drehen: folgt in Phase 3.')
      break

    case 'page.rotateCW':
      if (key) rotateTarget(key, 90)
      break
    case 'page.rotateCCW':
      if (key) rotateTarget(key, -90)
      break
    case 'page.delete':
      if (key) docs.deletePages(key, targetPages())
      break
    case 'page.duplicate':
      if (key) docs.duplicatePages(key, targetPages())
      break
    case 'page.insertBlank':
      if (key) docs.insertBlankPage(key, targetPages()[0] + 1)
      break
    case 'page.insertImage':
    case 'page.insertPdf':
    case 'page.extract':
    case 'page.crop':
      toast.info('Diese Aktion folgt in einer späteren Phase.')
      break

    case 'help.docs':
      toast.info('Handbuch: siehe README im Projektordner.')
      break

    default:
      break
  }
}

function targetPages(): number[] {
  const ui = useUiStore.getState()
  return ui.selectedPages.length ? ui.selectedPages : [ui.currentPage - 1]
}

function rotateTarget(key: string, delta: 90 | -90): void {
  useDocStore.getState().rotatePages(key, targetPages(), delta)
}

/** Buchstaben-Kurzbefehle, die die native Menüleiste nicht abdeckt. */
function handleKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  ) {
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return

  const ui = useUiStore.getState()
  const map: Record<string, ToolId> = {
    v: 'select',
    t: 'text',
    e: 'editText',
    b: 'redact',
    h: 'highlight',
    d: 'ink',
    s: 'shape-rect',
    i: 'image',
    n: 'note'
  }
  const key = e.key.toLowerCase()
  if (map[key]) {
    e.preventDefault()
    ui.setTool(map[key])
  } else if (e.key === 'Escape') {
    ui.setTool('select')
    ui.clearSelection()
  }
}

export function useAppWiring(): void {
  useEffect(() => {
    const offMenu = window.api.onMenu((action) => handleMenuAction(action))
    const offOpen = window.api.onOpenFiles((paths) => void openPaths(paths))
    window.addEventListener('keydown', handleKey)
    return () => {
      offMenu()
      offOpen()
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  // Dirty-Zustand ans Fenster spiegeln (Proxy-Icon / Schließen-Punkt).
  useEffect(() => {
    return useDocStore.subscribe((s) => {
      const doc = s.activeKey ? s.docs[s.activeKey] : null
      window.api.setDocumentEdited(Boolean(doc?.dirty))
      window.api.setRepresentedFilename(doc?.path ?? null)
    })
  }, [])
}
