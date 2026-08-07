import { ARCHIVE_HEADING } from './inboxParser'

/**
 * Startvorlage, die QuestDay anlegt, wenn im Vault noch keine Inbox-Datei liegt.
 * Die Beispiele stehen bewusst in einem Code-Block - der Parser überspringt ihn,
 * sie werden also nicht selbst als Aufgaben importiert.
 */
export const INBOX_TEMPLATE = `---
typ: questday-inbox
---

# QuestDay Inbox

Neue Aufgaben und Ziele hier als offene Checkbox eintragen. QuestDay übernimmt sie
beim nächsten Sync und verschiebt die Zeilen danach abgehakt nach unten unter
"${ARCHIVE_HEADING}". Alles andere in dieser Datei bleibt unverändert stehen.

\`\`\`text
- [ ] Wäsche waschen #Haushalt @2026-08-10 !18:00
- [ ] Zahnarzt #Sonstiges @morgen 14:30-15:30 ort:Praxis Müller
- [ ] Vitamine nehmen #Haushalt täglich !08:00
- [ ] Ziel: Vakuum #Hobby täglich !07:00
- [ ] Ziel: Renovieren #Sonstiges bis:2026-12-31 > Streichen > Boden verlegen
\`\`\`

| Marker | Bedeutung |
| --- | --- |
| \`#Haushalt\` \`#Arbeit\` \`#Hobby\` \`#Sonstiges\` | Kategorie (Standard: Sonstiges) |
| \`@2026-08-10\`, \`@heute\`, \`@morgen\` | Fälligkeits- bzw. Termindatum |
| \`14:30\` oder \`14:30-15:30\` | macht die Zeile zu einem Termin |
| \`!07:00\` | Erinnerungszeit |
| \`ort:…\` | Ort eines Termins (bis Zeilenende) |
| \`täglich\`, \`montags\`…\`sonntags\` | wiederkehrende Aufgabe |
| \`monatlich\`, \`alle 14 tage\` | nur für Ziele |
| \`Ziel:\` am Zeilenanfang | legt ein Ziel statt einer Aufgabe an |
| \`>\` | trennt Teilschritte eines Ziels |
| \`bis:2026-12-31\` | Zieldatum eines Ziels |

## Offen

${ARCHIVE_HEADING}
`
