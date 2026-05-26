import { set, get, del } from 'idb-keyval';
import { Wallpapers } from '../types';

/**
 * Prefix for wallpaper keys in IndexedDB to avoid collisions.
 */
const WP_PREFIX = 'wallpaper_';
const channel = new BroadcastChannel('w_channel');

// Static tracking map to hold active Object URLs for each slot, preventing memory leaks
const activeUrls = new Map<string, string>();

/**
 * Save a wallpaper blob to IndexedDB.
 */
export async function setLocalWallpaper(slot: keyof Wallpapers, blob: Blob): Promise<string> {
  const key = `${WP_PREFIX}${slot}`;
  await set(key, blob);
  
  // Notify other windows/tabs
  channel.postMessage({ type: 'WALLPAPER_CHANGED' });
  window.dispatchEvent(new Event('wallpaper-changed'));

  // Revoke previous URL to release it from RAM
  const oldUrl = activeUrls.get(slot);
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
  }

  const url = URL.createObjectURL(blob);
  activeUrls.set(slot, url);
  return url;
}

/**
 * Retrieve a wallpaper from IndexedDB and return as an object URL.
 */
export async function getLocalWallpaper(slot: keyof Wallpapers): Promise<string | null> {
  const key = `${WP_PREFIX}${slot}`;
  const blob = await get<Blob>(key);
  if (!blob) {
    const oldUrl = activeUrls.get(slot);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      activeUrls.delete(slot);
    }
    return null;
  }

  // Revoke previous URL before creating a new one
  const oldUrl = activeUrls.get(slot);
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
  }

  const url = URL.createObjectURL(blob);
  activeUrls.set(slot, url);
  return url;
}

/**
 * Remove a wallpaper from IndexedDB.
 */
export async function removeLocalWallpaper(slot: keyof Wallpapers): Promise<void> {
  const key = `${WP_PREFIX}${slot}`;
  await del(key);
  
  // Notify other windows/tabs
  channel.postMessage({ type: 'WALLPAPER_CHANGED' });
  window.dispatchEvent(new Event('wallpaper-changed'));

  // Revoke active URL
  const oldUrl = activeUrls.get(slot);
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
    activeUrls.delete(slot);
  }
}

/**
 * Helper to fetch all wallpapers at once.
 */
export async function getAllLocalWallpapers(): Promise<Wallpapers> {
  const desktop = await getLocalWallpaper("desktop");
  const widget = await getLocalWallpaper("widget");
  const mobile = await getLocalWallpaper("mobile");
  
  return { desktop, widget, mobile };
}
