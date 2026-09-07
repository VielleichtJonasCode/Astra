import { create } from 'zustand'

interface PendingRequest {
  reason: 'need' | 'wrong'
  docName: string
  resolve: (value: string | null) => void
}

interface PasswordState {
  request: PendingRequest | null
  ask: (reason: 'need' | 'wrong', docName: string) => Promise<string | null>
  submit: (password: string) => void
  cancel: () => void
}

export const usePasswordStore = create<PasswordState>((set, get) => ({
  request: null,
  ask: (reason, docName) =>
    new Promise<string | null>((resolve) => {
      set({ request: { reason, docName, resolve } })
    }),
  submit: (password) => {
    get().request?.resolve(password)
    set({ request: null })
  },
  cancel: () => {
    get().request?.resolve(null)
    set({ request: null })
  }
}))
