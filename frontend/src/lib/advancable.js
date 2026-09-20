// Which per-exercise outcomes (from finishWorkout, shaped as
// [{ exercise, reps, logged, passed }]) are eligible to progress to next
// week: logged, passed, and with something to actually change. An exercise
// that failed stays on its current week even when its siblings advance.
//
// Kept in one place because it is checked from three call sites (App's
// finishWorkout and confirmProgression, WorkoutTab's Done screen) that must
// agree on the same set of outcomes or the confirm button and the summary it
// confirms can silently drift apart.
export const isAdvancable = (outcome) =>
  outcome.logged && outcome.passed &&
  ((outcome.exercise.weight_increment || 0) > 0 || (outcome.exercise.rep_increment || 0) > 0);
