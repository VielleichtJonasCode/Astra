# PDF Studio

Ein voll ausgestatteter PDF-Editor für macOS (Apple Silicon) auf Basis von Electron.

![App-Icon](resources/icon.png)

## Funktionen

**Ansehen**
- Fortlaufende, Einzel- und Doppelseiten­ansicht, stufenloser Zoom (Fit-Breite/-Seite, Pinch, Zoom-zu-Cursor)
- Auswählbarer Textlayer, Volltextsuche (`⌘F`) mit Treffer-Navigation
- Nachtmodus (PDF invertieren), Präsentationsmodus, native Menüleiste, Light/Dark automatisch
- Mehrere Dokumente in Tabs, „Zuletzt benutzt", Drag & Drop aufs Fenster, „Öffnen mit"

**Seiten**
- Miniaturen-Seitenleiste mit **Drag-&-Drop-Umsortierung** und Mehrfachauswahl
- Drehen (±90° / 180°), löschen, duplizieren
- Einfügen: leere Seite, aus Bild (PNG/JPEG), aus anderem PDF
- **Zusammenführen** mehrerer PDFs (Reihenfolge per Ziehen)
- **Teilen**: in Einzelseiten, alle N Seiten oder nach Bereichen
- **Größe & Format**: Skalierung in %, auf A3/A4/A5/Letter/… bringen, Inhalt einpassen & zentrieren
- In neues PDF extrahieren

**Bearbeiten & Annotieren**
- **Text schreiben** (Schrift, Größe, Farbe, Ausrichtung, optional deckende Fläche darunter)
- **Vorhandenen Text bearbeiten** – Block anklicken, überschreiben (Original wird abgedeckt)
- **Text löschen / echt schwärzen** – Redaktion, die den Inhalt beim Sichern wirklich entfernt (MuPDF)
- Hervorheben, Unterstreichen, Durchstreichen, Freihand-Stift
- Formen: Rechteck, Ellipse, Linie, Pfeil (Farbe, Füllung, Strichstärke)
- Bild einfügen, Notiz, Stempel
- Auswählen, Verschieben, Größe ändern, Deckkraft – alles mit vollständigem **Undo/Redo**

**Dokument-Werkzeuge**
- Wasserzeichen (diagonal / zentriert / gekachelt)
- Seitenzahlen & Bates-Nummerierung (6 Positionen, Startnummer, Präfix)
- Kopf- & Fußzeile mit Platzhaltern (`{page}`, `{pages}`, `{date}`, `{title}`, `{filename}`)
- Metadaten bearbeiten
- **Komprimieren** (Bilder neu codieren, Ströme optimieren – MuPDF)
- **Passwortschutz** setzen / entfernen (AES-256 – MuPDF)
- **OCR / Texterkennung** (Deutsch, Englisch, u. a.) – gescannte PDFs durchsuchbar machen
- **Redaktions-Assistent** – E-Mail, Telefon, IBAN, Kreditkarte oder eigenes Muster finden & schwärzen
- **Stapelverarbeitung** – Wasserzeichen / Seitenzahlen / Komprimieren / Zusammenführen über viele Dateien

**Export**
- PDF-Kopie, Seitenbereich als PDF, alle/ausgewählte Seiten als PNG oder JPEG (frei wählbare DPI)

## Entwicklung

```bash
npm install
# npm blockiert Install-Scripts; einmalig freigeben:
npm install-scripts approve electron esbuild fsevents

npm run dev          # Electron mit Hot Reload  (öffnet ein Fenster)
npm run typecheck    # TypeScript prüfen
npm run build        # Produktions-Build nach out/
npm run dist         # .app + .dmg nach release/  (arm64, unsigniert)
npm run dist:dir     # nur .app (schneller, zum Testen)
```

`npm run predev` / `prebuild` kopieren pdf.js- und Tesseract-Assets nach `src/renderer/public/`.
`npm run icon` erzeugt `resources/icon.png` neu.

### Screenshot-Hilfe

`PDFSTUDIO_SHOT=/pfad/bild.png PDFSTUDIO_OPEN=/pfad/test.pdf npm run dev` startet die App,
öffnet das PDF, macht nach `PDFSTUDIO_SHOT_DELAY` ms (Standard 3000) einen Screenshot und beendet sich.
In Produktionsbuilds inaktiv (nur wenn die Variable gesetzt ist).

## Installation der gebauten App

Die App ist **nicht signiert**. Beim ersten Start: Rechtsklick auf „PDF Studio.app" → „Öffnen"
(oder Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen").

## Technik

| Bereich | Bibliothek |
| --- | --- |
| Shell / Packaging | Electron 33, electron-vite, electron-builder |
| UI | React 18 + TypeScript, handgeschriebenes CSS-Token-System, zustand + immer |
| Rendern | pdf.js (`pdfjs-dist`) |
| Bearbeiten / Export | `pdf-lib` + `@pdf-lib/fontkit` |
| Redaktion / Verschlüsselung / Kompression | `mupdf` (WASM, im Web-Worker) |
| OCR | `tesseract.js` (Sprachdaten werden bei Bedarf geladen) |
| Drag & Drop | `@dnd-kit` |

## Architektur

```
src/
  main/       Electron-Hauptprozess: Fenster, native Menüleiste, IPC (Dateien, Dialoge),
              OCR-Sprachdaten-Download + eigenes Protokoll für die Daten
  preload/    contextBridge → window.api (typisiert in src/shared/types.ts)
  renderer/
    store/      docStore (Dokumentmodell + Undo/Redo via immer-Patches), uiStore, …
    pdf/        model.ts, pdfjs-Anbindung, render, exportPdf (Modell → Bytes),
                bakeAnnotations, ops/ (merge, split, resize, overlays, ocr, pageImages),
                mupdf/ (Worker-Client + Nachbearbeitung)
    annotations/  AnnotationLayer (Overlay: erstellen, auswählen, transformieren),
                  AnnotationView, TextEditor, factory
    components/   AppShell, TitleBar, TabBar, Toolbar, Sidebar (Miniaturen),
                  Viewer (virtualisiert), Inspector, dialogs/, common/ (mac-Optik)
```

Das Original-PDF bleibt unangetastet; jede Bearbeitung ist eine Operation im Modell.
Erst beim Sichern/Exportieren übersetzt `exportPdf.ts` das Modell in echte PDF-Bytes
(pdf-lib für Seiten & Annotationen, danach optional MuPDF für Redaktion/Passwort/Kompression).

## Bekannte Grenzen

- „Vorhandenen Text bearbeiten" deckt das Original ab und setzt neuen Text darüber (kein
  echtes Reflow) – wie in vergleichbaren Editoren bei nicht getaggten PDFs.
- Annotationen auf **gedrehten** Seiten werden näherungsweise positioniert.
- OCR und der MuPDF-Worker laufen im Browser-Kontext von Electron und sollten nach der
  Installation einmal praktisch geprüft werden (Sprachdaten benötigen beim ersten Mal Internet).
- Bild-Wasserzeichen: als Bild-Annotation lösbar, nicht als globales Overlay.

## Lizenzen

`mupdf` steht unter **AGPL-3.0** – für die private Nutzung unproblematisch; bei Weitergabe
sind die AGPL-Bedingungen zu beachten. `pdfjs-dist` (Apache-2.0), `pdf-lib` (MIT),
`tesseract.js` (Apache-2.0), `@dnd-kit` (MIT).
