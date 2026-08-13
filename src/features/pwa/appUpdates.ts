import { registerSW } from 'virtual:pwa-register'

/**
 * Hält die installierte App auf dem aktuellen Stand.
 *
 * Ein Homescreen-PWA prüft von sich aus nur bei einem echten Seitenladen, ob es eine neue
 * Fassung gibt. Wer die App nur in den Hintergrund schiebt und wieder hervorholt, löst das
 * nicht aus - die App kann dadurch beliebig lange auf einem alten Stand laufen, ohne dass
 * es jemandem auffällt.
 *
 * Deshalb wird hier zusätzlich beim Zurückkehren in den Vordergrund und stündlich
 * nachgefragt. Findet sich eine neue Fassung, übernimmt `registerType: 'autoUpdate'`
 * (siehe vite.config.ts) den Rest und lädt die Seite selbst neu.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function registerAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        // Offline liefe die Prüfung nur in einen Fehler; der nächste Anlauf kommt ohnehin.
        if (navigator.onLine === false) return
        registration.update().catch(() => {
          // Ein fehlgeschlagener Versuch ist folgenlos - der nächste greift.
        })
      }

      window.setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
  })
}
