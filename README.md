# QuestDay

QuestDay ist ein Aufgaben-Planer als installierbare Progressive Web App (PWA), optimiert für iPhone. Alle Daten bleiben ausschließlich lokal auf dem Gerät (IndexedDB) – kein Login, keine Cloud, kein eigener Server.

## Features

- **Vier Aufgabenarten**: einmalige Aufgaben, wiederkehrende Aufgaben (täglich/wöchentlich), Termine mit Uhrzeit, Langzeit-Ziele mit Teilschritten
- **Wiederholende Ziele**: Ziele können täglich/wöchentlich/monatlich/alle X Tage wiederholt werden — Teilschritte setzen sich pro Zyklus automatisch zurück, verpasste Zyklen werden markiert, Zyklen zählen in Streak und Statistik
- **Ziele bearbeiten & löschen**: Antippen einer Ziel-Karte öffnet ein Bearbeiten-Formular (Titel, Kategorie, Teilschritte, Wiederholung); Löschen erfolgt dort über einen Bestätigungsdialog
- **Feste Kategorien**: Haushalt, Arbeit, Hobby, Sonstiges
- **Obsidian-Sync in beide Richtungen**: Tages-Quests und Zusammenfassungen werden ins Vault-Repo exportiert, neue Aufgaben und Ziele aus einer Inbox-Datei im Vault importiert
- **Tageszusammenfassung** auf der Startseite: umschaltbar zwischen **Heute** und **Morgen**, mit Vorlesen-Funktion (Sprachausgabe auf dem Gerät) und Export von heutiger Zusammenfassung + Ausblick auf morgen als Textdatei
- **Erinnerungen** über die Notification API (lokal, siehe Einschränkungen unten)
- **Gamification**: XP & Level, Tages-Streaks, Badges, freischaltbare Belohnungen (virtuelle Trophäen, Farbdesigns, selbst definierte echte Belohnungen)
- **Ansichten**: Heute, Woche, Statistik (mit Diagrammen), Profil
- **.ics-Export** für Termine (einzeln oder als Wochen-Export), inkl. iOS-Sharesheet

## Tech-Stack

React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa (Workbox), recharts, date-fns, `ics`. Kein Router – vier flache Ansichten werden über internen State umgeschaltet.

## Entwicklung

```bash
npm install
npm run dev       # http://localhost:5173/QuestDay/
npm run build     # Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen (Service Worker aktiv)
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

## Tageszusammenfassung & Sprachausgabe

Die Karte oben auf der Startseite fasst den Tag zusammen: fällige Aufgaben, Termine mit Uhrzeit, heute fällige Ziel-Zyklen, erledigt/offen, XP des Tages, Level und Streak. Über den Umschalter **Morgen** zeigt dieselbe Karte den Ausblick auf den nächsten Tag (bereits erledigte einmalige Aufgaben und Termine werden dort ausgeblendet).

- **Vorlesen** nutzt die Web Speech API des Geräts – ohne Server, ohne Cloud-Dienst. Der Text wird satzweise ausgegeben, weil iOS lange Äußerungen sonst abbricht. Die Ausgabe muss per Tipp gestartet werden und stoppt, wenn die App in den Hintergrund geht oder der Stummschalter aktiv ist.
- **Als Audiodatei speichern ist bewusst nicht implementiert**: Browser geben die Sprachausgabe nur an die Lautsprecher aus, ein Mitschnitt in eine Datei ist ohne Cloud-TTS-Dienst nicht möglich. Stattdessen exportiert die Karte die Zusammenfassung von heute **und** morgen als Textdatei (iOS-Sharesheet bzw. Download).
- Ist der **Obsidian-Vault-Sync** eingerichtet, landen beide Zusammenfassungen zusätzlich unter `10-Quests/<Datum>.md` im Vault.

## Obsidian-Vault-Sync (beide Richtungen)

Einzurichten unter **Profil → Obsidian-Sync**: GitHub-Benutzername, Repo-Name des Vaults, Personal Access Token (Recht *Contents: read and write* für dieses Repo) und die Inbox-Datei (Standard `00-Inbox.md`). Die Zugangsdaten bleiben im lokalen Speicher des Geräts.

**Export (App → Vault)**: `10-Quests/<Datum>.md` mit Frontmatter (erledigt, offen, XP, Level, Streak), der Tages-Checkliste sowie den Zusammenfassungen für heute und morgen. Läuft automatisch kurz nach jeder Änderung und über *Jetzt synchronisieren*.

**Import (Vault → App)**: *Jetzt synchronisieren* liest zuerst die Inbox-Datei. Jede **offene** Checkbox-Zeile wird als Aufgabe oder Ziel angelegt; danach verschiebt QuestDay genau diese Zeilen abgehakt in den Abschnitt `## Importiert` am Dateiende, damit sie nicht doppelt ankommen. Alles andere in der Datei – Fließtext, Überschriften, Frontmatter, bereits abgehakte Zeilen – bleibt unverändert.

```markdown
- [ ] Wäsche waschen #Haushalt @2026-08-10 !18:00
- [ ] Zahnarzt #Sonstiges @morgen 14:30-15:30 ort:Praxis Müller
- [ ] Vitamine nehmen #Haushalt täglich !08:00
- [ ] Ziel: Vakuum #Hobby täglich !07:00
- [ ] Ziel: Wohnung renovieren #Sonstiges bis:2026-12-31 > Streichen > Boden verlegen
```

| Marker | Bedeutung |
|---|---|
| `#Haushalt` `#Arbeit` `#Hobby` `#Sonstiges` | Kategorie (Standard: Sonstiges) |
| `@2026-08-10`, `@heute`, `@morgen` | Fälligkeits- bzw. Termindatum |
| `14:30` oder `14:30-15:30` | macht die Zeile zu einem **Termin** (Datum sonst heute) |
| `!07:00` | Erinnerungszeit |
| `ort:…` | Ort eines Termins (bis Zeilenende) |
| `täglich`, `montags`…`sonntags` | wiederkehrende Aufgabe |
| `monatlich`, `alle 14 tage` | nur für Ziele |
| `Ziel:` am Zeilenanfang | legt ein Ziel statt einer Aufgabe an |
| `>` | trennt Teilschritte eines Ziels |
| `bis:2026-12-31` | Zieldatum eines Ziels |

Zeilen, die nicht verarbeitet werden können (unbekannte Kategorie, `monatlich` ohne `Ziel:`), bleiben in der Inbox stehen und werden unter dem Sync-Status als Hinweis aufgelistet. Schlägt das Aufräumen der Inbox fehl (z. B. weil die Datei zwischen Lesen und Schreiben im Vault geändert wurde), sind die Einträge trotzdem angelegt – die App weist dann darauf hin, dass die Zeilen manuell entfernt werden müssen.

## Erinnerungen – wichtige Einschränkung

QuestDay speichert alles nur lokal und nutzt **keinen eigenen Server**. Echtes Web-Push (Benachrichtigungen bei komplett geschlossener App) würde technisch einen Server voraussetzen, der die Nachricht anstößt – das widerspricht dem Prinzip "keine Cloud".

Stattdessen prüft die App beim Start, alle 60 Sekunden während sie offen ist, und beim Zurückkehren in den Vordergrund, ob Erinnerungen fällig sind. Das bedeutet:

- Ist QuestDay offen oder war kürzlich im Hintergrund aktiv, kommen Erinnerungen zuverlässig an.
- Ist die App vollständig beendet, pausiert iOS jeden Hintergrundcode. Erinnerungen, die in dieser Zeit fällig wurden, werden beim nächsten Öffnen der App sofort nachgeholt.

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
