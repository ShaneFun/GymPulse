# Multi-Exercise Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one plan hold several exercises, and have a single workout session walk through them — all sets of exercise 1, then exercise 2, and so on — logging and progressing each exercise separately.

**Architecture:** No new table. A multi-exercise plan is several `schedules` rows sharing a `program_id` and `week`; `(program_id, week)` becomes a plan's identity in the UI. A new `POST /plans` creates the program and all its exercises in one call, deleting the program if any exercise fails so a botched create leaves nothing behind. The session state machine gains an exercise index alongside its set index.

**Tech Stack:** FastAPI + Supabase (Python 3.11, venv at repo root), React 19 + Vite + axios, pytest with an in-memory Supabase fake.

**Spec:** `docs/superpowers/specs/2026-09-19-multi-exercise-plans-design.md`

## Global Constraints

- **The database migration is already applied.** `programs.exercise_rest_seconds` (default 180) and `schedules.rest_seconds` (default 90) both exist, verified against the live database. No task needs to touch the schema.
- Backend commands use the venv by relative path from a worktree root: `../../venv/Scripts/python.exe`. Frontend commands run from `frontend/`.
- **Backend test baseline: 29 tests pass** and must stay green throughout.
- **Lint baseline: 5 errors and 1 warning, all pre-existing** (`AICameraCounter.jsx`: setState-in-effect, use-before-declare ×2, exhaustive-deps warning; `App.jsx`: use-before-declare ×2). Do NOT fix them. Success criterion: no NEW entries. The count may drop; it must never rise.
- This eslint config **errors on `const` arrow functions referenced before their declaration**, and rejects both mutating `ref.current` during render and calling setState synchronously inside an effect.
- **Zero inline styles in JSX** — this codebase has none and must keep none.
- Reuse the design system in `frontend/src/index.css`; add classes there following its comment-banner conventions.
- Do NOT change rep counting, the voice cues (`frontend/src/lib/beep.js`), auth, or the Progress tab.
- Every endpoint takes `db: Client = Depends(get_supabase)` and, where it needs ownership, `user_id: str = Depends(get_user_id)`. Match the existing try/except idiom in `main.py`.

---

### Task 1: `POST /plans` — create a whole plan atomically

**Files:**
- Modify: `backend/app/main.py`, `backend/tests/conftest.py`
- Create: `backend/tests/test_plans.py`

**Interfaces:**
- Consumes: `get_supabase`, `get_user_id` (already in `main.py`).
- Produces: `POST /plans` returning `{"message": str, "data": {"program": {...}, "schedules": [...]}}`. `FakeTable.delete()` on the test fake.

- [ ] **Step 1: Give the test fake a delete**

`FakeTable` in `backend/tests/conftest.py` has `select`, `insert`, `upsert` and `update` but no `delete`, and the cleanup path needs one. Add this class beside `FakeUpdate`:

```python
class FakeDelete:
    """Mimics .delete().eq(col, val).execute()."""

    def __init__(self, table):
        self._table = table
        self._filters = []

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def execute(self):
        removed = [
            r for r in self._table.rows
            if all(str(r.get(c)) == str(v) for c, v in self._filters)
        ]
        self._table.rows = [r for r in self._table.rows if r not in removed]
        return FakeResponse(removed)
```

and this method on `FakeTable`:

```python
    def delete(self):
        return FakeDelete(self)
```

Also add a bullet to the module docstring's fidelity-gap list noting that the fake has no foreign keys, so deleting a program does not cascade to its schedules the way Postgres would.

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_plans.py`:

```python
from conftest import TEST_USER_ID

PLAN = {
    "name": "Push Day",
    "exercise_rest_seconds": 150,
    "exercises": [
        {
            "exercise_name": "bicep_curl", "target_sets": 3, "target_reps": 10,
            "target_weight": 20.0, "rest_seconds": 90,
            "weight_increment": 2.5, "rep_increment": 0,
        },
        {
            "exercise_name": "overhead_press", "target_sets": 4, "target_reps": 8,
            "target_weight": 30.0, "rest_seconds": 120,
            "weight_increment": 0, "rep_increment": 1,
        },
    ],
}


