import { useState, useRef, useCallback, useEffect } from "react";

export interface AudioRecorderState {
  isRecording: boolean;
  durationSec: number;
  error: string | null;
  isSupported: boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSupported = typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!isSupported) {
      setError("Audio recording is not supported in this environment.");
      return false;
    }

    try {
      cleanupStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Determine supported mime type
      let mimeType = "";
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      for (const cand of candidates) {
        if (MediaRecorder.isTypeSupported(cand)) {
          mimeType = cand;
          break;
        }
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setDurationSec(0);

      timerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);

      return true;
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes("Permission") || errMessage.includes("NotAllowedError")) {
        setError("Microphone permission denied. Enable microphone access in settings.");
      } else {
        setError(`Failed to access microphone: ${errMessage}`);
      }
      cleanupStream();
      setIsRecording(false);
      return false;
    }
  }, [isSupported, cleanupStream]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanupStream();
        setIsRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        cleanupStream();
        setIsRecording(false);
        mediaRecorderRef.current = null;
        resolve(audioBlob);
      };

      recorder.stop();
    });
  }, [cleanupStream]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    cleanupStream();
    setIsRecording(false);
    setDurationSec(0);
  }, [cleanupStream]);

  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    isRecording,
    durationSec,
    error,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
