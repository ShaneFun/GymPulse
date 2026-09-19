// Short tones for the last few reps of a set, via the Web Audio API — no
// audio files, no dependencies.
//
// iOS will not play audio until the page has had a user gesture, so the
// context is created and resumed from primeAudio(), which callers invoke on a
// real tap (starting a workout). Creating it on mount instead would leave the
// context suspended and every beep silently dropped.

let ctx = null;

export function primeAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    // Without this an iPhone's physical silent switch mutes Web Audio
    // entirely — the most likely reason a beep "does nothing" on a phone.
    // Safari 16.4+; harmless where unsupported.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* not supported; fall through */ }

  try {
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

export function beep({ frequency = 880, duration = 0.12 } = {}) {
  if (!ctx) return;

  // A context can fall back to suspended (backgrounding the tab, iOS
  // reclaiming audio). Nudge it and skip this tone rather than throwing.
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