def test_create_plan_makes_a_program_and_one_schedule_per_exercise(client, fake_db):
    response = client.post("/plans", json=PLAN)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["program"]["name"] == "Push Day"
    assert data["program"]["user_id"] == TEST_USER_ID
    assert data["program"]["exercise_rest_seconds"] == 150
    assert len(data["schedules"]) == 2
    assert len(fake_db.table("programs").rows) == 1
    assert len(fake_db.table("schedules").rows) == 2


def test_create_plan_puts_every_exercise_on_week_one(client, fake_db):
    client.post("/plans", json=PLAN)

    weeks = {s["week"] for s in fake_db.table("schedules").rows}
    assert weeks == {1}


def test_create_plan_keeps_each_exercises_own_settings(client, fake_db):
    client.post("/plans", json=PLAN)

    rows = {s["exercise_name"]: s for s in fake_db.table("schedules").rows}
    assert rows["bicep_curl"]["rest_seconds"] == 90
    assert rows["bicep_curl"]["weight_increment"] == 2.5
    assert rows["overhead_press"]["rest_seconds"] == 120
    assert rows["overhead_press"]["rep_increment"] == 1


def test_create_plan_links_every_schedule_to_the_new_program(client, fake_db):
    client.post("/plans", json=PLAN)

    program_id = fake_db.table("programs").rows[0]["id"]
    assert all(s["program_id"] == program_id for s in fake_db.table("schedules").rows)


def test_create_plan_rejects_an_empty_exercise_list(client, fake_db):
    response = client.post("/plans", json={"name": "Empty", "exercises": []})

    assert response.status_code == 422
    assert fake_db.table("programs").rows == []


def test_create_plan_removes_the_program_if_an_exercise_fails(client, fake_db, monkeypatch):
    """A half-built plan is worse than none: the program must not survive."""
    original_table = fake_db.table

    def explode_on_schedule_insert(name):
        table = original_table(name)
        if name == "schedules":
            def boom(_row):
                raise RuntimeError("insert failed")
            table.insert = boom
        return table

    monkeypatch.setattr(fake_db, "table", explode_on_schedule_insert)

    response = client.post("/plans", json=PLAN)

    assert response.status_code >= 400
    assert original_table("programs").rows == []
```

- [ ] **Step 3: Run them and watch them fail**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests/test_plans.py -v`

Expected: all six FAIL with 404 — the route does not exist yet.

- [ ] **Step 4: Add the models**

In `backend/app/main.py`, beside the other models:

```python
class PlanExerciseCreate(BaseModel):
    exercise_name: str
    target_weight: float
    target_sets: int
    target_reps: int
    rest_seconds: int = Field(default=90, ge=0)
    weight_increment: float = Field(default=0, ge=0)
    rep_increment: int = Field(default=0, ge=0)


class PlanCreate(BaseModel):
    name: str
    exercise_rest_seconds: int = Field(default=180, ge=0)
    # min_length=1: a plan with no exercises is not a plan, and rejecting it
    # here is what makes the 422 in the tests a validation error rather than
    # a half-built program.
    exercises: list[PlanExerciseCreate] = Field(min_length=1)
```

- [ ] **Step 5: Add the endpoint**

Add after `create_program` in `backend/app/main.py`:

