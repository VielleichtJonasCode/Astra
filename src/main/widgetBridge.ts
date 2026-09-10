import { app, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Brücke zu den macOS-Widgets: nimmt den Studienplaner-Schnappschuss vom
 * Renderer entgegen und legt ihn als JSON dort ab, wo die WidgetKit-Erweiterung
 * ihn liest – im App-Group-Container. Zusätzlich immer eine Kopie unter
 * `userData/widget/snapshot.json` (Inspektion / Fallback).
 *
 * Ohne signierte App lädt macOS keine Widget-Erweiterung; das Schreiben schadet
 * aber nicht und der Datenweg ist dann bereits fertig verdrahtet.
 * App-Group-ID via `ASTRA_APP_GROUP` überschreibbar (Standard: group.<appId>).
 */

/** Muss mit dem App-Group-Entitlement von App UND Widget-Erweiterung übereinstimmen. */
const APP_GROUP = process.env['ASTRA_APP_GROUP'] || 'group.com.jonathanweidner.astra'
const SNAPSHOT_NAME = 'snapshot.json'

function groupContainerPath(): string {
  return join(
    homedir(),
    'Library',
    'Group Containers',
    APP_GROUP,
    'Library',
    'Application Support',
    'AstraWidgets',
    SNAPSHOT_NAME
  )
}

function userDataPath(): string {
  return join(app.getPath('userData'), 'widget', SNAPSHOT_NAME)
}

/** Primärer Pfad (für die Anzeige in den Einstellungen). */
export function widgetSnapshotPath(): string {
  return process.platform === 'darwin' ? groupContainerPath() : userDataPath()
}

let lastJson = ''
let deb: ReturnType<typeof setTimeout> | undefined

async function writeSnapshot(snapshot: unknown): Promise<void> {
  const json = JSON.stringify(snapshot)
  if (json === lastJson) return
  lastJson = json

  const targets =
    process.platform === 'darwin' ? [groupContainerPath(), userDataPath()] : [userDataPath()]
  for (const target of targets) {
    try {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, json, 'utf8')
    } catch {
      /* z. B. App-Group-Container existiert (noch) nicht – kein Grund zur Sorge */
    }
  }
  // Die Widget-Zeitleiste zieht sich alle ~10 min bzw. beim Aufwachen der
  // Mitteilungszentrale selbst nach (siehe Provider.swift). Ein sofortiges
  // WidgetCenter.reloadAllTimelines() bräuchte einen signierten Swift-Helfer.
}

export function registerWidgetBridge(): void {
  ipcMain.on('widget:push', (_e, snapshot: unknown) => {
    clearTimeout(deb)
    deb = setTimeout(() => void writeSnapshot(snapshot), 500)
  })
  ipcMain.handle('widget:snapshotPath', () => widgetSnapshotPath())
}
