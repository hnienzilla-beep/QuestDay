# ToDo

ToDo ist ein cleaner, aufgeräumter Aufgaben-Planer als installierbare Progressive Web App (PWA), optimiert für iPhone. Alle Daten bleiben lokal auf dem Gerät (IndexedDB). Optional lässt sich der Tagesplan mit einem GitHub-/Obsidian-Vault synchronisieren.

## Struktur

Drei Reiter in der unteren Leiste:

- **Übersicht** – Begrüßung & Datum, heutige Aufgaben mit Tages-Fortschritt, Wochenkalender zum Planen (Drag & Drop) und ein Überblick über die Ziele
- **ToDos** – alle Aufgaben, gruppiert nach Fälligkeit (Heute / Morgen / Später / Ohne Datum), mit Kategorie-Filter und Schnell-Eingabe
- **Ziele** – Langzeit-Ziele mit Teilschritten und Prozent-Fortschritt, auch wiederkehrend; Abgeschlossenes liegt im Archiv

Einstellungen (Kategorien, Design, Sync, Statistik) öffnen sich über das Zahnrad-Symbol oben.

## Features

- **Drei Aufgabenarten**: einmalige Aufgaben, wiederkehrende Aufgaben (täglich / an mehreren Wochentagen), Termine mit Uhrzeit
- **Ziele** mit Teilschritten; einmalig oder wiederkehrend (täglich / wöchentlich an mehreren Wochentagen / monatlich / alle X Tage)
- **Ziel-Archiv**: abgeschlossene und gestoppte Ziele wandern eingeklappt in einen aufklappbaren Archiv-Bereich und verschwinden aus der Übersicht
- **Wochenkalender**: Aufgaben per Drag & Drop auf einen Tag planen, undatierte Aufgaben aus dem „Ungeplant"-Bereich einplanen, Wochen vor-/zurückblättern
- **Abhaken für jeden Tag**: Tag in der Wochenleiste antippen, alles für diesen Tag abhaken – rückwirkend nachtragen und im Voraus erledigen, Aufgaben wie Ziel-Zyklen
- **Eigene Kategorien**: frei anlegbar mit Name und Farbe, optional pro Aufgabe/Ziel
- **Schwarzes Design**: cleanes, komplett dunkles Design mit frei wählbarer Akzentfarbe; Hell/Dunkel umschaltbar
- **Erinnerungen** über die Notification API (lokal)
- **Statistik**: Diagramme zur Produktivität (nach Wochentag, Uhrzeit, Kategorie)
- **.ics-Export** für Termine (einzeln oder als Wochen-Export)
- **Obsidian-/GitHub-Sync**: beidseitiger Abgleich mit einem privaten GitHub-Repo – Markdown, das in Obsidian les- und änderbar ist (siehe unten)

## Tech-Stack

React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa (Workbox), recharts, date-fns, `ics`. Kein Router – flache Ansichten werden über internen State umgeschaltet.

## Entwicklung

```bash
npm install
npm run dev       # http://localhost:5173/QuestDay/
npm run build     # Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen (Service Worker aktiv)
npm run test      # Vitest (Sync-Kern: Determinismus, Parser, Löschregeln)
npm run lint      # oxlint
```

Service Worker, Manifest und Benachrichtigungen lassen sich vollständig nur im **Produktions-Build** (`build` + `preview`) testen, da `vite dev` standardmäßig keinen Service Worker registriert.

## Erinnerungen – wichtige Einschränkung

ToDo speichert alles lokal und nutzt **keinen eigenen Server**. Die App prüft beim Start, in Intervallen während sie offen ist, und beim Zurückkehren in den Vordergrund, ob Erinnerungen fällig sind. Ist die App vollständig beendet, pausiert iOS jeden Hintergrundcode – fällige Erinnerungen werden beim nächsten Öffnen nachgeholt.

## Obsidian-Sync

ToDo hat keinen Server. Zum Abgleichen schreibt die App ihren Bestand als Markdown-Dateien in
ein **privates GitHub-Repo** – dort sind sie in Obsidian lesbar und änderbar. Daneben liegt eine
JSON-Datei mit dem kompletten Datenbestand, aus der sich ein neues Gerät einrichten lässt.

Einrichtung unter **Einstellungen → Synchronisierung**: Benutzername, Repo-Name, Branch und ein
Fine-grained Personal Access Token mit **Contents: read and write** auf genau dieses Repo.

### Was im Repo liegt

```
QuestDay/
  Tage/2026-08-06.md      Aufgaben, Termine und fällige Ziel-Zyklen dieses Tages
  Ziele/<titel>.md        ein Ziel je Datei, mit seinen Teilschritten
  Aufgaben.md             wiederkehrende Aufgaben als Tabelle
  Ungeplant.md            einmalige Aufgaben ohne Datum
  Kategorien.md           Kategorien mit Farbe und ID
  questday-data.json      vollständiger Datenbestand für ein neues Gerät
  _Konflikte/…            gesicherte lokale Fassung, falls beide Seiten dieselbe Datei änderten
```

Alles **außerhalb** von `QuestDay/` fasst die App nie an. Auch innerhalb gelten nur Dateien als
ihre, die das passende `typ:`-Frontmatter tragen – eine eigene Notiz unter `QuestDay/Ziele/`
bleibt unberührt.

Die `^qd-…` am Zeilenende sind Obsidian-Block-IDs: Sie verknüpfen die Zeile mit dem Eintrag in der
App und sind in der Leseansicht unsichtbar. Wer eine Zeile neu schreibt, lässt sie einfach weg –
die App ergänzt sie beim nächsten Schreiben.

