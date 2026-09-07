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

export interface PdfStudioApi {
  /** Öffnet den nativen Öffnen-Dialog; gibt geladene Dateien oder null (abgebrochen) zurück. */
  openDialog(): Promise<LoadedFile[] | null>
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
  /** Plattform, z. B. "darwin". */
  platform: NodeJS.Platform
  /** Registriert einen Listener für Menü-Aktionen; gibt eine Abmelde-Funktion zurück. */
  onMenu(callback: (action: MenuAction, payload?: unknown) => void): () => void
  /** Wird ausgelöst, wenn Dateien über das Dock / "Öffnen mit" hereinkommen. */
  onOpenFiles(callback: (paths: string[]) => void): () => void
}

declare global {
  interface Window {
    api: PdfStudioApi
  }
}
