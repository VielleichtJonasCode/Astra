import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '../shared/types'

export function buildAppMenu(getWindow: () => BrowserWindow | null): void {
  const send = (action: MenuAction, payload?: unknown): void => {
    getWindow()?.webContents.send('menu', action, payload)
  }

  const isMac = process.platform === 'darwin'
  const devExtras: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [{ type: 'separator' }, { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about', label: `Über ${app.name}` },
              { type: 'separator' },
              { label: 'Einstellungen…', accelerator: 'Cmd+,', click: () => send('app.preferences') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide', label: `${app.name} ausblenden` },
              { role: 'hideOthers', label: 'Andere ausblenden' },
              { role: 'unhide', label: 'Alle einblenden' },
              { type: 'separator' },
              { role: 'quit', label: `${app.name} beenden` }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'Ablage',
      submenu: [
        { label: 'Öffnen…', accelerator: 'CmdOrCtrl+O', click: () => send('file.open') },
        {
          label: 'Zuletzt benutzt',
          role: 'recentDocuments',
          submenu: [{ label: 'Einträge löschen', role: 'clearRecentDocuments' }]
        },
        { type: 'separator' },
        { label: 'Sichern', accelerator: 'CmdOrCtrl+S', click: () => send('file.save') },
        {
          label: 'Sichern unter…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => send('file.saveAs')
        },
        { label: 'Exportieren…', accelerator: 'Shift+CmdOrCtrl+E', click: () => send('file.export') },
        { type: 'separator' },
        { label: 'PDFs zusammenführen…', click: () => send('tools.merge') },
        { label: 'PDF teilen…', click: () => send('tools.split') },
        { label: 'Stapelverarbeitung…', click: () => send('tools.batch') },
        { type: 'separator' },
        { label: 'Tab schließen', accelerator: 'CmdOrCtrl+W', click: () => send('file.close') }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Widerrufen', accelerator: 'CmdOrCtrl+Z', click: () => send('edit.undo') },
        {
          label: 'Wiederholen',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => send('edit.redo')
        },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { label: 'Auswahl löschen', accelerator: 'Delete', click: () => send('edit.delete') },
        { type: 'separator' },
        { label: 'Im Dokument suchen…', accelerator: 'CmdOrCtrl+F', click: () => send('edit.find') }
      ]
    },
    {
      label: 'Seiten',
      submenu: [
        { label: 'Nach rechts drehen', accelerator: 'CmdOrCtrl+R', click: () => send('page.rotateCW') },
        {
          label: 'Nach links drehen',
          accelerator: 'Shift+CmdOrCtrl+R',
          click: () => send('page.rotateCCW')
        },
        { type: 'separator' },
        { label: 'Seite duplizieren', click: () => send('page.duplicate') },
        { label: 'Seite löschen', accelerator: 'CmdOrCtrl+Backspace', click: () => send('page.delete') },
        { type: 'separator' },
        { label: 'Leere Seite einfügen', click: () => send('page.insertBlank') },
        { label: 'Seite aus Bild…', click: () => send('page.insertImage') },
        { label: 'Seiten aus PDF…', click: () => send('page.insertPdf') },
        { type: 'separator' },
        { label: 'Auswahl extrahieren…', click: () => send('page.extract') },
        { label: 'Zuschneiden…', click: () => send('page.crop') },
        { label: 'Größe / Format ändern…', click: () => send('tools.resize') }
      ]
    },
    {
      label: 'Darstellung',
      submenu: [
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+Plus', click: () => send('view.zoomIn') },
        { label: 'Verkleinern', accelerator: 'CmdOrCtrl+-', click: () => send('view.zoomOut') },
        { label: 'Tatsächliche Größe', accelerator: 'CmdOrCtrl+0', click: () => send('view.zoomReset') },
        { label: 'An Breite anpassen', accelerator: 'CmdOrCtrl+1', click: () => send('view.fitWidth') },
        { label: 'An Seite anpassen', accelerator: 'CmdOrCtrl+2', click: () => send('view.fitPage') },
        { type: 'separator' },
        { label: 'Einzelseite', click: () => send('view.single') },
        { label: 'Fortlaufend', click: () => send('view.continuous') },
        { label: 'Doppelseite', click: () => send('view.spread') },
        { type: 'separator' },
        { label: 'Ansicht drehen', click: () => send('view.rotateView') },
        {
          label: 'Nachtmodus',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => send('view.night')
        },
        { label: 'Präsentation', accelerator: 'CmdOrCtrl+Alt+P', click: () => send('view.presentation') },
        { role: 'togglefullscreen', label: 'Vollbild' },
        ...devExtras
      ]
    },
    {
      label: 'Werkzeuge',
      submenu: [
        { label: 'Text hinzufügen', accelerator: 'T', click: () => send('tool.text') },
        { label: 'Vorhandenen Text bearbeiten', accelerator: 'E', click: () => send('tool.editText') },
        { label: 'Text schwärzen / löschen', accelerator: 'B', click: () => send('tool.redact') },
        { label: 'Redaktions-Assistent…', click: () => send('tools.redactAssistant') },
        { type: 'separator' },
        { label: 'Hervorheben', accelerator: 'H', click: () => send('tool.highlight') },
        { label: 'Unterstreichen', click: () => send('tool.underline') },
        { label: 'Durchstreichen', click: () => send('tool.strike') },
        { label: 'Zeichnen', accelerator: 'D', click: () => send('tool.draw') },
        { label: 'Formen', accelerator: 'S', click: () => send('tool.shapes') },
        { label: 'Bild einfügen', accelerator: 'I', click: () => send('tool.image') },
        { label: 'Notiz', accelerator: 'N', click: () => send('tool.note') },
        { label: 'Stempel', click: () => send('tool.stamp') },
        { label: 'Unterschrift', click: () => send('tool.signature') },
        { type: 'separator' },
        { label: 'Wasserzeichen…', click: () => send('tools.watermark') },
        { label: 'Seitenzahlen / Bates…', click: () => send('tools.pageNumbers') },
        { label: 'Kopf-/Fußzeile…', click: () => send('tools.headerFooter') },
        { label: 'Metadaten…', click: () => send('tools.metadata') },
        { type: 'separator' },
        { label: 'Komprimieren…', click: () => send('tools.compress') },
        { label: 'Passwort setzen / entfernen…', click: () => send('tools.password') },
        { label: 'OCR / Texterkennung…', click: () => send('tools.ocr') }
      ]
    },
    { role: 'windowMenu', label: 'Fenster' },
    {
      role: 'help',
      label: 'Hilfe',
      submenu: [
        { label: 'PDF Studio – Handbuch', click: () => send('help.docs') },
        { label: 'Tastaturkurzbefehle', accelerator: 'CmdOrCtrl+/', click: () => send('help.shortcuts') },
        ...(isMac ? [] : ([{ label: 'Über PDF Studio', click: () => send('help.about') }] as MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
