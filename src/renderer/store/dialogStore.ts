import { create } from 'zustand'

export type DialogId =
  | 'merge'
  | 'split'
  | 'resize'
  | 'watermark'
  | 'pageNumbers'
  | 'headerFooter'
  | 'metadata'
  | 'compress'
  | 'password'
  | 'ocr'
  | 'batch'
  | 'redactAssistant'
  | 'export'
  | 'shortcuts'
  | 'about'
  | 'preferences'
  | 'insertImage'
  | 'insertPdf'
  | 'extract'
  | 'signature'

interface DialogState {
  active: DialogId | null
  payload?: unknown
  open: (id: DialogId, payload?: unknown) => void
  close: () => void
}

export const useDialogStore = create<DialogState>((set) => ({
  active: null,
  payload: undefined,
  open: (active, payload) => set({ active, payload }),
  close: () => set({ active: null, payload: undefined })
}))

export function requestDialog(id: DialogId, payload?: unknown): void {
  useDialogStore.getState().open(id, payload)
}
