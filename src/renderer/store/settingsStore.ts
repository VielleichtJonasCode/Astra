import { create } from 'zustand'

export type ThemePref = 'system' | 'light' | 'dark'
export type ZoomPref = 'fit-width' | 'fit-page'

interface SettingsState {
  theme: ThemePref
  /** null = neben dem Original ausgeben. */
  converterOutputDir: string | null
  pdfZoom: ZoomPref
  /** PDFs mit handschriftlicher Unterschrift zusätzlich mit dem Mac-Schlüssel signieren. */
  autoSign: boolean
  /** Wurzelordner des Studienplaners (idealerweise in iCloud Drive). null = noch nicht gewählt. */
  studienplanerPath: string | null
  /** ID des „Studium“-Kalenders, aus dem Termine angezeigt werden. null = noch keiner gewählt (alle). */
  studienplanerCalendarId: string | null
  /** Gemini-Modellname; leer = App-Standard (gemini-flash-latest). */
  geminiModel: string
  /** Demo-Modus aktiv – der Studienplaner zeigt Beispieldaten aus einem Sandbox-Ordner. */
  studienplanerDemo: boolean
  /** Echter Studien-Ordner, gemerkt während Demo-Modus. */
  studienplanerPathReal: string | null
  setTheme: (t: ThemePref) => void
  setConverterOutputDir: (dir: string | null) => void
  setPdfZoom: (z: ZoomPref) => void
  setAutoSign: (v: boolean) => void
  setStudienplanerPath: (dir: string | null) => void
  setStudienplanerCalendarId: (id: string | null) => void
  setGeminiModel: (m: string) => void
  /** In den Demo-Modus wechseln: aktuellen Ordner merken, auf `demoPath` zeigen. */
  enterStudienplanerDemo: (demoPath: string) => void
  /** Demo-Modus verlassen: auf den echten Ordner zurückstellen (kann null sein). */
  exitStudienplanerDemo: () => string | null
}

const KEY = 'astra.settings'
type Persisted = Pick<
  SettingsState,
  | 'theme'
  | 'converterOutputDir'
  | 'pdfZoom'
  | 'autoSign'
  | 'studienplanerPath'
  | 'studienplanerCalendarId'
  | 'geminiModel'
  | 'studienplanerDemo'
  | 'studienplanerPathReal'
>

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      theme: raw.theme ?? 'system',
      converterOutputDir: raw.converterOutputDir ?? null,
      pdfZoom: raw.pdfZoom ?? 'fit-width',
      autoSign: raw.autoSign ?? true,
      studienplanerPath: raw.studienplanerPath ?? null,
      studienplanerCalendarId:
        raw.studienplanerCalendarId ??
        (Array.isArray(raw.studienplanerCalendars)
          ? (raw.studienplanerCalendars[0] ?? null)
          : null),
      geminiModel: typeof raw.geminiModel === 'string' ? raw.geminiModel : '',
      studienplanerDemo: Boolean(raw.studienplanerDemo),
      studienplanerPathReal: raw.studienplanerPathReal ?? null
    }
  } catch {
    return {
      theme: 'system',
      converterOutputDir: null,
      pdfZoom: 'fit-width',
      autoSign: true,
      studienplanerPath: null,
      studienplanerCalendarId: null,
      geminiModel: '',
      studienplanerDemo: false,
      studienplanerPathReal: null
    }
  }
}

function persist(s: SettingsState): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        theme: s.theme,
        converterOutputDir: s.converterOutputDir,
        pdfZoom: s.pdfZoom,
        autoSign: s.autoSign,
        studienplanerPath: s.studienplanerPath,
        studienplanerCalendarId: s.studienplanerCalendarId,
        geminiModel: s.geminiModel,
        studienplanerDemo: s.studienplanerDemo,
        studienplanerPathReal: s.studienplanerPathReal
      })
    )
  } catch {
    /* ignore */
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setTheme: (theme) => {
    set({ theme })
    persist(get())
  },
  setConverterOutputDir: (converterOutputDir) => {
    set({ converterOutputDir })
    persist(get())
  },
  setPdfZoom: (pdfZoom) => {
    set({ pdfZoom })
    persist(get())
  },
  setAutoSign: (autoSign) => {
    set({ autoSign })
    persist(get())
  },
  setStudienplanerPath: (studienplanerPath) => {
    set({ studienplanerPath })
    persist(get())
  },
  setStudienplanerCalendarId: (studienplanerCalendarId) => {
    set({ studienplanerCalendarId })
    persist(get())
  },
  setGeminiModel: (geminiModel) => {
    set({ geminiModel })
    persist(get())
  },
  enterStudienplanerDemo: (demoPath) => {
    const s = get()
    if (!s.studienplanerDemo) {
      set({ studienplanerPathReal: s.studienplanerPath })
    }
    set({ studienplanerPath: demoPath, studienplanerDemo: true })
    persist(get())
  },
  exitStudienplanerDemo: () => {
    const real = get().studienplanerPathReal
    set({ studienplanerPath: real, studienplanerPathReal: null, studienplanerDemo: false })
    persist(get())
    return real
  }
}))

/** Wendet die Theme-Wahl auf <html> und (via IPC) auf das native Fenster an. */
export function applyTheme(theme: ThemePref): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  window.api.setNativeTheme?.(theme)
}
