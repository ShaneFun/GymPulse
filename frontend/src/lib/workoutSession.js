// Persists an in-progress workout so it survives the page going away.
//
// Switching tabs inside the app already keeps a session alive — App keeps the
// Workout tab mounted and merely hidden. What this covers is the page
// actually reloading: a refresh, or iOS discarding the tab while you were off
// reading something else. Without it, walking back to the app mid-workout
// loses every set you had logged.
//
// localStorage rather than the server: this is a few hundred bytes of
// scratch state that only matters on the device you are training with, and it
// has to be readable before the first network call returns.

const KEY_PREFIX = 'gympulse:session:';

// Bumped if the snapshot shape changes, so an old one is ignored rather than
// restored into fields that no longer mean the same thing.
const VERSION = 1;

// Past this, it is not a workout you stepped away from — it is yesterday's.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

const keyFor = (userId) => `${KEY_PREFIX}${userId}`;

export function loadSession(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (snapshot?.v !== VERSION) return null;
    if (Date.now() - (snapshot.updatedAt ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(userId));
      return null;
    }
    return snapshot;
  } catch {
    // Private mode, a quota error, or corrupt JSON. A lost resume is a
    // nuisance; a crash on load is not acceptable.
    return null;
  }
}

export function saveSession(userId, { planId, exerciseIndex, currentSet, completedByExercise }) {
  if (!userId) return;
  try {
    // Keep the original start time across every rewrite, so "started 20
    // minutes ago" measures the workout and not the last set.
    const startedAt = loadSession(userId)?.startedAt ?? Date.now();
    localStorage.setItem(keyFor(userId), JSON.stringify({
      v: VERSION,
      planId,
      exerciseIndex,
      currentSet,
      completedByExercise,
      startedAt,
      updatedAt: Date.now(),
    }));
  } catch {
    // Out of quota or storage disabled — the workout carries on regardless.
  }
}

export function clearSession(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // Nothing to do; the snapshot will expire on its own.
  }
}

/**
 * The plan a snapshot belongs to, or null if it can no longer be resumed.
 *
 * A plan can be edited or deleted between putting the phone down and picking
 * it up. A snapshot whose exercise count no longer matches would restore rep
 * counts against the wrong exercises, so it is dropped rather than guessed at.
 */
export function resumablePlan(snapshot, plans) {
  if (!snapshot) return null;
  const plan = plans.find((p) => p.id === snapshot.planId);
  if (!plan) return null;
  if (!Array.isArray(snapshot.completedByExercise)) return null;
  if (snapshot.completedByExercise.length !== plan.exercises.length) return null;
  if (snapshot.exerciseIndex >= plan.exercises.length) return null;
  return plan;
}

/** "just now" / "12 min ago" / "2 h ago" — enough to judge whether to carry on. */
export function timeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}
