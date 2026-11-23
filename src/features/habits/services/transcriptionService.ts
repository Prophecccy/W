/**
 * Unified Speech-to-Text Router Service
 * Routes dictation audio to either Groq Cloud or Local On-Device Whisper
 * based on user preference and configuration.
 */

import { transcribeWithGroq } from "./groqTranscription";
import { transcribeWithLocalWhisper, LocalTranscriptionProgress } from "./whisperLocal";

export type TranscriptionMode = "local" | "groq";

export interface TranscribeRequest {
  audioBlob: Blob;
  mode: TranscriptionMode;
  groqApiKey?: string;
  onProgress?: (progress: LocalTranscriptionProgress) => void;
}

export interface TranscribeResult {
  text: string;
  source: TranscriptionMode;
}

/**
 * Normalizes and formats raw transcriptions for clean insertion into notes.
 */
export function formatTranscribedText(rawText: string, currentNoteLength: number, maxChars: number): string {
  let cleaned = rawText.trim();
  if (!cleaned) return "";

  // Capitalize first letter if not already capitalized
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  // Check remaining capacity in note
  const availableChars = Math.max(0, maxChars - currentNoteLength);
  if (cleaned.length > availableChars) {
    cleaned = cleaned.slice(0, availableChars).trim();
  }

  return cleaned;
}

/**
 * Transcribes an audio recording using the requested mode.
 */
export async function transcribeAudio(request: TranscribeRequest): Promise<TranscribeResult> {
  const { audioBlob, mode, groqApiKey, onProgress } = request;

  if (mode === "groq") {
    if (!groqApiKey || !groqApiKey.trim()) {
      throw new Error("Groq API key not found. Add your key in Settings or switch to Local mode.");
    }
    const text = await transcribeWithGroq(audioBlob, { apiKey: groqApiKey });
    return { text, source: "groq" };
  }

  // Local on-device mode
  const text = await transcribeWithLocalWhisper(audioBlob, onProgress);
  return { text, source: "local" };
}
