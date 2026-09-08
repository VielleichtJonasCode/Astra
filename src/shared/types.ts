/**
 * Gemeinsame Typen für Main-, Preload- und Renderer-Prozess.
 * Nur reine Typdeklarationen – dieser Modul darf zur Laufzeit nichts tun.
 */

export interface LoadedFile {
  /** Absoluter Pfad auf der Festplatte (leer bei Drag&Drop-Buffern ohne Pfad). */
  path: string
  /** Dateiname inkl. Endung, z. B. "rechnung.pdf". */
  name: string
  /** Rohdaten der Datei. */
  bytes: Uint8Array
}

export interface SaveDialogOptions {
  defaultName?: string
  filters?: { name: string; extensions: string[] }[]
}

/* ── Studienplaner ─────────────────────────────────────────────────────── */

export interface SpFile {
  name: string
  /** Absoluter Pfad. */
  path: string
  /** Endung ohne Punkt, klein, z. B. "pdf". */
  ext: string
  size: number
  /** Änderungszeit (ms seit Epoch). */
  modified: number
}

export interface SpCourse {
  name: string
  path: string
  files: SpFile[]
}

export interface SpSemester {
  name: string
  path: string
  courses: SpCourse[]
  /** Dateien direkt im Semester-Ordner (noch keinem Kurs zugeordnet). */
  looseFiles: SpFile[]
}

export interface SpTree {
  root: string
  semesters: SpSemester[]
  /** Dateien im Eingang (<root>/_Eingang) – warten auf Einsortierung. */
  inbox: SpFile[]
  /** Dateien direkt im Wurzelordner. */
  looseFiles: SpFile[]
}

