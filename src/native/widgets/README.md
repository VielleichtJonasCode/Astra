# Astra – macOS-Widgets

Echte Schreibtisch-/Mitteilungszentrale-Widgets (WidgetKit). Sie zeigen einen
kompakten Studienplaner-Schnappschuss, den die App laufend in einen
**App-Group-Container** schreibt (`src/main/widgetBridge.ts`).

## Was schon funktioniert (ohne alles Weitere)

Die App schreibt den Schnappschuss bereits – sichtbar unter
**Einstellungen → macOS-Widgets**. Pfad:

```
~/Library/Group Containers/group.com.jonathanweidner.astra/Library/Application Support/AstraWidgets/snapshot.json
```

(bzw. `userData/widget/snapshot.json` als Kopie).

## Damit die Widgets in der Galerie erscheinen

macOS lädt Widget-Erweiterungen **nur aus signierten Apps**. Astra wird derzeit
unsigniert gebaut (`electron-builder.yml` → `mac.identity: null`). Einmalig
einzurichten:

### 1. Voraussetzungen

- Xcode (aus dem App Store)
- `brew install xcodegen`
- Apple-Developer-Account (kostenlos reicht für den lokalen Gebrauch; für die
  Weitergabe/Notarisierung ein bezahlter). **Team-ID** notieren.
- Eine **App Group** `group.com.jonathanweidner.astra` im Developer-Portal
  anlegen (bzw. Xcode legt sie beim ersten Signieren automatisch an).

### 2. Erweiterung bauen

```bash
# Team-ID eintragen:
#   src/native/widgets/project.yml  →  DEVELOPMENT_TEAM: 'XXXXXXXXXX'
npm run widgets
```

Ergebnis: `resources/AstraWidgets.appex`.

### 3. In electron-builder einbinden

`electron-builder.yml` → im `mac:`-Block:

```yaml
mac:
  identity: 'Apple Development: dein@apple.id (XXXXXXXXXX)' # oder Developer ID
  hardenedRuntime: true
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist
  extraFiles:
    - from: resources/AstraWidgets.appex
      to: PlugIns/AstraWidgets.appex
```

`resources/entitlements.mac.plist` (Haupt-App – dieselbe App Group):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.app-sandbox</key><false/>
  <key>com.apple.security.application-groups</key>
  <array><string>group.com.jonathanweidner.astra</string></array>
</dict></plist>
```

Optional `predist` erweitern, damit die Erweiterung bei jedem `dist` mitgebaut wird:

```json
"predist": "... && ASTRA_BUILD_WIDGETS=1 node scripts/build-widgets.mjs"
```

### 4. Bauen & installieren

```bash
npm run dist   # signiert; .appex landet in Astra.app/Contents/PlugIns/
```

App nach `/Applications` kopieren und einmal starten. Danach:
**Schreibtisch → Rechtsklick → „Widgets bearbeiten"** → *Astra*.

## Widgets

| Kind              | Größen        | Inhalt |
|-------------------|---------------|--------|
| Studium kompakt   | S, M          | Große Zahl frei wählbar (Klausur-Countdown / Schnitt / offene Aufgaben / Tipp) + Kennzahlen |
| Heute             | S, M, L       | Heutige Lern-Aufgaben (mit Filter) + Termine |
| Noten & Verlauf   | S, M, L       | ECTS-Schnitt groß, Semester-Schnitt, Mini-Notenverlauf |
| Fortschritt       | S, M          | erledigt/geplant, überfällig, Quiz-Sicherheit |
| Lern-Tipp         | M, L          | letzte KI-Lernstrategie in Kurzform |
| Überblick         | M, L          | Countdown + Schnitt + Aufgaben + Tipp zusammen |

## Optionen je Widget (langes Drücken → „Widget bearbeiten")

Darstellung (automatisch/farbig/dezent) · Akzentfarbe (7) · große Zahl zeigt …
· Countdown an/aus · Termine an/aus · Aufgaben-Filter (alle/Lernen/Wiederholen/Quiz)
· erledigte ausblenden · max. Aufgaben (1–8) · 24-Stunden-Zeit · Notenverlauf an/aus
· Semester im Fokus.

## Aktualisierung

Die Zeitleiste zieht alle ~10 Minuten nach (bzw. sobald die Mitteilungszentrale
aufwacht). Ein sofortiges Neuladen bei jeder Datenänderung bräuchte einen
signierten Swift-Helfer, der `WidgetCenter.shared.reloadAllTimelines()` aufruft –
bewusst weggelassen.
