# QuestDay

QuestDay ist ein Aufgaben-Planer als installierbare Progressive Web App (PWA), optimiert für iPhone. Alle Daten bleiben ausschließlich lokal auf dem Gerät (IndexedDB) – kein Login, keine Cloud, kein eigener Server.

## Features

- **Vier Aufgabenarten**: einmalige Aufgaben, wiederkehrende Aufgaben (täglich/wöchentlich), Termine mit Uhrzeit, Langzeit-Ziele mit Teilschritten
- **Wiederholende Ziele**: Ziele können täglich/wöchentlich/monatlich/alle X Tage wiederholt werden — Teilschritte setzen sich pro Zyklus automatisch zurück, verpasste Zyklen werden markiert, Zyklen zählen in Streak und Statistik
- **Ziele bearbeiten & löschen**: Antippen einer Ziel-Karte öffnet ein Bearbeiten-Formular (Titel, Kategorie, Teilschritte, Wiederholung); Löschen erfolgt dort über einen Bestätigungsdialog
- **Feste Kategorien**: Haushalt, Arbeit, Hobby, Sonstiges
- **Erinnerungen** über die Notification API (lokal, siehe Einschränkungen unten)
- **Gamification**: XP & Level, Tages-Streaks, Badges, freischaltbare Belohnungen (virtuelle Trophäen, Farbdesigns, selbst definierte echte Belohnungen)
- **Ansichten**: Heute, Woche, Statistik (mit Diagrammen), Profil
- **.ics-Export** für Termine (einzeln oder als Wochen-Export), inkl. iOS-Sharesheet
- **Obsidian-Sync**: gleicht To-dos und Ziele in beide Richtungen mit einem GitHub-Repo ab (siehe unten)

## Tech-Stack

React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa (Workbox), recharts, date-fns, `ics`. Kein Router – vier flache Ansichten werden über internen State umgeschaltet.

## Entwicklung

```bash
npm install
npm run dev       # http://localhost:5173/QuestDay/
npm run build     # Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen (Service Worker aktiv)
npm test          # Vitest: Round-Trip und Merge-Regeln des Vault-Syncs
```

Service Worker, Manifest und Benachrichtigungen lassen sich vollständig nur im **Produktions-Build** (`build` + `preview`) testen, da `vite dev` standardmäßig keinen Service Worker registriert.

## XP-Formel

Nie negativ – zu spät erledigte Aufgaben geben weniger, aber nie null XP:

| Aufgabenart | XP |
|---|---|
| Einmalig, ohne Deadline | 10 |
| Einmalig, ≥24h vor Deadline erledigt | 15 |
| Einmalig, pünktlich (bis Ende Fälligkeitstag) | 10 |
| Einmalig, verspätet | 5 |
| Wiederkehrend | 8 (+3 Bonus vor Erinnerungszeit) |
| Termin, vor Startzeit abgehakt | 15 |
| Termin, während/nach Start abgehakt | 12 |
| Ziel-Teilschritt | 5 (+20 Bonus beim letzten Schritt) |

**Level**: Das benötigte XP für Level `L → L+1` beträgt `L × 100` (kumulativ).

## Streaks

Ein Tag zählt als Streak-Tag, wenn alle an diesem Tag fälligen Aufgaben/Termine/wiederholenden Ziel-Zyklen erledigt wurden. Tage ohne Fälliges zählen automatisch als erfüllt. Einmalige Ziele fließen weiterhin nicht ein, da sie kein festes Tagesdatum haben.

## Erinnerungen – wichtige Einschränkung

QuestDay speichert alles nur lokal und nutzt **keinen eigenen Server**. Echtes Web-Push (Benachrichtigungen bei komplett geschlossener App) würde technisch einen Server voraussetzen, der die Nachricht anstößt – das widerspricht dem Prinzip "keine Cloud".

Stattdessen prüft die App beim Start, alle 60 Sekunden während sie offen ist, und beim Zurückkehren in den Vordergrund, ob Erinnerungen fällig sind. Das bedeutet:

- Ist QuestDay offen oder war kürzlich im Hintergrund aktiv, kommen Erinnerungen zuverlässig an.
- Ist die App vollständig beendet, pausiert iOS jeden Hintergrundcode. Erinnerungen, die in dieser Zeit fällig wurden, werden beim nächsten Öffnen der App sofort nachgeholt.

## Obsidian-Sync

Unter **Profil → Obsidian-Sync** lassen sich GitHub-Benutzername, Repo-Name und ein Personal Access Token (Scope `repo` bzw. Fine-grained mit Schreibrecht auf *Contents*) hinterlegen. Die Zugangsdaten bleiben – wie alle anderen Daten – ausschließlich lokal im Browser (`localStorage`).

Ein Sync betrifft drei Markdown-Dateien:

| Datei | Inhalt | Richtung |
|---|---|---|
| `10-Quests/yyyy-MM-dd.md` | Die heute fälligen Quests als Checkliste, plus XP/Level/Streak im Frontmatter | nur Export |
| `20-Todos/To-dos.md` | Alle To-dos, gruppiert nach Überfällig, Heute, Demnächst, Ohne Datum, Termine, Wiederkehrend und Erledigt (letzte 30 Tage) | beide Richtungen |
| `30-Ziele/Ziele.md` | Alle Ziele mit Teilschritten – offen, wiederkehrend (inkl. aktuellem Zyklus), beendete Wiederholungen und erledigte Ziele | beide Richtungen |

