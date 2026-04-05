import { convertFileSrc } from '@tauri-apps/api/core';

let currentAudio: HTMLAudioElement | null = null;

export function playAudio(filePath: string, loop: boolean = false) {
  stopAudio();
  
  try {
    const assetUrl = convertFileSrc(filePath);
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