```python
@app.post("/plans")
def create_plan(
    plan: PlanCreate,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    """Create a program and all of its week-1 exercises as one unit."""
    program_id = None
    try:
        program_res = db.table("programs").insert({
            "name": plan.name,
            "user_id": user_id,
            "exercise_rest_seconds": plan.exercise_rest_seconds
        }).execute()

        if len(program_res.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to create plan.")

        program = program_res.data[0]
        program_id = program["id"]

        schedules = []
        for exercise in plan.exercises:
            row = db.table("schedules").insert({
                "program_id": program_id,
                "week": 1,
                "exercise_name": exercise.exercise_name,
                "target_weight": exercise.target_weight,
                "target_sets": exercise.target_sets,
                "target_reps": exercise.target_reps,
                "rest_seconds": exercise.rest_seconds,
                "weight_increment": exercise.weight_increment,
                "rep_increment": exercise.rep_increment
            }).execute()

            if len(row.data) == 0:
                raise HTTPException(status_code=400, detail="Failed to add an exercise.")
            schedules.append(row.data[0])

        return {
            "message": "Plan created!",
            "data": {"program": program, "schedules": schedules}
        }
    except Exception as e:
        # Roll back by hand: a program with no exercises is invisible in the
        # UI but real in the database, which is how the existing orphan row
        # got there. Postgres cascades schedules on program delete.
        if program_id is not None:
            try:
                db.table("programs").delete().eq("id", program_id).execute()
            except Exception:
                pass
        if isinstance(e, HTTPException):
            raise
        raise _map_supabase_error(e)
```

Note the `except Exception` catches `HTTPException` too so cleanup always runs, then re-raises it unchanged — the usual `except HTTPException: raise` first would skip the rollback.

- [ ] **Step 6: Verify**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: **35 passed** (29 existing + 6 new).

- [ ] **Step 7: Commit**

```bash
git add backend/app/main.py backend/tests/conftest.py backend/tests/test_plans.py
git commit -m "feat(plans): create a whole plan atomically"
```

---

### Task 2: Group schedules into plans on the frontend

**Files:**
- Modify: `frontend/src/App.jsx`, `frontend/src/tabs/WorkoutTab.jsx`, `frontend/src/tabs/PlanTab.jsx`, `frontend/src/api/client.js`

**Interfaces:**
- Produces: `plans` becomes an array of grouped plan objects:
  ```js
  { id: `${programId}-${week}`, programId, programName, week,
    exerciseRestSeconds, exercises: [ <schedule row>, ... ] }
  ```
  `fitnessApi.createPlan(payload)` wrapping `POST /plans`.
- Consumed by: Tasks 3, 4 and 5.

- [ ] **Step 1: Add the API wrapper**

In `frontend/src/api/client.js`, beside the existing wrappers:

```js
  createPlan: (planData) => apiClient.post('/plans', planData),
```

- [ ] **Step 2: Group in `loadPlans`**

Replace the body of `loadPlans` in `frontend/src/App.jsx`. It currently flattens every schedule into its own plan; it must group by program and week instead:

```jsx
  const loadPlans = async () => {
    try {
      const res = await fitnessApi.getPrograms();
      const programs = res.data.data || [];

      const perProgram = await Promise.all(
        programs.map(p =>
          fitnessApi.getSchedules(p.id).then(r => ({ program: p, schedules: r.data.data || [] }))
        )
      );

      // A plan is every exercise a program holds in one week, so
      // (programId, week) is its identity — not a schedule id.
      const grouped = [];
      for (const { program, schedules } of perProgram) {
        const byWeek = new Map();
        for (const s of schedules) {
          if (!byWeek.has(s.week)) byWeek.set(s.week, []);
          byWeek.get(s.week).push(s);
        }
        for (const [week, exercises] of byWeek) {
          grouped.push({
            id: `${program.id}-${week}`,
            programId: program.id,
            programName: program.name,
            week,
            exerciseRestSeconds: program.exercise_rest_seconds ?? 180,
            exercises: exercises.slice().sort(
              (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))
            ),
          });
        }
      }

      grouped.sort(
        (a, b) => a.programName.localeCompare(b.programName) || a.week - b.week
      );
      setPlans(grouped);
    } catch (err) {
      console.error('loadPlans:', err);
    }
  };
```

- [ ] **Step 3: Update the Workout plan cards for the new shape**

In `frontend/src/tabs/WorkoutTab.jsx`, the idle grid currently reads `p.exercise_name`, `p.target_sets`, `p.target_reps` and `p.target_weight` off the plan. Those now live on each entry of `p.exercises`. Replace `const exercises = [p.exercise_name];` with `const exercises = p.exercises;` and map over it for the figures, keyed by `ex.id`, using `EXERCISE_CONFIGS[ex.exercise_name]?.label` for each label.

