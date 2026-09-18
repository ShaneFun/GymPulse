# Auto Week Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a workout passes its target, let the user confirm creating next week's schedule with an automatically increased target, instead of retyping the whole plan by hand.

**Architecture:** Two new columns on the `schedules` table (`weight_increment`, `rep_increment`) capture how much to add on a pass. A new idempotent `POST /schedules/{id}/advance` endpoint creates (or returns) the week+1 schedule with those increments applied and carried forward. The Counter tab's Done screen reads `status_calculated` from the workout-log response and, on a PASS with a nonzero increment, shows a Confirm/Skip banner that calls the endpoint.

**Tech Stack:** FastAPI + Supabase (Python 3.11, venv at repo root), React 19 + Vite + axios (frontend), pytest + FastAPI TestClient with an in-memory Supabase fake (backend tests).

**Reference spec:** `docs/superpowers/specs/2026-09-18-auto-week-progression-design.md`

**Command note:** Work happens in the worktree at `C:/Users/siangyou/Desktop/AI fitness Analyze/.worktrees/auto-week-progression`. All commands below use the Bash tool's forward-slash form and are run from the worktree root unless stated otherwise.

The venv is gitignored and therefore only exists in the main checkout, so backend commands use it by relative path from the worktree root:

```
../../venv/Scripts/python.exe
```

**Lint baseline (IMPORTANT):** `npm run lint` does **not** pass cleanly on `main`. It reports **10 errors and 1 warning that are all pre-existing**, in code this plan does not touch:

- `AICameraCounter.jsx`: unused `React` (1:8), unused `onClose` (94:42), setState-in-effect (122:5, 130:7), use-before-declare (134:34, 137:9), exhaustive-deps warning (141:6)
- `App.jsx`: unused `React` (1:8), unused `useCallback` (1:38), use-before-declare (47:5, 48:5)

**Do not fix these — they are out of scope for this plan.** The success criterion for every lint step below is: still exactly **10 errors, 1 warning**, with no new entries pointing at lines this plan changed. If the count goes up, the new code introduced a lint error and must be fixed.