/** Ein erkannter Textblock (Zeile) mit auf 0…1 normalisierter Box, Ursprung oben-links. */
export interface OcrBox {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface OcrPage {
  text: string
  boxes: OcrBox[]
  /** Bildmaße in Pixeln (zur Umrechnung in PDF-Punkte). */
  width: number
  height: number
}

export interface OcrResult {
  pages: OcrPage[]
  /** Gesamttext aller Seiten, mit "\n\n" verbunden. */
  text: string
  engine: 'vision' | 'tesseract'
}

/* ── Kalender (EventKit-Helfer) ────────────────────────────────────────── */

/** 'unavailable' = Helfer fehlt / kein macOS. */
export type CalAuthStatus = 'unavailable' | 'notDetermined' | 'denied' | 'restricted' | 'authorized'

export interface CalCalendar {
  id: string
  title: string
  /** "#RRGGBB" */
  color: string
}

export interface CalEvent {
  id: string
  title: string
  /** ISO-8601. */
  start: string
  end: string
  allDay: boolean
  location?: string
  notes?: string
  calendarId: string
  calendarTitle: string
  color: string
  url?: string
}

/** Aktionen, die die native Menüleiste an den Renderer sendet. */
export type MenuAction =
  // Ablage
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.export'
  | 'file.close'
  // Bearbeiten
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.find'
  | 'edit.delete'
  | 'edit.selectAllPages'
  // Darstellung
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.zoomReset'
  | 'view.fitWidth'
  | 'view.fitPage'
  | 'view.single'
  | 'view.continuous'
  | 'view.spread'
  | 'view.night'
  | 'view.home'
  | 'view.rotateView'
  | 'view.presentation'
  // Werkzeuge (Direkt-Tools)
  | 'tool.hand'
  | 'tool.select'
  | 'tool.text'
  | 'tool.editText'
  | 'tool.redact'
  | 'tool.highlight'
  | 'tool.underline'
  | 'tool.strike'
  | 'tool.draw'
  | 'tool.shapes'
  | 'tool.image'
  | 'tool.note'
  | 'tool.stamp'
  | 'tool.signature'
  // Werkzeuge (Dialoge)
  | 'tools.merge'
  | 'tools.split'
  | 'tools.resize'
  | 'tools.watermark'
  | 'tools.pageNumbers'
  | 'tools.headerFooter'
  | 'tools.metadata'
  | 'tools.compress'
  | 'tools.password'
  | 'tools.ocr'
  | 'tools.batch'
  | 'tools.redactAssistant'
  // Seiten
  | 'page.rotateCW'
  | 'page.rotateCCW'
  | 'page.delete'
  | 'page.duplicate'
  | 'page.insertBlank'
  | 'page.insertImage'
  | 'page.insertPdf'
  | 'page.extract'
  | 'page.crop'
  // App / Hilfe
  | 'app.preferences'
  | 'help.docs'
  | 'help.shortcuts'
  | 'help.about'

/* ── Menüleiste („Was heute ansteht") ─────────────────────────────────── */
export interface TrayTask {
  semester: string
  kurs: string
  id: string
  title: string
  time?: string
  done: boolean
}
export interface TrayEvent {
  time: string
  title: string
}
export interface TrayPayload {
  /** z. B. „Dienstag, 9. September". */
  dateLabel: string
  /** Ist ein Studien-Ordner eingerichtet? */
  configured: boolean
  tasks: TrayTask[]
  events: TrayEvent[]
}

export interface PdfStudioApi {
  /** Öffnet den nativen Öffnen-Dialog; gibt geladene Dateien oder null (abgebrochen) zurück. */
  openDialog(): Promise<LoadedFile[] | null>
  /** Öffnen-Dialog ohne Typfilter; gibt nur Pfade + Namen zurück (keine Bytes). */
  openAnyFiles(): Promise<{ path: string; name: string }[] | null>
  /** Rendert HTML zu PDF-Bytes (Chromium-Druck im Hauptprozess). */
  htmlToPdf(
    html: string,
    options?: { landscape?: boolean; margin?: number; pageSize?: string }
  ): Promise<Uint8Array>
  /** Liest eine Datei per absolutem Pfad. */
  readFile(path: string): Promise<LoadedFile>
  /** Öffnet den nativen Sichern-Dialog; gibt den Zielpfad oder null zurück. */
  saveDialog(options: SaveDialogOptions): Promise<string | null>
  /** Öffnet den nativen "Ordner wählen"-Dialog (für Stapelverarbeitung / Export). */
  pickDirectory(): Promise<string | null>
  /** Listet die PDF-Dateien in einem Ordner (nicht rekursiv). */
  listPdfsInDirectory(dir: string): Promise<string[]>
  /** Schreibt Bytes an einen absoluten Pfad. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  /** Zeigt eine Datei im Finder. */
  showItemInFolder(path: string): void
  /** Zuletzt geöffnete Pfade (neueste zuerst). */
  recentFiles(): Promise<string[]>
  /** macOS: setzt die im Titel angezeigte Datei (Proxy-Icon). */
  setRepresentedFilename(path: string | null): void
  /** macOS: setzt den "bearbeitet"-Punkt im Schließen-Button. */
  setDocumentEdited(edited: boolean): void
  /** Fragt den Nutzer vor dem Verwerfen ungesicherter Änderungen. */
  confirmDiscard(name: string): Promise<'save' | 'discard' | 'cancel'>
  /** Lädt OCR-Sprachdaten (falls nötig) und gibt die Basis-URL zurück. */
  prepareOcr(langs: string[]): Promise<string>
  /** Setzt das native Erscheinungsbild (Vibrancy, Ampel-Buttons). */
  setNativeTheme(source: 'system' | 'light' | 'dark'): void
  /** Konvertiert ein Bild via macOS `sips` (HEIC/TIFF/…) und gibt die Bytes zurück. */
  sipsConvert(
    input: { path?: string; bytes?: Uint8Array },
    format: 'png' | 'jpeg'
  ): Promise<Uint8Array>
  /** Lokaler Geheimnis-Speicher (Datei in userData) – für den Signaturschlüssel dieses Macs. */
  getSecret(key: string): Promise<string | null>
  setSecret(key: string, value: string): Promise<void>
  /** Plattform, z. B. "darwin". */
  platform: NodeJS.Platform
  /** Registriert einen Listener für Menü-Aktionen; gibt eine Abmelde-Funktion zurück. */
  onMenu(callback: (action: MenuAction, payload?: unknown) => void): () => void
  /** Wird ausgelöst, wenn Dateien über das Dock / "Öffnen mit" hereinkommen. */
  onOpenFiles(callback: (paths: string[]) => void): () => void
  /** Beim Start ausstehende "Öffnen mit"-Pfade abholen (und leeren). */
  consumePendingFiles(): Promise<string[]>

