# ToDo

ToDo ist ein cleaner, aufgeräumter Aufgaben-Planer als installierbare Progressive Web App (PWA), optimiert für iPhone. Alle Daten bleiben lokal auf dem Gerät (IndexedDB). Optional lässt sich der Tagesplan mit einem GitHub-/Obsidian-Vault synchronisieren.

## Struktur

Drei Reiter in der unteren Leiste:

- **Übersicht** – Begrüßung & Datum, heutige Aufgaben mit Tages-Fortschritt, Wochenkalender zum Planen (Drag & Drop) und ein Überblick über die Ziele
- **ToDos** – alle Aufgaben, gruppiert nach Fälligkeit (Heute / Morgen / Später / Ohne Datum), mit Kategorie-Filter und Schnell-Eingabe
- **Ziele** – Langzeit-Ziele mit Teilschritten und Prozent-Fortschritt, auch wiederkehrend

Einstellungen (Kategorien, Design, Sync, Statistik) öffnen sich über das Zahnrad-Symbol oben.

## Features

- **Drei Aufgabenarten**: einmalige Aufgaben, wiederkehrende Aufgaben (täglich / an mehreren Wochentagen), Termine mit Uhrzeit
- **Ziele** mit Teilschritten; einmalig oder wiederkehrend (täglich / wöchentlich an mehreren Wochentagen / monatlich / alle X Tage)
- **Wochenkalender**: Aufgaben per Drag & Drop auf einen Tag planen, undatierte Aufgaben aus dem „Ungeplant"-Bereich einplanen, Wochen vor-/zurückblättern
- **Eigene Kategorien**: frei anlegbar mit Name und Farbe, optional pro Aufgabe/Ziel
- **Schwarzes Design**: cleanes, komplett dunkles Design mit frei wählbarer Akzentfarbe; Hell/Dunkel umschaltbar
- **Erinnerungen** über die Notification API (lokal)
- **Statistik**: Diagramme zur Produktivität (nach Wochentag, Uhrzeit, Kategorie)
- **.ics-Export** für Termine (einzeln oder als Wochen-Export)
- **Obsidian-/GitHub-Sync**: exportiert Heute-Aufgaben, Ziele und den Wochenplan als Markdown in ein GitHub-Repo (Vault)

## Tech-Stack

React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa (Workbox), recharts, date-fns, `ics`. Kein Router – flache Ansichten werden über internen State umgeschaltet.

## Entwicklung

```bash
npm install
npm run dev       # http://localhost:5173/QuestDay/
npm run build     # Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen (Service Worker aktiv)
```

Service Worker, Manifest und Benachrichtigungen lassen sich vollständig nur im **Produktions-Build** (`build` + `preview`) testen, da `vite dev` standardmäßig keinen Service Worker registriert.

## Erinnerungen – wichtige Einschränkung

ToDo speichert alles lokal und nutzt **keinen eigenen Server**. Die App prüft beim Start, in Intervallen während sie offen ist, und beim Zurückkehren in den Vordergrund, ob Erinnerungen fällig sind. Ist die App vollständig beendet, pausiert iOS jeden Hintergrundcode – fällige Erinnerungen werden beim nächsten Öffnen nachgeholt.

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut die App bei jedem Push auf `main` und deployt sie automatisch auf GitHub Pages. Der Deploy-Pfad bleibt `/QuestDay/`, solange das Repository `questday` heißt.

## Installation auf dem iPhone

1. Öffne die App-URL in **Safari** auf dem iPhone.
2. Tippe auf das **Teilen-Symbol** in der Menüleiste.
3. Wähle **„Zum Home-Bildschirm"** und bestätige mit **„Hinzufügen"**.
