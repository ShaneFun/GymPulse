// Grouping and grading of workout history for the Progress calendar.
//
// Everything here is derived from the logs the app already fetches — no extra
// request, no stored state. Keeping it out of the component makes the rules
// (what counts as a personal best, what grades a day) readable on their own.

// Local calendar day, not UTC: a 9pm session in London must land on the day
// the user actually trained, which toISOString() would get wrong.
export function dayKey(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const totalReps = (log) => (log.actual_reps || []).reduce((a, b) => a + b, 0);

/**
 * Marks each log that beat every earlier log of the same exercise.
 *
 * Weight is the measure where there is one; for bodyweight exercises it is
 * always 0, so total reps stands in. Ties do not count — a personal best has
 * to be a new best, or every repeat session would claim one.
 *
 * Returns a Set of log ids.
 */
export function personalBestLogIds(history) {
  const chronological = [...history].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const bestSoFar = new Map();   // exercise -> { weight, reps }
  const ids = new Set();

  for (const log of chronological) {
    const name = log.exercise_name;
    if (!name) continue;

    const weight = log.actual_weight || 0;
    const reps = totalReps(log);
    const best = bestSoFar.get(name);

    const isBest = !best
      ? (weight > 0 || reps > 0)          // the first real session is not a PB against nothing
      : weight > 0
        ? weight > best.weight
        : reps > best.reps;

    if (best && isBest) ids.add(log.id);

    if (!best || weight > best.weight || reps > best.reps) {
      bestSoFar.set(name, {
        weight: Math.max(weight, best?.weight ?? 0),
        reps: Math.max(reps, best?.reps ?? 0),
      });
    }
  }

  return ids;
}

/**
 * One entry per day that has at least one log:
 *   { key, date, logs, state }
 *
 * state is 'pb' | 'pass' | 'mixed' | 'fail', in that order of precedence — a
 * day containing a personal best reads as a PB day even if something else
 * that day missed its target, because the best thing you did is the thing
 * worth seeing on a calendar.
 */
export function groupByDay(history) {
  const pbIds = personalBestLogIds(history);
  const days = new Map();

  for (const log of history) {
    if (!log.created_at) continue;
    const key = dayKey(log.created_at);
    if (!days.has(key)) days.set(key, { key, date: new Date(log.created_at), logs: [] });
    days.get(key).logs.push({ ...log, isPersonalBest: pbIds.has(log.id) });
  }

  for (const day of days.values()) {
    const passed = day.logs.filter(l => l.status === 'PASS').length;
    if (day.logs.some(l => l.isPersonalBest)) day.state = 'pb';
    else if (passed === day.logs.length) day.state = 'pass';
    else if (passed > 0) day.state = 'mixed';
    else day.state = 'fail';
  }

  return days;
}

/**
 * The cells of a month grid, Monday-first, padded so the first and last weeks
 * are complete. Padding cells carry inMonth: false so they can be dimmed
 * rather than omitted, which would break the column alignment.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-first; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date, key: dayKey(date), inMonth: date.getMonth() === month });
    // Stop after a complete week once the month is behind us, so a short
    // month does not render two empty trailing rows.
    if (i >= 27 && (i + 1) % 7 === 0 && date.getMonth() !== month) break;
  }
  return cells;
}
