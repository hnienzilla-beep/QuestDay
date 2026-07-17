import { useState } from 'react'
import './NotificationPermissionBanner.css'
import { getNotificationPermission, requestNotificationPermission } from './permission'

export default function NotificationPermissionBanner() {
  const [status, setStatus] = useState(getNotificationPermission())

  if (status !== 'default') return null

  const handleEnable = async () => {
    const result = await requestNotificationPermission()
    setStatus(result)
  }

  return (
    <div className="reminder-banner">
      <p>Aktiviere Erinnerungen, damit QuestDay dich rechtzeitig benachrichtigt.</p>
      <button type="button" className="btn btn-primary" onClick={handleEnable}>
        Aktivieren
      </button>
    </div>
  )
}
