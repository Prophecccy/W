import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { auth, storage, db } from "../../../shared/config/firebase";
import { Wallpapers } from "../../../shared/types";

export async function uploadWallpaper(slot: keyof Wallpapers, file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  // Store in users/{uid}/wallpapers/{slot}_{timestamp}.webp (we keep original extension for now)
  const ext = file.name.split('.').pop() || 'tmp';
  const filePath = `users/${user.uid}/wallpapers/${slot}_${Date.now()}.${ext}`;
  const storageRef = ref(storage, filePath);

  // Upload to Firebase Storage
  await uploadBytes(storageRef, file);
  
  // Get download URL
  const downloadUrl = await getDownloadURL(storageRef);

  // Update Firestore User doc
  const userRef = doc(db, "users", user.uid);
  await updateDoc(userRef, {
    [`wallpapers.${slot}`]: downloadUrl
  });

  return downloadUrl;
}

export async function removeWallpaper(slot: keyof Wallpapers): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  // We simply clear it from the Firestore doc. 
  // We ideally would delete the file from storage too, but finding the exact file path 
  // requires parsing the download URL or tracking it in the db. 
  // Since wallpapers are small, just clearing the reference is fine for now, 
  // or we can overwrite it when a new one is uploaded.

  const userRef = doc(db, "users", user.uid);
  await updateDoc(userRef, {
    [`wallpapers.${slot}`]: null
  });
}
