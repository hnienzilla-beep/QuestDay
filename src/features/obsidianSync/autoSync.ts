import { getSyncSettings } from './settings'
import { runSyncQuiet } from './runSync'

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Löst nach kurzer Verzögerung (Debounce) einen automatischen Sync aus, falls eingerichtet. */
export function triggerAutoSync(): void {
  if (!getSyncSettings()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    runSyncQuiet()
  }, 3000)
}
