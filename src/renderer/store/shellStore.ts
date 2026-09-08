import { create } from 'zustand'

export type AstraView =
  | 'home'
  | 'pdf'
  | 'convert'
  | 'qr'
  | 'image'
  | 'text'
  | 'units'
  | 'table'
  | 'audio'
  | 'scan'
  | 'sign'
  | 'studienplaner'

interface ShellState {
  view: AstraView
  setView: (view: AstraView) => void
}

function initialView(): AstraView {
  const m = /view=(home|pdf|convert|qr|image|text|units|table|audio|scan|sign|studienplaner)/.exec(
    location.hash
  )
  return (m?.[1] as AstraView) ?? 'home'
}

export const useShellStore = create<ShellState>((set) => ({
  view: initialView(),
  setView: (view) => set({ view })
}))

/** Wechselt in den PDF-Editor (z. B. beim Öffnen einer Datei). */
export function enterPdfEditor(): void {
  if (useShellStore.getState().view !== 'pdf') useShellStore.setState({ view: 'pdf' })
}
