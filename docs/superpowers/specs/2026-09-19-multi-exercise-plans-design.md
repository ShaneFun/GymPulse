# Multi-Exercise Plans — Design

## Problem

A plan can only hold one exercise. The create form makes one program with exactly one schedule, and progression only ever adds more *weeks* to that program — never more exercises. A real session is several exercises done back to back, so today the user has to create a separate plan per exercise and start each one by hand.

The Workout tab's plan cards already render a *row* of exercise figures in anticipation of this; nothing can currently produce a plan with more than one.

## Goals

- One plan holds several exercises.
- A single session walks through them: all sets of exercise 1, then exercise 2, and so on.
- Each exercise keeps its own targets, rest and progression increments.
- Each exercise is logged and assessed separately.

## Non-goals

- Circuit ordering (one set of each, repeating). The user chose straight sets; supporting both would roughly double the session state machine.
- Reordering exercises mid-session.
- Any change to rep counting, the voice cues, auth, or the Progress tab.

## Data model

**`schedules` needs no change.** It already holds many rows per program — that is how weeks work. A multi-exercise plan is several rows sharing a `program_id` *and* a `week`. The pair `(program_id, week)` identifies a plan; `exercise_name` distinguishes the exercises within it.

**`programs` gains one column:**

```sql
alter table programs
  add column if not exists exercise_rest_seconds integer not null default 180;

alter table programs
  add constraint programs_exercise_rest_non_negative check (exercise_rest_seconds >= 0);
```

Rest *between sets* stays per-exercise on `schedules.rest_seconds`. Rest *between exercises* is a property of the plan as a whole, so it belongs on `programs`. Existing programs default to 180 seconds.

## Creating a plan

The Plan form becomes: plan name, rest-between-exercises, then a built-up list of exercises. "Add exercise" opens the existing `ExercisePicker`; the chosen exercise gets its own sets, reps, weight, rest-between-sets and progression increments, then appends to the list. Entries can be removed. Submitting creates the whole plan.

**Creation becomes a single backend call.** Today the frontend calls `POST /programs` and then `POST /schedules`; if the second fails, an orphaned program is left behind with no schedules. This is not hypothetical — the user's database currently contains exactly such a row, from this bug. A new endpoint takes the program and all its exercises together:

```
POST /plans
{
  "name": "Push Day",
  "exercise_rest_seconds": 180,
  "exercises": [
    {"exercise_name": "bicep_curl", "target_sets": 3, "target_reps": 10,
     "target_weight": 20, "rest_seconds": 90,
     "weight_increment": 2.5, "rep_increment": 0},
    ...
  ]
}
```

It creates the program, then every schedule at `week = 1`. **If any schedule insert fails it deletes the program it just created and returns an error**, so a failed creation leaves nothing behind. At least one exercise is required.

`POST /programs` and `POST /schedules` remain for now — `/schedules/{id}/advance` still inserts through the same path — but the frontend stops calling them for plan creation.

## Grouping

`loadPlans` currently flattens every schedule into its own entry. It instead groups by `(program_id, week)` into:

```js
{
  programId, programName, week,
  exerciseRestSeconds,
  exercises: [ <schedule row>, ... ],   // ordered by created_at
}
```

A plan's identity in the UI becomes `${programId}-${week}` rather than a schedule id. Plan cards render one `ExerciseFigure` per entry in `exercises` — the markup already loops.

Single-exercise plans are just plans whose `exercises` has length one, so nothing needs a special case.

## Running a session

The session state gains an **exercise index** alongside the existing set index. `selectedPlan.exercises[exerciseIndex]` is the exercise in play, and supplies the camera's `exerciseLocked`, the target reps, and the rest between sets.

```
ex1 set1 → rest → ex1 set2 → rest → ex1 set3
         → EXERCISE REST → lead-in → ex2 set1 → rest → … → done
```

- Finishing a set that is **not** the exercise's last: rest for that exercise's `rest_seconds`, as now.
- Finishing an exercise's **last** set, with exercises remaining: rest for the plan's `exercise_rest_seconds`, then advance the exercise index and reset the set index.
- Finishing the **last set of the last exercise**: the session is done.

The existing tap-gated lead-in is unchanged and applies to both rest kinds. The rest screen names what is coming — "Up next · Bicep Curl, set 1 of 3" — since with several exercises "Set 1" alone is ambiguous.

Completed reps accumulate per exercise: `completedSets` becomes a map or array indexed by exercise rather than a flat list.

## Logging

One `workout_log` per exercise, each against its own `schedule_id`, all posted when the workout finishes. Each carries that exercise's `actual_reps` and `actual_weight`, so the existing PASS/FAIL logic applies per exercise unchanged.

If some logs succeed and others fail, the Done screen reports which failed and offers a retry for those only, rather than silently losing them or double-posting the ones that landed.

## Progression

PASS/FAIL is per exercise, so a plan can pass one exercise and fail another. Progression is therefore **offered per exercise**: the Done screen lists each exercise with its result, and confirming advances only those that passed *and* have a nonzero increment.

Advancing calls the existing `POST /schedules/{id}/advance` once per qualifying exercise. That endpoint is already idempotent and keys on `(program_id, week, exercise_name)`, so it handles several exercises in the same program and week correctly without modification, and a partial retry cannot duplicate rows.

An exercise that fails stays at its current week, so a plan's exercises can drift onto different weeks. That is a real consequence and is accepted: it reflects what actually happened in training, and `(program_id, week)` grouping will then show them as separate plan cards. The alternative — holding every exercise back to the slowest — would punish progress on the others.

## Testing

Backend (pytest against the in-memory fake, 29 tests currently passing and must stay green):

- `POST /plans` creates a program and one schedule per exercise, all at week 1.
- `POST /plans` with a failing schedule insert deletes the program and returns an error, leaving nothing behind.
- `POST /plans` rejects an empty exercise list.
- `exercise_rest_seconds` defaults to 180 and rejects negatives.
- Advancing two exercises in the same program and week produces two week-2 rows, one per exercise.

Frontend verification is manual, as there is no test framework and adding one stays out of scope: build a two-exercise plan, run it end to end, confirm the exercise rest appears between exercises, both exercises are logged, and per-exercise progression offers only the exercises that passed.

## Risk

The session state machine is the riskiest part: it currently has five states and gains a second index that every transition must respect. An off-by-one there either skips an exercise or repeats one, and neither is caught by the backend tests. The manual run-through is the real check.
