import { isPermissionGranted, requestPermission, sendNotification as tauriSendNotification } from '@tauri-apps/plugin-notification';

export async function sendNotification(title: string, body: string, icon?: string): Promise<boolean> {
  const isTauri = !!(window as any).__TAURI_INTERNALS__;
  
  if (isTauri) {
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
      if (permissionGranted) {
        tauriSendNotification({ title, body, icon: icon || 'app-icon' });
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Tauri Notification failed, falling back to browser.", err);
    }
  }

  // Fallback to web Notification API
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon });
      return true;
    } else if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        new Notification(title, { body, icon });
        return true;
      }
    }
  }

  return false;
}