The card's target line becomes a summary: for a single exercise keep `{sets}×{reps}` plus the weight, and for several show the exercise count — `{p.exercises.length} exercises`. Do not try to list every target on the card; it is a 2-column grid on a phone.

- [ ] **Step 4: Update the Plan tab list for the new shape**

`frontend/src/tabs/PlanTab.jsx` renders one `.row` per plan reading the same per-schedule fields. Update it the same way: title stays `{programName} · Week {week}`, and the subtitle becomes the exercise labels joined with ` · ` when there are several, or the existing exercise-and-target line when there is exactly one.

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds.

Then load the app: your existing plans must still appear, each showing one figure, and selecting one must still work.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(plans): group schedules into plans by program and week"
```

---

### Task 3: Multi-exercise plan creation form

**Files:**
- Modify: `frontend/src/tabs/PlanTab.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `fitnessApi.createPlan` from Task 2; `ExercisePicker` and `ExerciseFigure` from `frontend/src/components/`.
- Produces: a form that posts the `PlanCreate` shape from Task 1.

- [ ] **Step 1: Replace the single-exercise form state**

In `frontend/src/App.jsx` the plan form currently holds `planExercise`, `planSets`, `planReps`, `planWeight`, `planWeightInc`, `planRepInc`, `planRest` as flat strings. Replace those with:

```jsx
  const [planName, setPlanName] = useState('');
  const [planExerciseRest, setPlanExerciseRest] = useState('180');
  // Each entry is one exercise in the plan being built.
  const [planExercises, setPlanExercises] = useState([]);
```

Keep `planName` as it is.

- [ ] **Step 2: Rewrite `handleCreatePlan` to post once**

```jsx
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!planName.trim()) { alert('Give the plan a name'); return; }
    if (planExercises.length === 0) { alert('Add at least one exercise'); return; }

    try {
      await fitnessApi.createPlan({
        name: planName.trim(),
        exercise_rest_seconds: Math.max(0, Math.round(Number(planExerciseRest) || 0)),
        exercises: planExercises.map(ex => ({
          exercise_name: ex.exerciseName,
          target_sets: Math.max(1, Math.round(Number(ex.sets) || 0)),
          target_reps: Math.max(1, Math.round(Number(ex.reps) || 0)),
          target_weight: Math.max(0, Number(ex.weight) || 0),
          rest_seconds: Math.max(0, Math.round(Number(ex.rest) || 0)),
          weight_increment: Math.max(0, Number(ex.weightInc) || 0),
          rep_increment: Math.max(0, Math.round(Number(ex.repInc) || 0)),
        })),
      });

      setPlanName('');
      setPlanExerciseRest('180');
      setPlanExercises([]);
      loadPlans();
      alert('Plan created!');
    } catch (err) {
      alert('Error creating plan: ' + err.message);
    }
  };
```

Pass `planName, setPlanName, planExerciseRest, setPlanExerciseRest, planExercises, setPlanExercises, handleCreatePlan` down to `PlanTab`.

- [ ] **Step 3: Build the exercise-list form**

In `frontend/src/tabs/PlanTab.jsx`, the create form becomes:

- Plan name input (as now).
- "Rest between exercises (seconds)" input, bound to `planExerciseRest`.
- A `<div className="section-heading">Exercises</div>` followed by one card per entry in `planExercises`: its `ExerciseFigure`, its label, its targets summarised, and a remove button (`.icon-btn` with a lucide `Trash2`, `aria-label={`Remove ${label}`}`).
- An "Add exercise" `btn btn-secondary btn-block` with a lucide `Plus` that opens `ExercisePicker`.
- Submit stays `btn btn-accent btn-block`, disabled when `planExercises.length === 0`.

Choosing an exercise from the picker appends a new entry with the defaults:

