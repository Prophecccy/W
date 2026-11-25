import { set, get, del } from 'idb-keyval';
import { Wallpapers } from '../types';
import { auth } from '../services/localDb';

const LEGACY_WP_PREFIX = 'wallpaper_';
const channel = new BroadcastChannel('w_channel');

const activeUrls = new Map<string, string>();

function getScopedWallpaperKey(slot: keyof Wallpapers): string {
  const uid = (auth.currentUser?.uid || 'local_user').replace(/[^A-Za-z0-9_-]/g, '_');
  return `wallpaper_${uid}_${slot}`;
}

export async function setLocalWallpaper(slot: keyof Wallpapers, blob: Blob): Promise<string> {
  const key = getScopedWallpaperKey(slot);
  await set(key, blob);

  channel.postMessage({ type: 'WALLPAPER_CHANGED' });
  window.dispatchEvent(new Event('wallpaper-changed'));

  const oldUrl = activeUrls.get(slot);
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
  }

  const url = URL.createObjectURL(blob);
  activeUrls.set(slot, url);
  return url;
}

export async function getLocalWallpaper(slot: keyof Wallpapers): Promise<string | null> {
  const key = getScopedWallpaperKey(slot);
  let blob = await get<Blob>(key);

  if (!blob) {
    const legacyKey = `${LEGACY_WP_PREFIX}${slot}`;
    const legacyBlob = await get<Blob>(legacyKey);
    if (legacyBlob) {
      blob = legacyBlob;
      await set(key, legacyBlob).catch(() => {});
      await del(legacyKey).catch(() => {});
    }
  }

  if (!blob) {
    const oldUrl = activeUrls.get(slot);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      activeUrls.delete(slot);
    }
    return null;
  }

  const oldUrl = activeUrls.get(slot);
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
  }

  const url = URL.createObjectURL(blob);
  activeUrls.set(slot, url);
  return url;
}

export async function removeLocalWallpaper(slot: keyof Wallpapers): Promise<void> {
  const key = getScopedWallpaperKey(slot);
  await del(key);
  await del(`${LEGACY_WP_PREFIX}${slot}`).catch(() => {});

  channel.postMessage({ type: 'WALLPAPER_CHANGED' });
  window.dispatchEvent(new Event('wallpaper-changed'));

  const oldUrl = activeUrls.get(slot);
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
    activeUrls.delete(slot);
  }
}

export async function getAllLocalWallpapers(): Promise<Wallpapers> {
  const desktop = await getLocalWallpaper("desktop");
  const widget = await getLocalWallpaper("widget");
  const mobile = await getLocalWallpaper("mobile");

  return { desktop, widget, mobile };
}
