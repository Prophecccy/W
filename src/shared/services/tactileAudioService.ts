// ─── Tactical Audio Synthesizer Engine ───────────────────────────
// 100% offline, procedural Web Audio API sound design.
// Zero external assets or bandwidth overhead. Generates instantaneous
// mechanical micro-haptics benchmarked from physical hardware switches.

const STORAGE_KEY = "w_tactile_audio";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Check whether tactical audio haptics are enabled by user preference.
 * Defaults to true.
 */
export function isAudioHapticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val !== "false";
  } catch {
    return true;
  }
}

/**
 * Toggle audio haptics user preference.
 */
export function setAudioHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {}
}

/**
 * Attaches a passive interaction listener to unlock the AudioContext
 * on first user gesture (satisfying browser autoplay policies).
 */
export function initAudioOnUserGesture(): void {
  if (typeof window === "undefined") return;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { passive: true, once: true });
  window.addEventListener("keydown", unlock, { passive: true, once: true });
}

/**
 * 1. Mechanical Click
 * Crisp 8ms metallic switch snap. Used for checkboxes, button clicks, and tabs.
 */
export function playMechanicalClick(): void {
  if (!isAudioHapticsEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // High-frequency bandpass noise burst (metallic texture)
    const bufferSize = Math.floor(ctx.sampleRate * 0.008); // 8ms
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3200, now);
    filter.Q.setValueAtTime(2.5, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + 0.008);

    // Micro sine tap for tactile body
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.012);

    oscGain.gain.setValueAtTime(0.14, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.012);
  } catch {
    // Non-critical, fail silently
  }
}

/**
 * 2. Subtle Thud
 * 16ms low-frequency pulse. Used for deletions, modal dismissals, or cancellations.
 */
export function playSubtleThud(): void {
  if (!isAudioHapticsEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.024);

    oscGain.gain.setValueAtTime(0.18, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.024);
  } catch {}
}

/**
 * 3. Lock Latch
 * 35ms dual-detent mechanical latch. Used when Lockdown mode engages or clears.
 */
export function playLockLatch(): void {
  if (!isAudioHapticsEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Detent 1 (initial strike)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "square";
    osc1.frequency.setValueAtTime(600, now);
    osc1.frequency.exponentialRampToValueAtTime(150, now + 0.015);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.015);

    // Detent 2 (heavy lock home)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(220, now + 0.018);
    osc2.frequency.exponentialRampToValueAtTime(50, now + 0.04);
    gain2.gain.setValueAtTime(0.2, now + 0.018);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.018);
    osc2.stop(now + 0.04);
  } catch {}
}

/**
 * 4. Milestone Harmonic Chirp
 * 75ms dual-tone chime. Used for streak level-ups, streak milestones, and penance completed.
 */
export function playMilestoneChirp(): void {
  if (!isAudioHapticsEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [880, 1320]; // A5 -> E6 harmonic
    freqs.forEach((freq, idx) => {
      const delay = idx * 0.035;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.05);
    });
  } catch {}
}

/**
 * Backwards compatibility alias for habit completion
 */
export function playCompletionSound(): void {
  playMechanicalClick();
}

let activeHoldOsc: OscillatorNode | null = null;
let activeHoldGain: GainNode | null = null;

/**
 * 5. Physical Hold Hum
 * Sub-bass frequency ramp (60Hz -> 130Hz) building tactile tension during a physical hold gesture.
 */
export function playHoldHum(): void {
  if (!isAudioHapticsEnabled()) return;
  try {
    stopHoldHum();
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.5);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    activeHoldOsc = osc;
    activeHoldGain = gain;
  } catch {}
}

/**
 * Stop Physical Hold Hum with a gentle 15ms release ramp to prevent audio popping.
 */
export function stopHoldHum(): void {
  try {
    if (activeHoldOsc && activeHoldGain) {
      const ctx = getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        activeHoldGain.gain.cancelScheduledValues(now);
        activeHoldGain.gain.setValueAtTime(activeHoldGain.gain.value, now);
        activeHoldGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
        activeHoldOsc.stop(now + 0.016);
      } else {
        activeHoldOsc.stop();
      }
    }
  } catch {} finally {
    activeHoldOsc = null;
    activeHoldGain = null;
  }
}
