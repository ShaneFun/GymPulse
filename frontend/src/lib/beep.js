// Audio cues for a workout: spoken counts, with tones as the fallback and for
// non-numeric alerts.
//
// iOS will not produce audio until the page has had a user gesture, so both
// the AudioContext and the speech engine are woken from primeAudio(), which
// callers invoke on a real tap. Doing it on mount instead leaves the context
// suspended and every cue silently dropped.

let ctx = null;
let speechReady = false;

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export function primeAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;

  try {
    // Without this an iPhone's physical silent switch mutes Web Audio
    // outright — the most likely reason a cue "does nothing" on a phone.
    // Safari 16.4+; harmless where unsupported.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* not supported; fall through */ }

  if (AudioCtx) {
    try {
      if (!ctx) ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
  }

  // Speaking an empty utterance inside the gesture unlocks the engine, so the
  // first real count is not swallowed.
  if (synth && !speechReady) {
    try {
      synth.speak(new SpeechSynthesisUtterance(''));
      speechReady = true;
    } catch { /* speech unavailable; tones still work */ }
  }
}

export function beep({ frequency = 880, duration = 0.12 } = {}) {
  if (!ctx) return;

  // A context can fall back to suspended (backgrounding the tab, iOS
  // reclaiming audio). Nudge it and skip this cue rather than throwing.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    return;
  }
  if (ctx.state !== 'running') return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.value = frequency;

    // Ramp rather than switch: an instant start/stop on a sine wave clicks.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Audio is a nicety. It must never take rep counting down with it.
  }
}

/**
 * Say a short cue out loud, falling back to a tone where speech is
 * unavailable. Reps can arrive faster than a phrase takes to speak, so each
 * call cancels whatever is still queued — a count that lags three reps behind
 * is worse than no count at all.
 */
export function say(text, { fallback } = {}) {
  if (!synth) {
    if (fallback) beep(fallback);
    return;
  }

  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.rate = 1.15;   // brisk: these land between reps
    utterance.pitch = 1;
    utterance.volume = 1;
    synth.speak(utterance);
  } catch {
    if (fallback) beep(fallback);
  }
}
