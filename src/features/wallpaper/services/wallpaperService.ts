import { Wallpapers } from "../../../shared/types";
import { setLocalWallpaper, removeLocalWallpaper } from "../../../shared/utils/storageUtils";

// ─── Image Compression ─────────────────────────────────────────
// Resizes images to a max dimension and converts to WebP for faster local loading.
function compressImage(file: File, maxDim = 1920, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/webp",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

// ─── Local Storage Upload ───────────────────────────────────────
export async function uploadWallpaper(
  slot: keyof Wallpapers,
  file: File
): Promise<string> {
  // 1. Compress image to WebP before saving
  const compressed = await compressImage(file);

  // 2. Save directly to IndexedDb (Local Cache)
  const objectUrl = await setLocalWallpaper(slot, compressed);
  
  // 3. Return the exact object URL so it renders instantly
  return objectUrl;
}

export async function removeWallpaper(slot: keyof Wallpapers): Promise<void> {
  await removeLocalWallpaper(slot);
}
