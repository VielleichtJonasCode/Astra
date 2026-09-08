import { create } from 'zustand'
import type { CalAuthStatus, CalCalendar, CalEvent } from '@shared/types'
import { toast } from '../components/common/toast'
import { useSettingsStore } from './settingsStore'

/** Zeitfenster, das Astra aus dem Kalender holt (Tage ab heute). */
const WINDOW_DAYS = 120
/** Vorschlagsname für den Studium-Kalender. */
export const STUDIUM_TITLE = 'Studium'
const NAME_HINTS = /studium|studies|uni\b|hochschule|semester/i

export const DEMO_CAL_ID = 'astra-demo-cal'

interface CalState {
  status: CalAuthStatus | null
  calendars: CalCalendar[]
  events: CalEvent[]
  loading: boolean
  creating: boolean
  lastSync: number | null
  /** Demo-Modus: Termine kommen aus dem Beispiel-Datensatz, nicht aus EventKit. */
  demo: boolean

  init: () => Promise<void>
  requestAccess: () => Promise<void>
  loadCalendars: () => Promise<void>
  setCalendar: (id: string | null) => Promise<void>
  createStudiumCalendar: () => Promise<void>
  refresh: () => Promise<void>
  /** Trägt Termine in den Studium-Kalender ein; gibt die Anzahl zurück. */
  addEvents: (
    events: { title: string; start: string; end: string; notes?: string }[]
  ) => Promise<number>
  /** Demo-Modus mit vorgegebenen Terminen betreten. */
  enterDemo: (events: CalEvent[]) => void
  /** Demo-Modus verlassen und echten Kalender wieder laden. */
  exitDemo: () => void
}

function windowIso(): [string, string] {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 1)
  const to = new Date(now)
  to.setDate(to.getDate() + WINDOW_DAYS)
  return [from.toISOString(), to.toISOString()]
}

export const useCalendarStore = create<CalState>((set, get) => ({
  status: null,
  calendars: [],
  events: [],
  loading: false,
  creating: false,
  lastSync: null,
  demo: false,

  init: async () => {
    if (get().demo) return
    const status = await window.api.calStatus().catch(() => 'unavailable' as CalAuthStatus)
    if (get().demo) return // Demo wurde währenddessen aktiviert
    set({ status })
    if (status !== 'authorized') return
    await get().loadCalendars()
    // Beim ersten Mal automatisch einen „Studium“-Kalender erkennen.
    if (!useSettingsStore.getState().studienplanerCalendarId) {
      const guess =
        get().calendars.find((c) => c.title.trim().toLowerCase() === STUDIUM_TITLE.toLowerCase()) ??
        get().calendars.find((c) => NAME_HINTS.test(c.title))
      if (guess) useSettingsStore.getState().setStudienplanerCalendarId(guess.id)
    }
    await get().refresh()
  },

  requestAccess: async () => {
    set({ loading: true })
    const status = await window.api.calRequestAccess().catch(() => 'denied' as CalAuthStatus)
    set({ status, loading: false })
    if (status === 'authorized') await get().init()
  },

  loadCalendars: async () => {
    const calendars = await window.api.calList().catch(() => [])
    set({ calendars })
  },

  setCalendar: async (id) => {
    useSettingsStore.getState().setStudienplanerCalendarId(id)
    await get().refresh()
  },

  createStudiumCalendar: async () => {
    set({ creating: true })
    try {
      const cal = await window.api.calCreateCalendar(STUDIUM_TITLE).catch(() => null)
      if (!cal) {
        toast.error('Kalender konnte nicht angelegt werden.')
        return
      }
      await get().loadCalendars()
      useSettingsStore.getState().setStudienplanerCalendarId(cal.id)
      await get().refresh()
      toast.success(
        '„Studium“-Kalender in iCloud angelegt. Trag dort deine Vorlesungen und Klausuren ein.'
      )
    } finally {
      set({ creating: false })
    }
  },

  refresh: async () => {
    if (get().demo) return
    if (get().status !== 'authorized') return
    set({ loading: true })
    const id = useSettingsStore.getState().studienplanerCalendarId
    const [from, to] = windowIso()
    const events = await window.api
      .calEvents(from, to, id ? [id] : undefined)
      .catch(() => [] as CalEvent[])
    set({ events, loading: false, lastSync: Date.now() })
  },

  addEvents: async (events) => {
    if (get().demo) {
      // Demo: nur in den Speicher legen, kein echter Kalender.
      const added: CalEvent[] = events.map((e, i) => ({
        id: `demo-added-${Date.now()}-${i}`,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: false,
        notes: e.notes,
        calendarId: DEMO_CAL_ID,
        calendarTitle: 'Studium (Demo)',
        color: '#5b8cff'
      }))
      set((s) => ({ events: [...s.events, ...added], lastSync: Date.now() }))
      return added.length
    }
    if (get().status !== 'authorized') {
      toast.error('Kein Kalenderzugriff.')
      return 0
    }
    const id = useSettingsStore.getState().studienplanerCalendarId
    if (!id) {
      toast.error('Erst einen Studium-Kalender wählen (in der Termine-Leiste).')
      return 0
    }
    const res = await window.api.calAddEvents(id, events).catch(() => ({ error: 'Fehler' }))
    if ('error' in res) {
      toast.error(res.error)
      return 0
    }
    await get().refresh()
    return res.count
  },

  enterDemo: (events) => {
    set({
      demo: true,
      status: 'authorized',
      calendars: [{ id: DEMO_CAL_ID, title: 'Studium (Demo)', color: '#5b8cff' }],
      events,
      loading: false,
      lastSync: Date.now()
    })
  },

  exitDemo: () => {
    set({ demo: false, events: [], calendars: [], status: null, lastSync: null })
    void get().init()
  }
}))
