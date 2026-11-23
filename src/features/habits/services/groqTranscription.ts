/**
 * Groq Whisper Cloud Transcription Service
 * Uses Groq's high-speed Whisper Large v3 endpoint for instant dictation.
 */

export interface GroqTranscriptionOptions {
  apiKey: string;
  language?: string;
  prompt?: string;
}

export async function transcribeWithGroq(
  audioBlob: Blob,
  options: GroqTranscriptionOptions
): Promise<string> {
  const { apiKey, language, prompt } = options;

  if (!apiKey || !apiKey.trim()) {
    throw new Error("Groq API key is missing. Add your key in Settings -> Data & System.");
  }

  const formData = new FormData();
  // Name the file based on mime type or default to webm
  const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";
  formData.append("file", audioBlob, `recording.${extension}`);
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "json");
  formData.append("temperature", "0");

  if (language) {
    formData.append("language", language);
  }
  if (prompt) {
    formData.append("prompt", prompt);
  }

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || response.statusText;
    } catch {
      errorDetail = await response.text();
    }

    if (response.status === 401) {
      throw new Error("Invalid Groq API key. Please check your key in Settings.");
    }
    if (response.status === 429) {
      throw new Error("Groq rate limit exceeded. Please wait a moment and try again.");
    }
    throw new Error(`Groq transcription failed (${response.status}): ${errorDetail}`);
  }

  const data = await response.json();
  return (data.text || "").trim();
}

/**
 * Validates a Groq API key by querying the available models.
 */
export async function testGroqApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, error: "API key is required." };
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    });

    if (res.ok) {
      return { valid: true };
    }

    if (res.status === 401) {
      return { valid: false, error: "Invalid API key." };
    }
    return { valid: false, error: `Verification failed with HTTP ${res.status}.` };
  } catch (err: unknown) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Network error verifying API key.",
    };
  }
}
