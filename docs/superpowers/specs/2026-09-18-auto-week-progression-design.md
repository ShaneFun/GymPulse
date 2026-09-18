# Auto Week Progression — Design

## Problem

The backend already computes a PASS/FAIL verdict and a recommendation string ("Move to next week's workout" / "Repeat the current week") in `/analysis/{schedule_id}`, but nothing acts on it. Progressing to the next week currently requires the user to manually create a brand-new plan by hand, re-entering the exercise, sets, reps, and weight.

## Goals

- On a PASS, offer to auto-create next week's schedule with an increased target, without requiring the user to retype anything.
- Let the user control the size of the increase per plan (some exercises progress by weight, some by reps, some by both).
- On a FAIL, or when there's nothing to progress by, change nothing about current behavior.
- Never create duplicate schedules for a week that already exists.

## Data model

Add two nullable columns to the existing `schedules` table in Supabase (no migration tooling in this repo — added directly via the Supabase dashboard):

- `weight_increment` (float, default `0`)
- `rep_increment` (int, default `0`)

Existing rows default to `0`, so old plans behave exactly as before (no progression prompt, since both increments are 0).

## Backend changes (`backend/app/main.py`)

1. `ScheduleCreate` gains two fields:
   ```python
   weight_increment: float = 0
   rep_increment: int = 0
   ```
   Both are stored on insert in `create_schedule`.

2. New endpoint:
   ```
   POST /schedules/{schedule_id}/advance
   ```
   Logic:
   - Fetch the schedule by `schedule_id`. 404 if not found.
   - Compute `next_week = schedule.week + 1`.
   - Query `schedules` for a row with the same `program_id` and `week == next_week`. If found, return it as-is (idempotent — no duplicate created).
   - Otherwise, insert a new schedule row:
     - `program_id`, `exercise_name`, `week = next_week` — carried over
     - `target_sets = schedule.target_sets` — unchanged
     - `target_weight = schedule.target_weight + schedule.weight_increment`
     - `target_reps = schedule.target_reps + schedule.rep_increment`
     - `weight_increment = schedule.weight_increment`, `rep_increment = schedule.rep_increment` — carried forward so the chain can keep progressing week over week
   - Return `{"message": "...", "data": <new_or_existing_schedule>}`.

3. `get_workout_analysis` (PASS/FAIL logic) is unchanged.

## Frontend changes

**API client** (`frontend/src/api/client.js`): add
```js
advanceSchedule: (scheduleId) => apiClient.post(`/schedules/${scheduleId}/advance`),
```

**Plan creation form** (`frontend/src/App.jsx`, Plan tab): add two optional numeric inputs, both defaulting to `0`:
- "Weight increase on pass (kg)"
- "Rep increase on pass"

These are sent as `weight_increment` / `rep_increment` in `createSchedule`.

**Counter tab — Done screen**: after `finishWorkout` saves the log via `logWorkout`, inspect the response's `status_calculated`:

- **FAIL** — no change from current behavior. Recommendation text stays as-is.
- **PASS**, both increments are `0` — show a plain "Passed!" banner, no progression prompt (nothing to progress to).
- **PASS**, at least one increment is nonzero — show a confirmation banner:
  > "You passed! Advance to Week {n+1} at {target_weight}kg × {target_reps} reps?"
  with two buttons:
  - **Confirm** — calls `advanceSchedule(selectedPlan.id)`, then refreshes plans (`loadPlans`) so the new schedule appears in the Plan tab.
  - **Skip** — dismisses the banner, no schedule created (user can always progress manually, or catch it after their next PASS on the same plan since `/advance` is idempotent).

## Testing

- **Backend**: unit tests for `/schedules/{id}/advance` covering: (a) creates a new week+1 schedule with correct weight/rep increments applied, (b) returns the existing schedule without duplicating when week+1 already exists, (c) works when only one of the two increments is nonzero.
- **Frontend**: manual verification — create a plan with nonzero increments, complete a passing workout, confirm the banner appears with the correct next-week numbers, confirm advancing creates the new plan and it shows up in the Plan tab. Repeat with both increments at 0 to confirm no prompt appears. Repeat with a FAIL to confirm no change in behavior.