```jsx
  const addExercise = (exerciseName) => {
    setPlanExercises(list => [...list, {
      key: `${exerciseName}-${Date.now()}`,
      exerciseName, sets: '3', reps: '10', weight: '0',
      rest: '90', weightInc: '0', repInc: '0',
    }]);
  };
```

Use `key` (not the index) as the React key, so removing an entry does not make the wrong row's inputs jump.

Each entry's sets / reps / weight / rest / increments are editable inline via `.field-row` inputs, updating through:

```jsx
  const updateExercise = (key, field, value) => {
    setPlanExercises(list => list.map(ex => (ex.key === key ? { ...ex, [field]: value } : ex)));
  };
```

Keep the `min` and `step` attributes on every number input, matching what the backend validates: `min="0"` on weights and increments, `min="1"` on sets and reps, `min="0" step="5"` on rest.

The same exercise may appear twice in a plan — do not deduplicate.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds, `grep -c "style={{" frontend/src/tabs/PlanTab.jsx` prints `0`.

Then create a two-exercise plan in the app and confirm it appears in both lists with two figures on its card.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(plans): build plans from a list of exercises"
```

---

### Task 4: Walk the session through each exercise

**Files:**
- Modify: `frontend/src/App.jsx`, `frontend/src/tabs/WorkoutTab.jsx`

**Interfaces:**
- Consumes: the grouped plan shape from Task 2.
- Produces: `exerciseIndex` state, `currentExercise`, and `completedByExercise` — an array of per-exercise rep arrays, consumed by Task 5.

- [ ] **Step 1: Add the exercise index**

In `frontend/src/App.jsx`, beside `currentSet`:

```jsx
  const [exerciseIndex, setExerciseIndex] = useState(0);
  // One array of rep counts per exercise, parallel to selectedPlan.exercises.
  const [completedByExercise, setCompletedByExercise] = useState([]);
```

Derive the exercise in play above its first use (this eslint config errors on use-before-declaration):

```jsx
  const currentExercise = selectedPlan?.exercises?.[exerciseIndex] ?? null;
```

`completedSets` (the flat array) becomes the *current exercise's* list: `completedByExercise[exerciseIndex] ?? []`. Derive it rather than keeping a second copy in state, so the two can never disagree.

- [ ] **Step 2: Reset both indices when a session starts or resets**

In `startSession`, add `setExerciseIndex(0)` and `setCompletedByExercise(selectedPlan.exercises.map(() => []))`. In `resetSession`, add `setExerciseIndex(0)` and `setCompletedByExercise([])`.

- [ ] **Step 3: Rewrite `doneSet` for three outcomes**

```jsx
  const doneSet = () => {
    if (liveReps < 1 || !currentExercise) return;

    const forThisExercise = [...(completedByExercise[exerciseIndex] ?? []), liveReps];
    const next = completedByExercise.map((v, i) => (i === exerciseIndex ? forThisExercise : v));
    setCompletedByExercise(next);
    setLiveReps(0);

    const moreSets = forThisExercise.length < currentExercise.target_sets;
    const moreExercises = exerciseIndex < selectedPlan.exercises.length - 1;

    if (moreSets) {
      setCurrentSet(s => s + 1);
      setCameraResetKey(k => k + 1);
      setRestRemaining(currentExercise.rest_seconds ?? 90);
      setSessionState('resting');
    } else if (moreExercises) {
      // Longer gap between exercises: time to change station or weights.
      setExerciseIndex(i => i + 1);
      setCurrentSet(1);
      setCameraResetKey(k => k + 1);
      setRestRemaining(selectedPlan.exerciseRestSeconds ?? 180);
      setSessionState('resting');
    } else {
      setSessionState('done');
    }
  };
