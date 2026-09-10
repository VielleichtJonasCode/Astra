import { useSettingsStore } from '../store/settingsStore'
import { useStudienplanerStore } from '../store/studienplanerStore'
import { useCalendarStore } from '../store/calendarStore'
import { buildWidgetSnapshot, type WidgetInputs } from '../studienplaner/widget'

/**
 * Versorgt die macOS-Widgets mit Daten: baut aus den Studienplaner-Daten einen
 * `WidgetSnapshot` und schickt ihn an den Hauptprozess, der ihn als JSON in den
 * App-Group-Container legt. Wie `traySync` ~2 s nach Start gestartet, danach bei
 * jeder Datenänderung (entprellt) und alle 10 min.
 */

let started = false
let lastJson = ''
let deb: ReturnType<typeof setTimeout> | undefined

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/

async function compute(): Promise<ReturnType<typeof buildWidgetSnapshot>> {
  const settings = useSettingsStore.getState()
  const configured = settings.widgetsEnabled && Boolean(settings.studienplanerPath)
  const sp = useStudienplanerStore.getState()
  const now = new Date()
  const todayKey = now.toISOString().slice(0, 10)

  const base: WidgetInputs = {
    configured,
    studienordner: useSettingsStore.getState().studienplanerPath || null,
    now,
    results: [],
    exams: [],
    tactics: null,
    metas: [],
    todayTasks: [],
    todayEvents: [],
    overdueCount: 0
  }

  if (configured) {
    const [metas, allTasks] = await Promise.all([sp.allLernplaene(), sp.allPlanTasks()])
    base.results = sp.getResults()
    base.exams = Object.values(sp.index.exams ?? {})
    base.tactics = sp.index.tactics
      ? { text: sp.index.tactics.text, at: sp.index.tactics.at }
      : null
    base.metas = metas.map((m) => ({
      semester: m.semester,
      kurs: m.kurs,
      taskTotal: m.taskTotal,
      taskDone: m.taskDone,
      correctRate: m.correctRate,
      gradedCount: m.gradedCount
    }))
    base.todayTasks = allTasks
      .filter((x) => x.task.date === todayKey)
      .map((x) => ({
        semester: x.semester,
        kurs: x.kurs,
        id: x.task.id,
        title: x.task.title,
        time: x.task.time,
        minutes: x.task.minutes,
        kind: x.task.kind,
        done: Boolean(x.task.done)
      }))
    base.overdueCount = allTasks.filter(
      (x) => !x.task.done && VALID_DATE.test(x.task.date) && x.task.date < todayKey
    ).length
  }

  base.todayEvents = useCalendarStore
    .getState()
    .events.filter((e) => !e.allDay && e.start.slice(0, 10) === todayKey)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({
      time: new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      title: e.title
    }))

  return buildWidgetSnapshot(base)
}

async function push(): Promise<void> {
  try {
    const snapshot = await compute()
    const json = JSON.stringify(snapshot)
    if (json === lastJson) return
    lastJson = json
    window.api.widgetPush(snapshot)
  } catch {
    /* Widgets sind Beiwerk – Fehler schlucken */
  }
}

export function startWidgetSync(): void {
  if (started || !window.api?.widgetPush) return
  started = true

  const sp = useStudienplanerStore.getState()
  if (useSettingsStore.getState().studienplanerPath && !sp.tree) void sp.open()

  const schedule = (): void => {
    clearTimeout(deb)
    deb = setTimeout(() => void push(), 900)
  }

  void push()
  useStudienplanerStore.subscribe(schedule)
  useCalendarStore.subscribe(schedule)
  setInterval(() => void push(), 10 * 60 * 1000)
}
