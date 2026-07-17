export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export function getNotificationPermission(): PermissionState {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!('Notification' in window)) return 'unsupported'
  const result = await Notification.requestPermission()
  return result
}
