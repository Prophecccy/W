import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { auth, storage, db } from "../../../shared/config/firebase";
import { Wallpapers } from "../../../shared/types";

// ─── Image Compression ─────────────────────────────────────────
// Resizes images to a max dimension and converts to WebP for faster uploads.
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

// ─── Upload with Progress ───────────────────────────────────────
export type UploadProgressCallback = (progress: number) => void;

export async function uploadWallpaper(
  slot: keyof Wallpapers,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  // 1. Compress before uploading
  const compressed = await compressImage(file);

  // 2. Create storage ref
  const filePath = `users/${user.uid}/wallpapers/${slot}_${Date.now()}.webp`;
  const storageRef = ref(storage, filePath);

  // 3. Upload with progress tracking
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, compressed, {
      contentType: "image/webp",
    });

    task.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        onProgress?.(pct);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          // 4. Update Firestore user doc
          const userRef = doc(db, "users", user.uid);
          await updateDoc(userRef, {
            [`wallpapers.${slot}`]: downloadUrl,
          });
          resolve(downloadUrl);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function removeWallpaper(slot: keyof Wallpapers): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const userRef = doc(db, "users", user.uid);
  await updateDoc(userRef, {
    [`wallpapers.${slot}`]: null,
  });
}
