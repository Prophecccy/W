/**
 * On-Device Local Speech Recognition using @huggingface/transformers
 * Runs quantized Whisper models client-side with WebGPU/WASM acceleration.
 */

export interface LocalTranscriptionProgress {
  status: "idle" | "loading-runtime" | "downloading-model" | "decoding-audio" | "transcribing" | "ready";
  progress?: number; // 0 to 100
  file?: string;
  message?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPipeline: any = null;
let isPipelineLoading = false;

/**
 * Resamples and converts an audio Blob to a 16kHz mono Float32Array.
 */
export async function decodeAudioBlob(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx({ sampleRate: 16000 });

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    // Extract or mix down to mono Float32Array
    let monoData: Float32Array;
    if (numberOfChannels === 1) {
      monoData = audioBuffer.getChannelData(0);
    } else {
      monoData = new Float32Array(length);
      const ch0 = audioBuffer.getChannelData(0);
      const ch1 = audioBuffer.getChannelData(1);
      for (let i = 0; i < length; i++) {
        monoData[i] = (ch0[i] + ch1[i]) / 2;
      }
    }

    // If audioCtx couldn't force 16kHz, resample manually
    if (sampleRate !== 16000) {
      const ratio = 16000 / sampleRate;
      const targetLength = Math.round(length * ratio);
      const resampled = new Float32Array(targetLength);
      for (let i = 0; i < targetLength; i++) {
        const sourceIndex = i / ratio;
        const indexFloor = Math.floor(sourceIndex);
        const indexCeil = Math.min(indexFloor + 1, length - 1);
        const weight = sourceIndex - indexFloor;
        resampled[i] = (1 - weight) * monoData[indexFloor] + weight * monoData[indexCeil];
      }
      return resampled;
    }

    return monoData;
  } finally {
    if (audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
    }
  }
}

/**
 * Lazy-loads the Whisper pipeline and runs transcription entirely on-device.
 */
export async function transcribeWithLocalWhisper(
  audioBlob: Blob,
  onProgress?: (progress: LocalTranscriptionProgress) => void
): Promise<string> {
  onProgress?.({ status: "loading-runtime", message: "Initializing AI runtime..." });

  // Dynamically import @huggingface/transformers to keep initial bundle tiny
  const { pipeline, env } = await import("@huggingface/transformers");

  // Configure environment for browser client execution
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  if (typeof window !== "undefined" && "caches" in window) {
    env.useBrowserCache = true;
  } else {
    env.useBrowserCache = false;
  }
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false;
  }

  if (!cachedPipeline) {
    if (isPipelineLoading) {
      throw new Error("Local model is already loading. Please wait...");
    }

    isPipelineLoading = true;
    onProgress?.({ status: "downloading-model", progress: 0, message: "Loading local Whisper model..." });

    try {
      // Determine device: attempt WebGPU, fallback automatically to WASM
      let device: "webgpu" | "wasm" = "wasm";
      if (typeof navigator !== "undefined") {
        const gpu = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
        if (gpu && typeof gpu.requestAdapter === "function") {
          try {
            const adapter = await gpu.requestAdapter();
            if (adapter) device = "webgpu";
          } catch {
            device = "wasm";
          }
        }
      }

      cachedPipeline = await pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-tiny.en",
        {
          device,
          dtype: "q8",
          progress_callback: (item: { status: string; progress?: number; file?: string }) => {
            if (item.status === "progress" && typeof item.progress === "number") {
              onProgress?.({
                status: "downloading-model",
                progress: Math.round(item.progress),
                file: item.file,
                message: `Downloading model weights (${Math.round(item.progress)}%)...`,
              });
            }
          },
        }
      );
    } catch (err: unknown) {
      cachedPipeline = null;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("network")) {
        throw new Error("Unable to download local Whisper model. Please check internet connection or switch to Groq mode in Settings.");
      }
      throw new Error(`Failed to load local Whisper: ${msg}`);
    } finally {
      isPipelineLoading = false;
    }
  }

  onProgress?.({ status: "decoding-audio", message: "Processing audio waveform..." });
  const audioData = await decodeAudioBlob(audioBlob);

  onProgress?.({ status: "transcribing", message: "Transcribing on-device..." });
  try {
    const output = await cachedPipeline(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const text = (Array.isArray(output) ? output[0]?.text : output?.text) || "";
    onProgress?.({ status: "ready", message: "Transcription complete." });

    return text.trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Local transcription processing error: ${msg}`);
  }
}