One trap to avoid in particular: this eslint config errors on `const` arrow functions referenced before their declaration (that's what App.jsx:47-48 are). Any new helper must be declared **above** its first use.

---

### Task 1: Add the two new columns to Supabase

This repo has no migration tooling — the schema lives in the Supabase dashboard, so this step is manual and must happen before anything else works end to end.

**Files:**
- None (external: Supabase dashboard)

- [ ] **Step 1: Run the column migration in the Supabase SQL editor**

Open the project's Supabase dashboard → SQL Editor → New query, paste and run:

```sql
alter table schedules
  add column if not exists weight_increment double precision not null default 0,
  add column if not exists rep_increment integer not null default 0;
```

- [ ] **Step 2: Verify the columns exist**

In the SQL editor, run:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'schedules'
  and column_name in ('weight_increment', 'rep_increment');
```

Expected: two rows returned — `weight_increment` (`double precision`, default `0`) and `rep_increment` (`integer`, default `0`).

---

### Task 2: Set up the backend test harness

No tests exist yet and pytest is not installed. This task creates the harness and proves it works with a smoke test. The `supabase` package is also missing from `requirements.txt` even though `main.py` imports it — fixed here since we're touching the file anyway.

**Files:**
- Modify: `requirements.txt`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Install pytest into the venv**

Run: `../../venv/Scripts/python.exe -m pip install pytest`

Expected: `Successfully installed pytest-<version>` (plus its dependencies: iniconfig, pluggy, packaging).

- [ ] **Step 2: Add the missing dependencies to requirements.txt**

Append these two lines to the end of `requirements.txt` (it currently ends with `python-dotenv`):

```
supabase==2.31.0
pytest
```

- [ ] **Step 3: Write the fake Supabase client and fixtures**

Create `backend/tests/conftest.py`:

```python
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# backend/app/main.py is a standalone module (no package), so put its
# directory on sys.path and import it as `main`.
APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

import main  # noqa: E402


class FakeResponse:
    """Stands in for supabase-py's APIResponse — only `.data` is used."""

    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Mimics the chained query builder: .select(...).eq(...).eq(...).execute()"""

    def __init__(self, rows):
        self._rows = rows

    def eq(self, column, value):
        self._rows = [r for r in self._rows if str(r.get(column)) == str(value)]
        return self

    def execute(self):
        return FakeResponse(list(self._rows))


class FakeInsert:
    def __init__(self, table, row):
        self._table = table
        self._row = row

    def execute(self):
        row = dict(self._row)
        row.setdefault("id", f"{self._table.name}-{len(self._table.rows) + 1}")
        row.setdefault("created_at", "2026-09-18T10:00:00Z")
        self._table.rows.append(row)
        return FakeResponse([row])


class FakeTable:
    def __init__(self, name):
        self.name = name
        self.rows = []

    def select(self, *columns):
        return FakeQuery(list(self.rows))

    def insert(self, row):
        return FakeInsert(self, row)


class FakeSupabase:
    """In-memory stand-in for the supabase client used by backend/app/main.py."""

    def __init__(self):
        self.tables = {}

    def table(self, name):
        if name not in self.tables:
            self.tables[name] = FakeTable(name)
        return self.tables[name]

    def seed(self, name, rows):
        table = self.table(name)
        for row in rows:
            table.rows.append(dict(row))


@pytest.fixture
def fake_db(monkeypatch):
    """Replaces the module-level supabase client with an in-memory fake."""
    db = FakeSupabase()
    monkeypatch.setattr(main, "supabase", db)
    return db


@pytest.fixture
def client(fake_db):
    return TestClient(main.app)
```

- [ ] **Step 4: Write the smoke test**

Create `backend/tests/test_health.py`:

```python
def test_home_returns_running_message(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "AI fitness Analyzer API Running"}
```

- [ ] **Step 5: Run the smoke test**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: PASS — `test_home_returns_running_message PASSED`, `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt backend/tests/conftest.py backend/tests/test_health.py
git commit -m "test: add pytest harness with in-memory supabase fake"
```

---

### Task 3: Store the increments on schedule creation

**Files:**
- Modify: `backend/app/main.py:26-33` (`ScheduleCreate`), `backend/app/main.py:65-84` (`create_schedule`)
- Create: `backend/tests/test_schedules.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_schedules.py`:

```python
def test_create_schedule_stores_increments(client, fake_db):
    response = client.post("/schedules", json={
        "program_id": "prog-1",
        "week": 1,
        "exercise_name": "bicep_curl",
        "target_weight": 20.0,
        "target_sets": 3,
        "target_reps": 10,
        "weight_increment": 2.5,
        "rep_increment": 1,
    })

    assert response.status_code == 200
    stored = fake_db.table("schedules").rows[0]
    assert stored["weight_increment"] == 2.5
    assert stored["rep_increment"] == 1


def test_create_schedule_defaults_increments_to_zero(client, fake_db):
    response = client.post("/schedules", json={
        "program_id": "prog-1",
        "week": 1,
        "exercise_name": "squat",
        "target_weight": 0,
        "target_sets": 3,
        "target_reps": 12,
    })

    assert response.status_code == 200
    stored = fake_db.table("schedules").rows[0]
    assert stored["weight_increment"] == 0
    assert stored["rep_increment"] == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests/test_schedules.py -v`

Expected: FAIL — both tests raise `KeyError: 'weight_increment'`, because `create_schedule` does not store the field yet.

- [ ] **Step 3: Add the fields to the model**

In `backend/app/main.py`, replace the `ScheduleCreate` class:

```python
class ScheduleCreate(BaseModel):
    program_id: str     
    week: int            
    exercise_name: str   
    target_weight: float 
    target_sets: int     
    target_reps: int     
    notes: str | None = None
    weight_increment: float = 0
    rep_increment: int = 0
```

- [ ] **Step 4: Store the fields on insert**

In `backend/app/main.py`, in `create_schedule`, replace the insert payload:

```python
        response = supabase.table("schedules").insert({
            "program_id": schedule.program_id,
            "week": schedule.week,
            "exercise_name": schedule.exercise_name,
            "target_weight": schedule.target_weight,
            "target_sets": schedule.target_sets,
            "target_reps": schedule.target_reps,
            "weight_increment": schedule.weight_increment,
            "rep_increment": schedule.rep_increment
        }).execute()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: PASS — `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_schedules.py
git commit -m "feat: store per-plan progression increments on schedules"
```

---

### Task 4: Add the `/schedules/{id}/advance` endpoint

**Files:**
- Modify: `backend/app/main.py` (add endpoint after `create_schedule`)
- Create: `backend/tests/test_advance.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_advance.py`:

```python
def test_advance_creates_next_week_with_increments(client, fake_db):
    fake_db.seed("schedules", [{
        "id": "sched-1",
        "program_id": "prog-1",
        "week": 1,
        "exercise_name": "bicep_curl",
        "target_weight": 20.0,
        "target_sets": 3,
        "target_reps": 10,
        "weight_increment": 2.5,
        "rep_increment": 1,
    }])

    response = client.post("/schedules/sched-1/advance")

    assert response.status_code == 200
    created = response.json()["data"]
    assert created["week"] == 2
    assert created["target_weight"] == 22.5
    assert created["target_reps"] == 11
    assert created["target_sets"] == 3
    assert created["exercise_name"] == "bicep_curl"
    assert created["program_id"] == "prog-1"
    # Increments carry forward so the chain can keep progressing.
    assert created["weight_increment"] == 2.5
    assert created["rep_increment"] == 1
    assert len(fake_db.table("schedules").rows) == 2


def test_advance_returns_existing_next_week_without_duplicating(client, fake_db):
    fake_db.seed("schedules", [
        {
            "id": "sched-1", "program_id": "prog-1", "week": 1,
            "exercise_name": "squat", "target_weight": 0,
            "target_sets": 3, "target_reps": 12,
            "weight_increment": 0, "rep_increment": 2,
        },
        {
            "id": "sched-2", "program_id": "prog-1", "week": 2,
            "exercise_name": "squat", "target_weight": 0,
            "target_sets": 3, "target_reps": 14,
            "weight_increment": 0, "rep_increment": 2,
        },
    ])

    response = client.post("/schedules/sched-1/advance")

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "sched-2"
    assert len(fake_db.table("schedules").rows) == 2


def test_advance_applies_only_the_nonzero_increment(client, fake_db):
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 1,
        "exercise_name": "pushup", "target_weight": 0,
        "target_sets": 4, "target_reps": 15,
        "weight_increment": 0, "rep_increment": 2,
    }])

    response = client.post("/schedules/sched-1/advance")

    created = response.json()["data"]
    assert created["target_weight"] == 0
    assert created["target_reps"] == 17


def test_advance_treats_missing_increments_as_zero(client, fake_db):
    """Rows created before the increment columns existed read back as None."""
    fake_db.seed("schedules", [{
        "id": "sched-1", "program_id": "prog-1", "week": 3,
        "exercise_name": "situp", "target_weight": 0,
        "target_sets": 3, "target_reps": 20,
        "weight_increment": None, "rep_increment": None,
    }])

    response = client.post("/schedules/sched-1/advance")

    created = response.json()["data"]
    assert created["week"] == 4
    assert created["target_reps"] == 20
    assert created["weight_increment"] == 0
    assert created["rep_increment"] == 0


def test_advance_404_when_schedule_missing(client, fake_db):
    response = client.post("/schedules/does-not-exist/advance")

    assert response.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests/test_advance.py -v`

Expected: FAIL — all five tests return 404/405 from FastAPI because the route does not exist yet.

- [ ] **Step 3: Implement the endpoint**

In `backend/app/main.py`, add this immediately after the `create_schedule` function (before `create_workout_log`):

```python
@app.post("/schedules/{schedule_id}/advance")
def advance_schedule(schedule_id: str):
    try:
        sched_res = supabase.table("schedules").select("*").eq("id", schedule_id).execute()

        if len(sched_res.data) == 0:
            raise HTTPException(status_code=404, detail="Schedule not found.")

        current = sched_res.data[0]
        next_week = current["week"] + 1

        # Idempotent: if next week already exists for this program, return it.
        existing = (
            supabase.table("schedules").select("*")
            .eq("program_id", current["program_id"])
            .eq("week", next_week)
            .execute()
        )
        if len(existing.data) > 0:
            return {
                "message": "Next week's schedule already exists.",
                "data": existing.data[0]
            }

        # Rows created before the increment columns existed read back as None.
        weight_increment = current.get("weight_increment") or 0
        rep_increment = current.get("rep_increment") or 0

        response = supabase.table("schedules").insert({
            "program_id": current["program_id"],
            "week": next_week,
            "exercise_name": current["exercise_name"],
            "target_weight": current["target_weight"] + weight_increment,
            "target_sets": current["target_sets"],
            "target_reps": current["target_reps"] + rep_increment,
            "weight_increment": weight_increment,
            "rep_increment": rep_increment
        }).execute()

        if len(response.data) == 0:
            raise HTTPException(status_code=400, detail="Failed to create next week's schedule.")

        return {
            "message": "Next week's schedule created!",
            "data": response.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: PASS — `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_advance.py
git commit -m "feat: add idempotent schedule advance endpoint"
```

---

### Task 5: Add the API client wrapper

**Files:**
- Modify: `frontend/src/api/client.js:16-17`

- [ ] **Step 1: Add the wrapper**

In `frontend/src/api/client.js`, replace the Schedules section:

```js
  // Feature 2: Schedules
  getSchedules: (programId) => apiClient.get(`/schedules?program_id=${programId}`),
  createSchedule: (scheduleData) => apiClient.post('/schedules', scheduleData),
  advanceSchedule: (scheduleId) => apiClient.post(`/schedules/${scheduleId}/advance`),
```

- [ ] **Step 2: Verify it lints**

Run: `cd frontend && npm run lint`

Expected: lint still reports exactly the 10 pre-existing errors and 1 warning — no new entry for `src/api/client.js`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat: add advanceSchedule API client wrapper"
```

---

### Task 6: Add increment inputs to the Plan form

**Files:**
- Modify: `frontend/src/App.jsx:26-30` (plan form state), `frontend/src/App.jsx:103-133` (`handleCreatePlan`), `frontend/src/App.jsx:462-476` (form JSX)

- [ ] **Step 1: Add the form state**

In `frontend/src/App.jsx`, in the `// ── Plan Tab ──` state block, add two lines after `planWeight`:

```jsx
  const [planWeight, setPlanWeight] = useState('0');
  const [planWeightInc, setPlanWeightInc] = useState('0');
  const [planRepInc, setPlanRepInc] = useState('0');
```

- [ ] **Step 2: Send the increments when creating the schedule**

In `handleCreatePlan`, replace the `createSchedule` call:

```jsx
      await fitnessApi.createSchedule({
        program_id: programId,
        week: 1,
        exercise_name: planExercise,
        target_weight: parseFloat(planWeight) || 0,
        target_sets: parseInt(planSets),
        target_reps: parseInt(planReps),
        weight_increment: parseFloat(planWeightInc) || 0,
        rep_increment: parseInt(planRepInc) || 0,
      });
```

- [ ] **Step 3: Reset the new fields after a successful create**

In `handleCreatePlan`, replace the reset block that follows the `createSchedule` call:

```jsx
      setPlanName('');
      setPlanSets('');
      setPlanReps('');
      setPlanWeight('0');
      setPlanWeightInc('0');
      setPlanRepInc('0');
```

- [ ] **Step 4: Add the inputs to the form**

In the Plan tab JSX, insert this block immediately after the Sets/Reps/Weight row (the `<div style={{ display: 'flex', gap: 10 }} className="input-group">` block) and immediately before the `<button type="submit" ...>`:

```jsx
                <div className="input-group">
                  <label>Progression — on a passed workout, increase next week by</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label>Weight (kg)</label>
                      <input type="number" min="0" step="0.5" placeholder="0" value={planWeightInc} onChange={e => setPlanWeightInc(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Reps / Set</label>
                      <input type="number" min="0" placeholder="0" value={planRepInc} onChange={e => setPlanRepInc(e.target.value)} />
                    </div>
                  </div>
                </div>
```

- [ ] **Step 5: Verify it lints and builds**

Run: `cd frontend && npm run lint && npm run build`

Expected: lint still reports exactly the 10 pre-existing errors and 1 warning (no new entries), and `✓ built in <time>`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add progression increment inputs to plan form"
```

---

### Task 7: Show the progression prompt on the Done screen

**Files:**
- Modify: `frontend/src/App.jsx:32-40` (counter state), `frontend/src/App.jsx:160-183` (`finishWorkout`, `cancelSession`), `frontend/src/App.jsx:416-430` (Done screen buttons)

- [ ] **Step 1: Add the progression state**

In `frontend/src/App.jsx`, in the `// ── Counter Tab ──` state block, add after `autoCamera`:

```jsx
  const [autoCamera, setAutoCamera] = useState(true); // user toggle: auto vs manual
  // When a PASS has a nonzero increment: { nextWeek, nextWeight, nextReps }
  const [progression, setProgression] = useState(null);
```

- [ ] **Step 2: Extract a shared session reset helper**

`finishWorkout`, `confirmProgression`, `skipProgression`, and `cancelSession` all reset the session, so extract one helper.

**Placement matters:** `resetSession` must be declared **above** `finishWorkout`, because this eslint config errors on a `const` arrow function referenced before its declaration. Insert `resetSession` immediately **before** the existing `startSession` function (in the `// ── Workout Session ──` block), so it sits above every caller:

```jsx
  const resetSession = () => {
    setSessionState('idle');
    setCompletedSets([]);
    setCurrentSet(1);
    setLiveReps(0);
    setProgression(null);
  };

  const startSession = () => {
```

Then replace the existing `cancelSession` function (which currently sits at the end of the session block) so it delegates:

```jsx
  const cancelSession = () => {
    resetSession();
  };
```

- [ ] **Step 3: Branch `finishWorkout` on the PASS result**

Replace the whole `finishWorkout` function:

```jsx
  const finishWorkout = async () => {
    try {
      const res = await fitnessApi.logWorkout({
        schedule_id: selectedPlan.id,
        log_name: `Session ${new Date().toLocaleDateString()}`,
        actual_weight: selectedPlan.target_weight,
        actual_reps: completedSets,
      });

      await loadHistory();

      const passed = res.data?.status_calculated === 'PASS';
      const weightInc = selectedPlan.weight_increment || 0;
      const repInc = selectedPlan.rep_increment || 0;

      // On a PASS with something to progress by, stay here and ask first.
      if (passed && (weightInc > 0 || repInc > 0)) {
        setProgression({
          nextWeek: (selectedPlan.week || 1) + 1,
          nextWeight: selectedPlan.target_weight + weightInc,
          nextReps: selectedPlan.target_reps + repInc,
        });
        return;
      }

      resetSession();
      setActiveTab('progress');
    } catch (err) {
      alert('Error saving workout: ' + err.message);
    }
  };

  const confirmProgression = async () => {
    try {
      await fitnessApi.advanceSchedule(selectedPlan.id);
      await loadPlans();
      resetSession();
      setActiveTab('progress');
    } catch (err) {
      alert('Error creating next week: ' + err.message);
    }
  };

  const skipProgression = () => {
    resetSession();
    setActiveTab('progress');
  };
```

- [ ] **Step 4: Render the banner in place of the Save/Discard buttons**

In the `sessionState === 'done'` block, replace the final `<div style={{ display: 'flex', gap: 8, marginTop: 12 }}>` block (the one holding "💾 Save & View Progress" and "Discard") with this conditional:

```jsx
                {progression ? (
                  <div style={{
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.35)',
                    borderRadius: 14, padding: '16px', marginTop: 12,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>
                      ⬆ You passed! Ready for Week {progression.nextWeek}?
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                      Next target: {progression.nextWeight > 0 ? `${progression.nextWeight}kg × ` : ''}
                      {progression.nextReps} reps × {selectedPlan.target_sets} sets
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-success" onClick={confirmProgression} style={{ flex: 2 }}>
                        Create Week {progression.nextWeek}
                      </button>
                      <button
                        onClick={skipProgression}
                        style={{
                          flex: 1, background: 'transparent', color: 'var(--text-secondary)',
                          border: '1px solid var(--border)', borderRadius: 10,
                          padding: 13, cursor: 'pointer', fontSize: '0.85rem',
                        }}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-success" onClick={finishWorkout} style={{ flex: 2 }}>
                      💾 Save & View Progress
                    </button>
                    <button
                      onClick={cancelSession}
                      style={{
                        flex: 1, background: 'transparent', color: 'var(--text-secondary)',
                        border: '1px solid var(--border)', borderRadius: 10,
                        padding: 13, cursor: 'pointer', fontSize: '0.85rem',
                      }}
                    >
                      Discard
                    </button>
                  </div>
                )}
```

- [ ] **Step 5: Verify it lints and builds**

Run: `cd frontend && npm run lint && npm run build`

Expected: lint still reports exactly the 10 pre-existing errors and 1 warning (no new entries), and `✓ built in <time>`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: prompt to advance to next week after a passed workout"
```

---

### Task 8: Show the week number in plan lists

Once progression creates week 2, the Plan tab and the Counter dropdown would otherwise show two identical-looking entries for the same program. Both labels need the week number.

**Files:**
- Modify: `frontend/src/App.jsx:244-248` (Counter tab dropdown options), `frontend/src/App.jsx:486-489` (My Plans list item)

- [ ] **Step 1: Add the week to the Counter tab dropdown**

Replace the `plans.map` option rendering in the Counter tab's `<select>`:

```jsx
                        {plans.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.programName} · Week {p.week} — {p.exercise_name} ({p.target_sets}×{p.target_reps})
                          </option>
                        ))}
```

- [ ] **Step 2: Add the week to the My Plans list**

In the Plan tab's `plans.map`, replace the plan name and detail lines:

```jsx
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {p.programName} · Week {p.week}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {EXERCISE_CONFIGS[p.exercise_name]?.label || p.exercise_name} · {p.target_sets}×{p.target_reps}{p.target_weight > 0 ? ` @ ${p.target_weight}kg` : ''}
                      </div>
```

- [ ] **Step 3: Verify it lints and builds**

Run: `cd frontend && npm run lint && npm run build`

Expected: lint still reports exactly the 10 pre-existing errors and 1 warning (no new entries), and `✓ built in <time>`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: label plans with their week number"
```

---

### Task 9: End-to-end manual verification

**Files:**
- None (manual verification against the running app)

- [ ] **Step 1: Start the backend**

Run: `../../venv/Scripts/python.exe backend/app/main.py`

Expected: `Uvicorn running on http://127.0.0.1:8000`.

- [ ] **Step 2: Start the frontend**

In a second terminal, run: `cd frontend && npm run dev`

Expected: `Local: http://localhost:5173/`.

- [ ] **Step 3: Verify the PASS-with-increment path**

In the browser at `http://localhost:5173`:
1. Plan tab → create a plan: name "Progression Test", exercise Bicep Curl, Sets `1`, Reps `1`, Weight `20`, weight increase `2.5`, rep increase `1`.
2. Counter tab → select "Progression Test · Week 1" → Start Workout.
3. Do (or simulate with the camera) at least 1 rep, then Done Set.
4. On the Done screen, press "💾 Save & View Progress".

Expected: the banner reads "⬆ You passed! Ready for Week 2?" with "Next target: 22.5kg × 2 reps × 1 sets".

- [ ] **Step 4: Verify Confirm creates the next week**

Press "Create Week 2", then open the Plan tab.

Expected: a new entry "Progression Test · Week 2 — Bicep Curl · 1×2 @ 22.5kg" appears alongside Week 1.

- [ ] **Step 5: Verify the endpoint is idempotent**

Run: `curl -X POST http://127.0.0.1:8000/schedules/<week-1-schedule-id>/advance`

(Get `<week-1-schedule-id>` from `curl "http://127.0.0.1:8000/schedules?program_id=<program-id>"`, and the program id from `curl http://127.0.0.1:8000/programs`.)

Expected: `{"message":"Next week's schedule already exists.","data":{...week 2 row...}}` and no third schedule is created.

- [ ] **Step 6: Verify the no-increment path shows no prompt**

Create a second plan with both increments left at `0`, run a passing workout on it.

Expected: no progression banner — the app saves and jumps straight to the Progress tab, exactly as before this feature.

- [ ] **Step 7: Verify the FAIL path is unchanged**

Create a plan with Sets `2`, Reps `10`, weight increase `2.5`. Start the workout, complete only 1 rep on set 1 and 1 rep on set 2, then save.

Expected: no progression banner (the log fails the target), the app jumps to the Progress tab, and the session shows a ❌ badge.

---

### Task 10: Document the feature in the README

**Files:**
- Modify: `README.md:28-31` (Key Features)

- [ ] **Step 1: Update the Key Features entry**

In `README.md`, replace the "Automated Analytics & Progression" bullet:

```markdown
- **📊 Automated Analytics & Progression**
  Logs your performance and compares it against your customized target schedules. Automatically assigns PASS/FAIL scores, and when you pass, offers to generate next week's plan with your chosen weight and rep increases already applied.
```

- [ ] **Step 2: Run the full backend test suite one more time**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: PASS — `8 passed`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document auto week progression in README"
```

---

## Self-Review Notes

**Spec coverage:**
- Data model (two columns, default 0) → Task 1
- `ScheduleCreate` fields + storage → Task 3
- `POST /schedules/{id}/advance` (create, idempotent reuse, carry-forward increments, 404) → Task 4
- API client wrapper → Task 5
- Plan form increment inputs → Task 6
- Done-screen branching: FAIL unchanged / PASS with 0 increments / PASS with increments → Task 7 + verified in Task 9 steps 3, 6, 7
- Backend unit tests → Tasks 2–4; frontend manual verification → Task 9

**Added beyond the spec:** Task 8 (week labels) — without it, week 1 and week 2 render identically in both plan lists, which makes the feature unusable. Task 2 also adds the missing `supabase` dependency to `requirements.txt`, a pre-existing gap surfaced by setting up the test harness.

**Type consistency:** `weight_increment` / `rep_increment` (snake_case) are used consistently in the model, the insert payloads, the endpoint, the tests, and the API payload from the frontend; the frontend-local state names (`planWeightInc`, `planRepInc`) and the `progression` object keys (`nextWeek`, `nextWeight`, `nextReps`) are used consistently in Tasks 6 and 7. `resetSession` is defined once in Task 7 Step 2 and referenced in Steps 3 and 4.