```

- [ ] **Step 4: Point the camera and readouts at the current exercise**

Everywhere `WorkoutTab` reads `selectedPlan.exercise_name`, `selectedPlan.target_reps`, `selectedPlan.target_sets` or `selectedPlan.target_weight` during an active session, it must read the *current exercise* instead. Pass `currentExercise` down and use it for:

- `AICameraCounter`'s `exerciseLocked`
- `repsRemaining` (`currentExercise.target_reps - liveReps`)
- the `Set N of M` readout (`currentExercise.target_sets`)

The camera readout also gains the exercise label when the plan has more than one, so it is clear which exercise is being counted.

- [ ] **Step 5: Name what is coming on the rest screen**

The rest panel's "Up next" line currently says `Set {currentSet} of {target_sets}`. With several exercises that is ambiguous, so it becomes the exercise label plus the set: `Bicep Curl · Set 2 of 3`. Pass `currentExercise` into the rest UI and read the label from `EXERCISE_CONFIGS`.

- [ ] **Step 6: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds.

Then run a two-exercise plan end to end: confirm the first exercise's sets complete, the longer exercise-rest appears once, the camera switches to the second exercise, and the session ends after the last set of the last exercise — not earlier and not later. This off-by-one is the likeliest defect in the whole plan.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(workout): walk a session through each exercise in turn"
```

---

### Task 5: Log and progress every exercise

**Files:**
- Modify: `frontend/src/App.jsx`, `frontend/src/tabs/WorkoutTab.jsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `completedByExercise` from Task 4; `fitnessApi.logWorkout` and `fitnessApi.advanceSchedule` (both already exist).
- Produces: `results` — `[{ exercise, reps, passed, logged, increments }]` — driving the Done screen.

- [ ] **Step 1: Post one log per exercise**

Replace `finishWorkout` in `frontend/src/App.jsx`. It currently posts a single log against `selectedPlan.id`, which no longer exists on a grouped plan:

```jsx
  const finishWorkout = async () => {
    const stamp = new Date().toLocaleDateString();
    const outcomes = [];

    for (let i = 0; i < selectedPlan.exercises.length; i++) {
      const exercise = selectedPlan.exercises[i];
      const reps = completedByExercise[i] ?? [];
      if (reps.length === 0) continue; // never started; nothing to record

      try {
        const res = await fitnessApi.logWorkout({
          schedule_id: exercise.id,
          log_name: `Session ${stamp}`,
          actual_weight: exercise.target_weight,
          actual_reps: reps,
        });
        outcomes.push({
          exercise,
          reps,
          logged: true,
          passed: res.data?.status_calculated === 'PASS',
        });
      } catch (err) {
        console.error('logWorkout:', exercise.exercise_name, err);
        outcomes.push({ exercise, reps, logged: false, passed: false });
      }
    }

    await loadHistory();
    setResults(outcomes);

    // Offer progression only for exercises that passed AND have something to
    // progress by; an exercise that failed stays on its current week.
    const advancable = outcomes.filter(o =>
      o.logged && o.passed &&
      ((o.exercise.weight_increment || 0) > 0 || (o.exercise.rep_increment || 0) > 0));

    if (advancable.length === 0) {
      resetSession();
      setActiveTab('progress');
    }
  };
```

Add `const [results, setResults] = useState([]);` beside the other session state, and clear it in `resetSession`.

Note the loop is deliberately sequential rather than `Promise.all`: a failure must not prevent the remaining exercises from being logged, and the per-exercise outcome list is what the Done screen reports.

- [ ] **Step 2: Advance only the exercises that passed**

```jsx
  const confirmProgression = async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      const advancable = results.filter(o =>
        o.logged && o.passed &&
        ((o.exercise.weight_increment || 0) > 0 || (o.exercise.rep_increment || 0) > 0));

      // Sequential, and /advance is idempotent, so a partial failure can be
      // retried without duplicating the rows that already landed.
      for (const o of advancable) {
        await fitnessApi.advanceSchedule(o.exercise.id);
      }
      await loadPlans();
      resetSession();
      setActiveTab('progress');
    } catch (err) {
      alert('Error creating next week: ' + err.message);
    } finally {
      setAdvancing(false);
    }
  };
