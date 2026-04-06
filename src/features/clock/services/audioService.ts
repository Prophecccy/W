import { convertFileSrc } from '@tauri-apps/api/core';
import { get } from 'idb-keyval';

let currentAudio: HTMLAudioElement | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

export function playAudio(filePath: string, loop: boolean = false) {
  stopAudio();
  
  if (filePath.startsWith('idb://')) {
    // Browser fallback path using IndexedDB
    const key = filePath.replace('idb://', '');
    get(key).then(blob => {
      if (!blob) {
         console.error("Audio blob not found in idb cache:", key);
         return;
      }
      const assetUrl = URL.createObjectURL(blob);
      currentAudio = new Audio(assetUrl);
      currentAudio.loop = loop;
      // Note: Object URL memory starts accumulating, but this is minor for small sounds. 
      // It will be garbage collected eventually or revokable if tracked.
      currentAudio.play().catch(err => {
        console.error("Browser IDB Audio playback failed:", err);
      });
    }).catch(err => console.error("IDB keyval get failed:", err));
    return;
  }
  
  try {
    let assetUrl = filePath;
    // Only convert via Tauri if we're actually in Tauri, otherwise use raw path (e.g., standard web URLs)
    if (isTauri() && !filePath.startsWith('http') && !filePath.startsWith('data:')) {
      assetUrl = convertFileSrc(filePath);
    }
    
    currentAudio = new Audio(assetUrl);
    currentAudio.loop = loop;
    currentAudio.play().catch(err => {
      console.error("Audio playback failed:", err);
    });
  } catch (err) {
    console.error("Failed to convert file src or play audio:", err);
  }
}

export function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

export function isAudioPlaying() {
  return currentAudio !== null && !currentAudio.paused;
}
