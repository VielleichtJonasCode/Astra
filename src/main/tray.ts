import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { TrayPayload } from '../shared/types'

/**
 * Menüleisten-Icon „Was heute ansteht": zeigt die heutigen Lernplan-Aufgaben
 * (ab-/anhakbar) und die heutigen Termine. Die Daten liefert der Renderer per
 * `tray:update`; Klicks auf Aufgaben gehen als `tray:toggle-task` zurück.
 * Nur macOS.
 */

// 16px + 32px Vorlagen-Icon (Checkliste), monochrom – von scripts/make-tray-icon.mjs erzeugt.
const ICON_16 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAJ0lEQVR42mNgoAb4D4YIFgLCFTAQUoDEodANOBUQ7QYcCoZHQOEFALGMR7k3AhuyAAAAAElFTkSuQmCC'
const ICON_32 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAMUlEQVR42mNgGAUw8B8JUsmA/wQgFgOQ6YExgGIvUBSIowlpNCGNJqTRhDSakAYDAACpgh7wocFG8wAAAABJRU5ErkJggg=='

let tray: Tray | null = null
let payload: TrayPayload = { dateLabel: '', configured: false, tasks: [], events: [] }

function trayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromDataURL('data:image/png;base64,' + ICON_16)
  img.addRepresentation({ scaleFactor: 2, dataURL: 'data:image/png;base64,' + ICON_32 })
  img.setTemplateImage(true)
  return img
}

export function registerTray(
  getWindow: () => BrowserWindow | null,
  ensureWindow: () => void
): void {
  if (process.platform !== 'darwin' || tray) return

  const reveal = (view?: string): void => {
    ensureWindow()
    const w = getWindow()
    if (!w) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
    if (view) w.webContents.send('shell:set-view', view)
  }

  tray = new Tray(trayIcon())
  tray.setToolTip('Astra – heute')

  const rebuild = (): void => {
    if (!tray) return
    const openCount = payload.tasks.filter((t) => !t.done).length
    tray.setTitle(payload.configured && openCount > 0 ? ` ${openCount}` : '')

    const items: MenuItemConstructorOptions[] = []
    if (!payload.configured) {
      items.push({
        label: 'Studienplaner einrichten …',
        click: () => reveal('studienplaner')
      })
    } else {
      items.push({ label: `Heute · ${payload.dateLabel}`, enabled: false })
      items.push({ type: 'separator' })
      if (payload.tasks.length === 0) {
        items.push({ label: 'Keine Lern-Aufgaben heute', enabled: false })
      } else {
        for (const t of payload.tasks) {
          items.push({
            label: `${t.time ? t.time + '  ' : ''}${t.title}   ·   ${t.kurs}`,
            type: 'checkbox',
            checked: t.done,
            click: () => {
              const w = getWindow()
              if (w) {
                w.webContents.send('tray:toggle-task', {
                  semester: t.semester,
                  kurs: t.kurs,
                  id: t.id
                })
              } else {
                reveal('studienplaner')
              }
            }
          })
        }
      }
      if (payload.events.length) {
        items.push({ type: 'separator' })
        items.push({ label: 'Termine heute', enabled: false })
        for (const ev of payload.events) {
          items.push({ label: `${ev.time}   ${ev.title}`, enabled: false })
        }
      }
    }
    items.push({ type: 'separator' })
    items.push({ label: 'Studienplaner öffnen', click: () => reveal('studienplaner') })
    items.push({ label: 'Astra öffnen', click: () => reveal() })
    items.push({ type: 'separator' })
    items.push({ label: 'Astra beenden', click: () => app.quit() })

    tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  rebuild()

  ipcMain.on('tray:update', (_e, p: TrayPayload) => {
    payload = p
    if (process.env['PDFSTUDIO_TRAY_DEBUG']) {
      console.log(
        '[tray] update:',
        JSON.stringify({ configured: p.configured, tasks: p.tasks.length, events: p.events.length })
      )
    }
    rebuild()
  })
}