Im Frontmatter stehen Kennzahlen, die sich in Obsidian per Dataview auswerten lassen. Fälligkeits- und Wiederholungsangaben nutzen das Format des *Tasks*-Plugins (`📅`, `✅`, `🔁`).

### Änderungen aus Obsidian

In `To-dos.md` und `Ziele.md` darfst du direkt in Obsidian arbeiten – der nächste Sync übernimmt es in die App:

- **Abhaken und Haken entfernen** – inklusive XP, Streak und Statistik, genau wie beim Abhaken in der App
- **Titel, Kategorie, Fälligkeitsdatum, Terminzeit und Ort ändern**
- **Neue Zeilen schreiben** – daraus werden neue To-dos bzw. Teilschritte; eine neue `###`-Überschrift legt ein neues Ziel an
- **Zeilen löschen** – der zugehörige Eintrag verschwindet auch in der App

Nicht zurückgelesen werden die abgeleiteten Angaben: Wiederholungsregel, Zyklus-Status, Fortschritt und Erinnerungszeit gehören der App und werden bei jedem Export neu geschrieben. Ein in Obsidian neu angelegtes Ziel ist deshalb immer ein einmaliges Ziel.

### Wie Einträge wiedererkannt werden

Jede exportierte Zeile trägt einen unsichtbaren Marker mit der Datenbank-ID: Listeneinträge eine Obsidian-Block-ID (`^qd-…`), Ziel-Überschriften einen Obsidian-Kommentar (`%%qd-…%%`). Beides ist in der Leseansicht unsichtbar. Dadurch überleben Einträge auch ein Umbenennen. Eine Zeile **ohne** Marker gilt als neu angelegt – kopierst du also eine Zeile samt Marker, wird die Kopie ignoriert; lösche den Marker, wenn daraus ein eigener Eintrag werden soll.

### Konflikte

Nach jedem Sync merkt sich die App den geschriebenen Dateistand als Baseline. Beim nächsten Sync zeigt der Vergleich mit der Datei im Repo, was in Obsidian geändert wurde – ein unveränderter alter Export ist so von einer echten Änderung unterscheidbar.

- Hat nur eine Seite geändert, gewinnt diese Seite.
- Haben **beide** geändert, gewinnt die jüngere: app-seitig der Zeitstempel `updatedAt` des Eintrags, vault-seitig das Commit-Datum der Datei.
- Ein in der App gelöschter Eintrag bleibt gelöscht, auch wenn er im Vault noch bearbeitet wurde – für Löschungen gibt es keinen Zeitstempel zum Vergleichen.
- Beim **allerersten** Sync nach dem Einrichten existiert noch keine Baseline. Dann wird nur exportiert, denn ein vorhandener Vault-Inhalt wäre nicht von einer Änderung zu unterscheiden.
- Lässt sich eine Datei nicht auswerten (Überschrift entfernt, Datei umgebaut), wird der Import übersprungen und nur exportiert – lieber kein Import als Datenverlust durch einen kaputten Parse.

### Wann synchronisiert wird

- **Nach jeder Änderung**: Anlegen, Löschen, Abhaken und Bearbeiten von Aufgaben und Zielen stößt einen Sync an (3 Sekunden Debounce, damit mehrere Änderungen hintereinander nur einen Commit erzeugen).
- **Regelmäßig im eingestellten Intervall**: standardmäßig alle 30 Minuten, einstellbar von 15 Minuten bis 12 Stunden oder auf **"Nur manuell"**. Geprüft wird beim App-Start, jede Minute während die App offen ist, beim Zurückkehren in den Vordergrund und sobald wieder eine Internetverbindung besteht.
- **Manuell** über **"Jetzt synchronisieren"**.

Wie bei den Erinnerungen gilt: Ist die App komplett geschlossen, läuft kein Hintergrundcode. Ein fällig gewordener Sync wird dann beim nächsten Öffnen sofort nachgeholt. Parallele Syncs werden zusammengefasst, und die Dateien werden nacheinander verarbeitet, damit GitHub pro Datei mit einem aktuellen SHA arbeitet.

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut die App bei jedem Push auf `main` und deployt sie automatisch auf GitHub Pages. Einmalig muss in den Repo-Einstellungen unter **Settings → Pages** die Quelle auf **"GitHub Actions"** gestellt werden. Der Workflow lässt sich zusätzlich manuell über **Actions → Deploy to GitHub Pages → Run workflow** auslösen (auch von einem Feature-Branch aus), um die App vor einem Merge nach `main` zu testen.

## Installation auf dem iPhone

1. Öffne die App-URL in **Safari** auf dem iPhone (nicht Chrome – "Zum Home-Bildschirm" funktioniert auf iOS nur in Safari).
2. Tippe auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben) in der unteren Menüleiste.
3. Scrolle im Menü nach unten und wähle **"Zum Home-Bildschirm"**.
4. Bestätige mit **"Hinzufügen"**. QuestDay erscheint danach als eigenes App-Icon auf dem Home-Bildschirm und startet im Vollbildmodus ohne Safari-Menüleiste.

### Benachrichtigungen aktivieren

1. Öffne QuestDay über das neu installierte App-Icon (nicht über Safari).
2. Auf der Startseite erscheint oben ein Hinweis-Banner "Aktiviere Erinnerungen …".
3. Tippe auf **"Aktivieren"** und bestätige den anschließenden System-Dialog mit **"Erlauben"**.
4. Lege danach bei einer Aufgabe oder einem Termin eine Erinnerungszeit fest – QuestDay benachrichtigt dich, solange die App offen oder kürzlich aktiv war (siehe Einschränkung oben).
