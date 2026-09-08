import type { TrayPayload } from '@shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useShellStore, type AstraView } from '../store/shellStore'
import { useStudienplanerStore } from '../store/studienplanerStore'
import { useCalendarStore } from '../store/calendarStore'

/**
 * Hält das Menüleisten-„Heute"-Menü aktuell: heutige Lernplan-Aufgaben +
 * heutige Termine. Wird ~2 s nach App-Start einmal gestartet (siehe App.tsx),
 * damit der Startvorgang schlank bleibt. Läuft danach für die App-Laufzeit.
 */

let started = false

function todayLabel(): string {
  return new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function startTraySync(): void {
  if (started || !window.api?.trayUpdate) return
  started = true

  const sp = useStudienplanerStore.getState()
  // Studienplaner-Ordner laden, auch wenn das Werkzeug nie geöffnet wurde.
  if (useSettingsStore.getState().studienplanerPath && !sp.tree) void sp.open()

  let lastJson = ''
  let deb: ReturnType<typeof setTimeout> | undefined

  const compute = async (): Promise<TrayPayload> => {
    const configured = Boolean(useSettingsStore.getState().studienplanerPath)
    const tasks = configured ? await useStudienplanerStore.getState().todayTasks() : []
    const todayIso = new Date().toISOString().slice(0, 10)
    const events = useCalendarStore
      .getState()
      .events.filter((e) => !e.allDay && e.start.slice(0, 10) === todayIso)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({
        time: new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        title: e.title
      }))
    return { dateLabel: todayLabel(), configured, tasks, events }
  }

  const push = async (): Promise<void> => {
    try {
      const payload = await compute()
      const json = JSON.stringify(payload)
      if (json === lastJson) return
      lastJson = json
      window.api.trayUpdate(payload)
    } catch {
      /* Menüleiste ist Beiwerk – Fehler schlucken */
    }
  }
  const schedule = (): void => {
    clearTimeout(deb)
    deb = setTimeout(() => void push(), 700)
  }

  void push()
  useStudienplanerStore.subscribe(schedule)
  useCalendarStore.subscribe(schedule)
  // Tageswechsel / Kalender: alle 5 Minuten nachziehen.
  setInterval(() => void push(), 5 * 60 * 1000)

  window.api.onTrayToggleTask(async ({ semester, kurs, id }) => {
    const s = useStudienplanerStore.getState()
    const plan = await s.loadLernplan(semester, kurs)
    const now = new Date().toISOString()
    const planTasks = (plan.planTasks ?? []).map((t) =>
      t.id === id ? { ...t, done: !t.done, doneAt: now } : t
    )
    await s.saveLernplan(semester, kurs, { ...plan, planTasks })
    void push()
  })

  window.api.onShellSetView((v) => {
    useShellStore.getState().setView(v as AstraView)
  })
}
