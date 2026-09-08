# Astra unterwegs – Web-App (iPhone / Windows / überall)

Eine kleine, komplett **offline** laufende Web-App als *eine* App fürs Handy:

- **Scannen** – handschriftliche Notizen mit der Kamera aufnehmen, daraus wird ein PDF,
  das du in iCloud ablegst. Astra am Mac (Studienplaner) sortiert es nach Semester/Kurs ein.
- **Signieren / Prüfen** – PDFs mit deinem Astra-Signaturschlüssel versehen und prüfen.
  Gleiche `%%ASTRA-SIG`-Signatur wie Astra, gegenseitig prüfbar.

Kein Server, nichts wird hochgeladen. Der Ordner heißt jetzt `companion/`; nötig sind nur
`index.html`, `sw.js`, `manifest.webmanifest`.

> **Umbenannt von `sign/` → `companion/`.** Wenn deine GitHub-Pages-URL bisher auf `…/sign/`
> zeigte, lade die neuen Dateien in einen `companion/`-Ordner (neue URL `…/companion/`) und
> häng die App neu an den Home-Bildschirm. Den alten `sign/`-Ordner kannst du löschen.

## Als App aufs iPhone

Die Seite muss einmal über **https** erreichbar sein – am einfachsten kostenlos über
GitHub Pages (kein Server, keine Wartung):

1. Öffentliches GitHub-Repo anlegen, die drei Dateien in einen Ordner `companion/` hochladen
   (Web-Oberfläche: „Add file → Upload files“).
2. Repo → **Settings → Pages** → Branch `main`, Ordner `/root` → Save.
   Nach ein, zwei Minuten gibt es eine URL wie `https://DEINNAME.github.io/REPO/companion/`.
3. URL auf dem iPhone in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.
   Startet danach im Vollbild und funktioniert offline.

Alternativen (auch kostenlos, kein Server): Cloudflare Pages, Netlify Drop.

## Notizen scannen → in iCloud

1. Tab **Scannen** → „📷 Seiten aufnehmen“ (oder „🖼 Aus Fotos wählen“), mehrere Seiten möglich.
   Foto wird automatisch zugeschnitten, begradigt und belichtet; auf eine Seite tippen, um die
   Ecken von Hand zu setzen.
2. Optional einen Namen eingeben (z. B. `Analysis II – Grenzwerte`).
3. **„Als PDF sichern / in iCloud“** → im Teilen-Menü **„In Dateien sichern“** →
   Ordner **iCloud Drive → Studium → `_Eingang`**.
4. Am Mac in Astra → **Studienplaner**: die Datei liegt im *Eingang*; „Einsortieren“
   liest den Text (Apple Vision) und schlägt Semester + Kurs vor.

Der Ordner `Studium` (mit `_Eingang`) ist derselbe, den du in Astra unter
*Studienplaner → Ordner wählen* gesetzt hast. iCloud synchronisiert ihn.

## Schlüssel für Signieren

Astra → **Signatur-Werkzeug** → „Als Datei sichern …“ (oder „Als Text kopieren“),
Passwort vergeben. In der Web-App Tab **Schlüssel** → Datei wählen bzw. Text einfügen,
Passwort → „Schlüssel übernehmen“. Der Schlüssel bleibt nur auf diesem Gerät.

### Windows-PC ohne alles

`index.html` doppelklicken – öffnet im Browser und funktioniert (auch Signieren).
Nur die Installation als App / der Offline-Cache brauchen die https-Variante.

## Sicherheit

Der private Schlüssel liegt verschlüsselt in der `.astrakey`-Datei und nach dem Import
unverschlüsselt im lokalen Speicher des jeweiligen Geräts. Er verlässt das Gerät nie.
Wer Zugriff auf ein Gerät mit importiertem Schlüssel hat, kann in deinem Namen signieren –
behandle Datei und Passwort entsprechend. Die Scan-Funktion braucht keinen Schlüssel.
