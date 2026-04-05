// ─── Completion Sound Service ───────────────────────────────────
// Plays a short tick/click sound on habit completion.
// Uses Web Audio API to generate a programmatic click — no external file needed.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Plays a short, satisfying "tick" completion sound.
 * The sound is a very brief noise burst + sine tap — feels like a mechanical click.
 */
export function playCompletionSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // ── Short sine "tap" ─────────────────────────────────────────
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
    oscGain.gain.setValueAtTime(0.15, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);

    // ── Tiny noise burst for "click" texture ─────────────────────
    const bufferSize = Math.floor(ctx.sampleRate * 0.02); // 20ms noise
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.06, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    noiseSource.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start(now);
    noiseSource.stop(now + 0.02);
  } catch {
    // Silently fail — audio is non-critical
  }
}