```

`skipProgression` keeps its current behaviour: reset and go to Progress.

- [ ] **Step 3: Show per-exercise results on the Done screen**

Replace the Done screen's single set-breakdown and single progression banner with a list, one `.row` per entry in `results`:

- the exercise's `ExerciseFigure` and label
- its set reps joined, e.g. `10 · 10 · 9`
- a `.badge.badge-pass` reading `PASS` or `.badge.badge-fail` reading `FAIL`
- for an entry with `logged: false`, a `.badge.badge-fail` reading `NOT SAVED` and a `.dim` note that it could not be saved

Beneath, when any exercise qualifies for progression, one banner listing which exercises will advance and to what, with the existing Confirm (`btn btn-accent`, `disabled={advancing}`, label `Creating…` while in flight) and Skip (`btn btn-secondary`) buttons.

When nothing qualifies, show the existing Save/Discard row instead.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds.

Then complete a two-exercise workout where one exercise hits its target and the other does not, and confirm: both appear in Progress history, the passed one is offered progression and the failed one is not, and confirming creates a week-2 row only for the passed exercise.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(workout): log and progress each exercise separately"
```

---

### Task 6: Final sweep

**Files:** as needed

- [ ] **Step 1: Confirm nothing still reads a plan as a single exercise**

```bash
grep -rn "selectedPlan\.\(exercise_name\|target_reps\|target_sets\|target_weight\|rest_seconds\|weight_increment\|rep_increment\)" frontend/src/ || echo "clean"
```

Expected: no matches. Those fields live on `selectedPlan.exercises[i]` now, and any survivor is a latent `undefined` at runtime that neither lint nor the build will catch.

- [ ] **Step 2: Confirm no inline styles crept in**

```bash
grep -rn "style={{" frontend/src/ || echo "clean"
```

- [ ] **Step 3: Full check**

```bash
../../venv/Scripts/python.exe -m pytest backend/tests -v
cd frontend && npm run lint && npm run build
```

Expected: 35 passed; no new lint entries; build succeeds.

- [ ] **Step 4: Manual pass**

1. Create a **two-exercise** plan with different rest values and different increments
2. Run it end to end — confirm set rest, then the longer exercise rest, then the second exercise
3. Confirm the camera counts against the right exercise each time
4. Confirm both exercises appear in Progress
5. Confirm progression is offered only for what passed
6. Run an **existing single-exercise** plan and confirm nothing about it changed

Step 6 matters: single-exercise plans are the regression risk, since every one of your existing plans is one.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A frontend/ backend/
git commit -m "fix: multi-exercise plan sweep"
```

---

## Self-Review Notes

**Spec coverage:**
- No schema change; `(program_id, week)` identifies a plan → Task 2
- `programs.exercise_rest_seconds` → already migrated, consumed in Tasks 2 and 4
- `POST /plans` atomic with rollback → Task 1
- Build-a-list creation form → Task 3
- Grouping in `loadPlans` → Task 2
- Straight-sets session walk, set rest vs exercise rest → Task 4
- Rest screen naming what is next → Task 4 Step 5
- One log per exercise, partial-failure reporting → Task 5 Steps 1 and 3
- Per-exercise progression, failures stay behind → Task 5 Step 2
- Backend tests incl. rollback and empty list → Task 1 Step 2
- Manual frontend verification → Task 6 Step 4

**Placeholder scan:** none. Tasks 2–5 describe some UI in prose rather than full JSX, but each names the exact classes, fields, props and behaviours, and the design system they build on is already committed.

**Type consistency:** the grouped plan shape (`id`, `programId`, `programName`, `week`, `exerciseRestSeconds`, `exercises`) is defined in Task 2 and consumed unchanged in Tasks 3, 4 and 5. `completedByExercise` is introduced in Task 4 and read in Task 5. `results` entries (`exercise`, `reps`, `logged`, `passed`) are produced in Task 5 Step 1 and consumed in Steps 2 and 3. `createPlan` is added in Task 2 Step 1 and used in Task 3 Step 2. `_map_supabase_error` used in Task 1 already exists in `main.py`.

**Known risk:** the session state machine now carries two indices and five states, and no automated test covers it — the fake cannot drive a camera. Task 4 Step 6 and Task 6 Step 4 are the only checks, which is why both spell out the exact sequence to walk.
