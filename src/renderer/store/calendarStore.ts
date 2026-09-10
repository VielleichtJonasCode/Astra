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
  /** Holt Termine für einen (evtl. weiteren) Zeitraum und mischt sie zu `events` – für die Kalender-Seite. */
  ensureRange: (fromIso: string, toIso: string) => Promise<void>
  /** Trägt Termine in den Studium-Kalender ein; gibt Anzahl + neue Event-IDs
   *  (Reihenfolge wie `events`, "" wenn ein Eintrag scheiterte) zurück. */
  addEvents: (
    events: { title: string; start: string; end: string; notes?: string }[]
  ) => Promise<{ count: number; ids: string[] }>
  /** Aktualisiert vorhandene Studium-Termine (per Event-ID); gibt die Anzahl zurück. */
  updateEvents: (
    events: { id: string; title: string; start: string; end: string; notes?: string }[]
  ) => Promise<number>
  /** Löscht Studium-Termine (per Event-ID); gibt die Anzahl zurück. */
  deleteEvents: (eventIds: string[]) => Promise<number>
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

  ensureRange: async (fromIso, toIso) => {
    if (get().demo || get().status !== 'authorized') return
    const id = useSettingsStore.getState().studienplanerCalendarId
    const fresh = await window.api
      .calEvents(fromIso, toIso, id ? [id] : undefined)
      .catch(() => [] as CalEvent[])
    if (!fresh.length) return
    set((s) => {
      const seen = new Set(s.events.map((e) => e.id))
      const merged = [...s.events, ...fresh.filter((e) => !seen.has(e.id))]
      return { events: merged, lastSync: Date.now() }
    })
  },

  addEvents: async (events) => {
    if (get().demo) {
      // Demo: nur in den Speicher legen, kein echter Kalender.
      const ids = events.map((_, i) => `demo-added-${Date.now()}-${i}`)
      const added: CalEvent[] = events.map((e, i) => ({
        id: ids[i],
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
      return { count: added.length, ids }
    }
    if (get().status !== 'authorized') {
      toast.error('Kein Kalenderzugriff.')
      return { count: 0, ids: [] }
    }
    const id = useSettingsStore.getState().studienplanerCalendarId
    if (!id) {
      toast.error('Erst einen Studium-Kalender wählen (in der Termine-Leiste).')
      return { count: 0, ids: [] }
    }
    const res = await window.api
      .calAddEvents(id, events)
      .catch(() => ({ error: 'Fehler' }) as { error: string })
    if ('error' in res) {
      toast.error(res.error)
      return { count: 0, ids: [] }
    }
    await get().refresh()
    return { count: res.count, ids: res.ids }
  },

  updateEvents: async (events) => {
    if (!events.length) return 0
    if (get().demo) {
      const byId = new Map(events.map((e) => [e.id, e]))
      set((s) => ({
        events: s.events.map((ev) => {
          const u = byId.get(ev.id)
          return u ? { ...ev, title: u.title, start: u.start, end: u.end, notes: u.notes } : ev
        }),
        lastSync: Date.now()
      }))
      return events.length
    }
    if (get().status !== 'authorized') return 0
    const id = useSettingsStore.getState().studienplanerCalendarId
    if (!id) return 0
    const res = await window.api
      .calUpdateEvents(id, events)
      .catch(() => ({ error: 'Fehler' }) as { error: string })
    if ('error' in res) {
      toast.error(res.error)
      return 0
    }
    await get().refresh()
    return res.count
  },

  deleteEvents: async (eventIds) => {
    const ids = eventIds.filter(Boolean)
    if (!ids.length) return 0
    if (get().demo) {
      const drop = new Set(ids)
      set((s) => ({ events: s.events.filter((ev) => !drop.has(ev.id)), lastSync: Date.now() }))
      return ids.length
    }
    if (get().status !== 'authorized') return 0
    const id = useSettingsStore.getState().studienplanerCalendarId
    if (!id) return 0
    const res = await window.api
      .calDeleteEvents(id, ids)
      .catch(() => ({ error: 'Fehler' }) as { error: string })
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