  /* ── Studienplaner ──────────────────────────────────────────────────── */
  /** Liest den Ordnerbaum (Semester → Kurs → Datei) unter `root`. */
  spTree(root: string): Promise<SpTree>
  /** Listet die Einträge eines Ordners (nicht rekursiv). */
  spListDir(path: string): Promise<{ name: string; isDir: boolean }[]>
  /** Liest eine Datei als Bytes, ohne die "Zuletzt geöffnet"-Liste zu berühren. */
  spRead(path: string): Promise<Uint8Array>
  /** Prüft, ob eine Datei/ein Ordner existiert – ohne einen Lesefehler zu werfen. */
  spExists(path: string): Promise<boolean>
  /**
   * Legt einen Beispiel-Studienordner an (Demo-Modus) und gibt seinen Pfad plus
   * Fake-Kalendertermine zurück. `reset` baut ihn komplett neu.
   */
  spSeedDemo(opts?: { reset?: boolean }): Promise<{ dir: string; calendarEvents: CalEvent[] }>
  /** Schreibt Bytes; fehlende Ordner werden angelegt. */
  spWrite(path: string, bytes: Uint8Array): Promise<void>
  /** Legt einen Ordner (rekursiv) an. */
  spMkdirp(path: string): Promise<void>
  /** Verschiebt/benennt eine Datei um; Zielordner wird bei Bedarf angelegt. */
  spMove(from: string, to: string): Promise<void>
  /** Legt eine Datei in den Papierkorb. */
  spTrash(path: string): Promise<void>
  /** Zeigt eine Datei/Ordner im Finder. */
  spReveal(path: string): void
  /** Startet die Ordnerüberwachung; Änderungen lösen `onStudienplanerChange` aus. */
  spWatch(root: string): Promise<void>
  /** Beendet die Ordnerüberwachung. */
  spUnwatch(): Promise<void>
  /** Benachrichtigt, wenn sich im überwachten Ordner etwas geändert hat. */
  onStudienplanerChange(callback: () => void): () => void

  /* ── Handschrift-/Text-OCR (Apple Vision, Fallback tesseract.js) ─────── */
  /** Erkennt Text in einem Bild oder PDF über den Apple-Vision-Helfer.
   *  Gibt `null` zurück, wenn der Helfer fehlt (Aufrufer nutzt dann tesseract.js). */
  ocrRecognize(input: {
    path?: string
    bytes?: Uint8Array
    ext?: string
  }): Promise<OcrResult | null>

  /* ── Kalender ───────────────────────────────────────────────────────── */
  /** Aktueller Berechtigungsstatus für den Kalenderzugriff. */
  calStatus(): Promise<CalAuthStatus>
  /** Löst den macOS-Berechtigungsdialog aus und gibt den neuen Status zurück. */
  calRequestAccess(): Promise<CalAuthStatus>
  /** Alle Ereignis-Kalender (nur wenn freigegeben). */
  calList(): Promise<CalCalendar[]>
  /** Termine im Zeitfenster (Serientermine aufgelöst). */
  calEvents(fromIso: string, toIso: string, calendarIds?: string[]): Promise<CalEvent[]>
  /** Legt einen neuen Ereignis-Kalender in iCloud an; null bei Fehler. */
  calCreateCalendar(title: string): Promise<CalCalendar | null>
  /** Trägt Termine in den Kalender `calendarId` ein; gibt die Anzahl zurück. */
  calAddEvents(
    calendarId: string,
    events: { title: string; start: string; end: string; notes?: string }[]
  ): Promise<{ count: number } | { error: string }>

  /* ── KI (Gemini) ───────────────────────────────────────────────────── */
  /** Ist ein Gemini-Schlüssel hinterlegt? */
  llmHasKey(): Promise<boolean>
  /** Ruft Gemini auf; Ergebnis ist Text oder ein Fehlertext. */
  llmGenerate(req: {
    system?: string
    prompt: string
    wantJson?: boolean
    temperature?: number
    model?: string
  }): Promise<{ text: string } | { error: string }>

  /* ── Menüleiste ────────────────────────────────────────────────────── */
  /** Aktualisiert das „Heute"-Menü in der Menüleiste. */
  trayUpdate(payload: TrayPayload): void
  /** Menüleiste: Nutzer hat eine Aufgabe ab-/angehakt. */
  onTrayToggleTask(cb: (t: { semester: string; kurs: string; id: string }) => void): () => void
  /** Menüleiste/Menü: zu einem Werkzeug wechseln (und Fenster zeigen). */
  onShellSetView(cb: (view: string) => void): () => void
}

declare global {
  interface Window {
    api: PdfStudioApi
  }
}