### Was du in Obsidian ändern darfst

| Änderung im Repo | Wirkung in der App |
|---|---|
| Haken in einer Tagesdatei setzen/entfernen | Erledigung für **dieses Datum** anlegen/entfernen |
| Titel, Uhrzeit, Ort in einer Zeile ändern | wird übernommen |
| Kategorie in der Klammer ändern | wird übernommen, **wenn** der Name in `Kategorien.md` existiert |
| neue Zeile `- [ ] Titel (Kategorie)` in einer Tagesdatei | neue einmalige Aufgabe für diesen Tag |
| Haken in `Ungeplant.md` setzen/entfernen | Aufgabe ohne Datum erledigen/wieder öffnen |
| Zeile in `Ungeplant.md` entfernen | Aufgabe wird gelöscht |
| Zeile einer **einmaligen** Aufgabe / eines Termins entfernen | Aufgabe wird gelöscht |
| Zeile einer **wiederkehrenden** Aufgabe oder eines Ziel-Zyklus entfernen | **nichts** – sie erscheint wieder |
| neue Zeile unter `## Teilschritte` | neuer Teilschritt |
| Teilschritt-Zeile entfernen | Teilschritt wird gelöscht |
| Ziel-Datei löschen oder umbenennen | **nichts** – sie wird unter ihrem Namen aus dem Ziel-Titel neu geschrieben |
| Zeile in `Aufgaben.md` / `Kategorien.md` entfernen | **nichts** |
| Zelle leeren | **nichts** – leere Zelle heißt „unverändert“, ein `-` löscht den Wert |
| Zeile ohne ID in `Kategorien.md` | neue Kategorie |
| `questday-data.json` bearbeiten | wird ignoriert (außer beim Einrichten eines neuen Geräts) |

**Zur Klammer:** Sie gilt nur dann als Kategorie, wenn der Name in `Kategorien.md` vorkommt.
`- [ ] Einkaufen (Milch, Brot)` behält den Klammertext also im Titel, statt eine Kategorie
„Milch, Brot“ zu erfinden. Fehlt die Klammer ganz, bleibt die Kategorie **unverändert** –
entfernt wird sie in der App oder mit einem `-` in `Aufgaben.md`.

**Warum manches nur in der App löschbar ist:** wiederkehrende Aufgaben, Ziele und Kategorien
werden von Erledigungen, Zyklen und Verweisen referenziert. Eine versehentlich gelöschte Zeile
würde sonst eine ganze Historie mitreißen. Über das Repo gelöscht wird deshalb nur, was
ausschließlich zu genau einer Tagesdatei oder einer Plan-Phase gehört.

Kann die App eine Datei nicht vollständig lesen – etwa weil Fließtext in einem verwalteten
Abschnitt steht –, **lässt sie sie komplett in Ruhe**: nichts wird übernommen, nichts gelöscht und
die Datei wird nicht überschrieben. Das Panel listet solche Dateien auf.

### Wie der Abgleich läuft

Beide Richtungen: Was in Obsidian geändert wurde, wird zuerst in die App übernommen, dann schreibt
die App ihren Stand zurück. **Bei gleichzeitiger Änderung gewinnt die Datei im Repo** – die
verdrängte lokale Fassung landet als Sicherung unter `QuestDay/_Konflikte/`.

Jeder Durchlauf prüft den gesamten Bestand, nicht nur die letzten Tage. Billig bleibt das, weil
eine einzige Anfrage alle Dateien mit ihrer Version auflistet; die App berechnet die Versionen
ihres eigenen Stands lokal und überspringt alles, was sich auf beiden Seiten nicht geändert hat.

| Fall | Anfragen | Commits |
|---|---|---|
| nichts geändert | **1** (und die zählt nicht gegen das GitHub-Limit) | **0** |
| nur lokal geändert | 5 | 1 |
| im Repo geändert | 5 + eine je geänderter Datei | 1 |

Ausgelöst wird beim App-Start, alle 15 Minuten, rund 3 Sekunden nach jeder Änderung und beim
Zurückkehren in die App. Schlägt ein Durchlauf fehl, wächst der Abstand (30 s → 1 → 2 → 5 →
15 min). Läuft die App nicht, ruht der Abgleich – aus demselben Grund wie bei den Erinnerungen:
echter Hintergrundbetrieb bräuchte einen Server.

Vergangene Tagesdateien sind **eingefroren**: Sie zeigen nur, was an diesem Tag tatsächlich
anstand oder erledigt wurde. Eine neu angelegte tägliche Aufgabe schreibt deshalb nicht die
gesamte Vergangenheit um. In die Zukunft reicht der Vorlauf zwei Wochen.

### Neues Gerät einrichten

Sync im neuen Gerät mit demselben Repo einrichten – ist die lokale Datenbank leer, stellt der
erste Durchlauf alles aus `questday-data.json` wieder her. Ist bereits etwas eingetragen, geht es
über **Mehr → „Aus JSON wiederherstellen“**.

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut die App bei jedem Push auf `main` und deployt sie automatisch auf GitHub Pages. Der Deploy-Pfad bleibt `/QuestDay/`, solange das Repository `questday` heißt.

## Installation auf dem iPhone

1. Öffne die App-URL in **Safari** auf dem iPhone.
2. Tippe auf das **Teilen-Symbol** in der Menüleiste.
3. Wähle **„Zum Home-Bildschirm"** und bestätige mit **„Hinzufügen"**.
