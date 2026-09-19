# Authentication and Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give GymPulse a private account — a login gate, workout data readable only by its owner and enforced by the database, and a profile page with name, phone, year of birth and avatar.

**Architecture:** Supabase Auth runs in the browser; the frontend forwards its JWT to FastAPI, which builds a **per-request** Supabase client carrying that token so Postgres sees `auth.uid()` and row-level security does the enforcement. Ownership lives on `programs` alone; `schedules` and `workout_logs` inherit it through their parent. Avatars upload straight from the browser to Supabase Storage, never through the backend.

**Tech Stack:** FastAPI + Supabase (Python 3.11, venv at repo root), React 19 + Vite + axios, `@supabase/supabase-js` (new), pytest with an in-memory Supabase fake.

**Spec:** `docs/superpowers/specs/2026-09-19-auth-and-profile-design.md`

## Global Constraints

- **Rollout order is load-bearing.** The permissive `gympulse_all` policies stay in place until the JWT path works end to end (Task 6). Swapping them earlier makes every query return empty and every write fail with `42501` — this has already happened once in this project.
- **Migration order is load-bearing.** `user_id` is added nullable, backfilled, and only then set `NOT NULL`. The reverse order fails on existing rows.
- Backend commands use the venv by relative path from a worktree root: `../../venv/Scripts/python.exe`. Frontend commands run from `frontend/`.
- **Lint baseline:** `npm run lint` reports **5 errors and 1 warning, all pre-existing** (`AICameraCounter.jsx`: setState-in-effect, use-before-declare ×2, exhaustive-deps warning; `App.jsx`: use-before-declare ×2). Do not fix them. Success criterion: no NEW entries. The count may drop; it must never rise.
- This eslint config errors on `const` arrow functions referenced before their declaration. Declare every helper above its first use.
- **Backend test baseline:** 12 tests currently pass. They must stay green throughout.
- Zero inline styles in JSX — this codebase has none and must keep none. Use the classes in `frontend/src/index.css`.
- Never commit real credentials. `.env` is gitignored; `.env.example` carries names only.

---

# Phase 1 — Auth foundation

### Task 1: Supabase schema and account (manual)

The schema lives in the Supabase dashboard; there is no migration tooling. Run this at https://supabase.com/dashboard/project/klldkzitusmrtgyvhkit/sql/new

**Files:** none (external)

**Interfaces:**
- Produces: a `user_id` column on `programs` (nullable for now), a `profiles` table, an `avatars` storage bucket, and a user account whose uid later tasks reference.

- [ ] **Step 1: Add the ownership column and profiles table**

```sql
alter table programs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone        text,
  birth_year   integer check (birth_year is null or birth_year between 1900 and 2100),
  avatar_path  text,
  updated_at   timestamptz not null default now()
);

alter table profiles enable row level security;

-- Temporary, matching the permissive policies already on the other tables.
-- Task 6 replaces this along with the rest.
drop policy if exists gympulse_all on public.profiles;
create policy gympulse_all on public.profiles for all using (true) with check (true);
```

- [ ] **Step 2: Create the avatars storage bucket**

Dashboard → Storage → New bucket. Name it `avatars`, leave **Public** switched OFF. Its access policies are added in Task 6.

- [ ] **Step 3: Create the account**

Dashboard → Authentication → Users → Add user. Use a real email and a password you will remember. **Leave signup enabled for now** — it gets closed in Task 6.

Then Authentication → Providers → Email: turn **Confirm email** OFF. Otherwise the account cannot sign in until a confirmation link is clicked, and this is a private single-user app.

- [ ] **Step 4: Backfill existing rows and record the uid**

```sql
update programs
set user_id = (select id from auth.users order by created_at limit 1)
where user_id is null;

select id, email from auth.users;
select id, name, user_id from programs;
```

Expected: all 3 programs now carry the same `user_id`, matching the single row in `auth.users`. Note that uid — later verification steps use it.

Do **not** set `NOT NULL` yet; Task 5 does that after the app proves it stamps the column correctly.

---

### Task 2: Backend auth dependency

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`
- Create: `.env.example`

**Interfaces:**
- Produces: `get_supabase(authorization)` FastAPI dependency returning a per-request `Client`; `get_user_id(authorization)` returning the caller's uid string. Both raise 401 on a missing or malformed header. `conftest.py` gains a `fake_db` fixture that works through `app.dependency_overrides` rather than a module global.

- [ ] **Step 1: Rework the test harness for dependency injection**

The current `fake_db` fixture monkeypatches `main.supabase`, a global this task deletes. Replace the two fixtures at the bottom of `backend/tests/conftest.py` (keep all the Fake* classes above them exactly as they are) with:

```python
TEST_USER_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def fake_db():
    """In-memory stand-in, injected via FastAPI's dependency overrides."""
    return FakeSupabase()


@pytest.fixture
def client(fake_db):
    main.app.dependency_overrides[main.get_supabase] = lambda: fake_db
    main.app.dependency_overrides[main.get_user_id] = lambda: TEST_USER_ID
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


@pytest.fixture
def anon_client():
    """No dependency overrides: exercises the real auth dependency."""
    with TestClient(main.app) as c:
        yield c
```

- [ ] **Step 2: Write the failing auth tests**

Create `backend/tests/test_auth.py`:

```python
def test_missing_authorization_header_is_401(anon_client):
    response = anon_client.get("/programs")

    assert response.status_code == 401


def test_malformed_authorization_header_is_401(anon_client):
    response = anon_client.get("/programs", headers={"Authorization": "nonsense"})

    assert response.status_code == 401


def test_health_endpoint_needs_no_auth(anon_client):
    response = anon_client.get("/")

    assert response.status_code == 200
```

- [ ] **Step 3: Run them and watch them fail**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests/test_auth.py -v`

Expected: the two 401 tests FAIL (the endpoints currently return 200 with no auth). The health test passes already.

- [ ] **Step 4: Replace the module-level client with dependencies**

In `backend/app/main.py`, replace the credential block and client construction (currently lines 19-21) with:

```python
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_KEY must be set. Copy .env.example to .env."
    )


def _bearer_token(authorization: str | None) -> str:
    """Pulls the raw JWT out of an Authorization header, or 401s."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    return token


def get_supabase(authorization: str | None = Header(default=None)) -> Client:
    """A Supabase client carrying the caller's JWT, so RLS sees auth.uid()."""
    token = _bearer_token(authorization)
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.postgrest.auth(token)
    return client


def get_user_id(authorization: str | None = Header(default=None)) -> str:
    """The caller's user id, read from the JWT's `sub` claim."""
    token = _bearer_token(authorization)
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed token.")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token has no subject.")
    return user_id
```

The signature is not verified here because the token is handed straight to Supabase, which verifies it. `get_user_id` only reads the claim to stamp `user_id` on inserts; a forged token would still be rejected by Postgres.

Add the imports this needs at the top of the file: `Header` and `Depends` from `fastapi`, and `import jwt` (PyJWT).

- [ ] **Step 5: Install PyJWT and record it**

Run: `../../venv/Scripts/python.exe -m pip install PyJWT`

Then append `PyJWT==2.10.1` to `requirements.txt` (confirm the version actually installed with `../../venv/Scripts/python.exe -m pip show pyjwt`, and pin what you see).

- [ ] **Step 6: Switch all eight data endpoints to the dependency**

Every endpoint except `home()` gains `db: Client = Depends(get_supabase)` as its last parameter, and every `supabase.table(...)` inside it becomes `db.table(...)`.

The eight: `create_program`, `create_schedule`, `advance_schedule`, `create_workout_log`, `get_all_programs`, `get_schedules_by_program`, `get_logs_by_schedule`, `get_workout_analysis`.

Leave `home()` unauthenticated — it is a health check.

Be careful with the two that take path or query parameters (`advance_schedule`, `get_schedules_by_program`, `get_logs_by_schedule`, `get_workout_analysis`): the `Depends` parameter goes last so it does not disturb the existing signature order.

- [ ] **Step 7: Create .env.example**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-publishable-key
```

- [ ] **Step 8: Verify the whole suite**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: **15 passed** — the 12 existing plus the 3 new auth tests.

If the 12 existing tests fail with a dependency error, the override names in `conftest.py` do not match the function names in `main.py`. They must match exactly.

- [ ] **Step 9: Commit**

```bash
git add backend/app/main.py backend/tests/conftest.py backend/tests/test_auth.py requirements.txt .env.example
git commit -m "feat(auth): require a bearer token and build a per-request Supabase client"
```

---

### Task 3: Stamp ownership on new programs

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_schedules.py` (or create `backend/tests/test_programs.py`)

**Interfaces:**
- Consumes: `get_user_id` from Task 2.
- Produces: `POST /programs` writes `user_id` taken from the token.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_programs.py`:

```python
from conftest import TEST_USER_ID


def test_create_program_stamps_user_id_from_token(client, fake_db):
    response = client.post("/programs", json={"name": "Leg Day"})

    assert response.status_code == 200
    stored = fake_db.table("programs").rows[0]
    assert stored["user_id"] == TEST_USER_ID


def test_create_program_ignores_user_id_in_body(client, fake_db):
    """Ownership comes from the token, never from client input."""
    response = client.post("/programs", json={"name": "Leg Day", "user_id": "someone-else"})

    assert response.status_code == 200
    stored = fake_db.table("programs").rows[0]
    assert stored["user_id"] == TEST_USER_ID
```

- [ ] **Step 2: Run and watch it fail**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests/test_programs.py -v`

Expected: FAIL with `KeyError: 'user_id'`.

- [ ] **Step 3: Stamp the column**

In `create_program`, add the user-id dependency and include it in the insert:

```python
@app.post("/programs")
def create_program(
    program: ProgramCreate,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    try:
        response = db.table("programs").insert({
            "name": program.name,
            "user_id": user_id
        }).execute()
```

`ProgramCreate` stays `{name: str}` — pydantic ignores the extra `user_id` key in the second test's body, which is exactly the behaviour being asserted.

- [ ] **Step 4: Verify**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: **17 passed**.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_programs.py
git commit -m "feat(auth): stamp program ownership from the authenticated user"
```

---

### Task 4: Frontend login gate

**Files:**
- Create: `frontend/src/lib/supabase.js`, `frontend/src/auth/AuthProvider.jsx`, `frontend/src/auth/LoginScreen.jsx`, `frontend/.env.example`
- Modify: `frontend/src/api/client.js`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: the backend's bearer-token requirement from Task 2.
- Produces: `useAuth()` returning `{ session, user, loading, signIn, signOut }`; `supabase` client exported from `lib/supabase.js`.

- [ ] **Step 1: Install the client library**

Run: `cd frontend && npm install @supabase/supabase-js`

- [ ] **Step 2: Create the Supabase client**

`frontend/src/lib/supabase.js`:

```js
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy frontend/.env.example to frontend/.env.'
  );
}

// persistSession keeps the user signed in across reloads; autoRefreshToken
// renews the JWT before it expires so long sessions do not 401 mid-workout.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

And `frontend/.env.example`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Create `frontend/.env` with the real values too. Verify it is ignored: `git check-ignore frontend/.env` must print the path. If it does not, add `.env` to `frontend/.gitignore` before going any further.

- [ ] **Step 3: Write the auth context**

`frontend/src/auth/AuthProvider.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  const value = { session, user: session?.user ?? null, loading, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 4: Attach the token to every API call**

In `frontend/src/api/client.js`, after the `apiClient` is created and before the `fitnessApi` export, add:

```js
import { supabase } from '../lib/supabase';

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (error) => {
    // A rejected token means the session is no longer usable; drop it so the
    // app falls back to the login screen rather than looping on failures.
    if (error.response?.status === 401) supabase.auth.signOut();
    return Promise.reject(error);
  }
);
```

- [ ] **Step 5: Write the login screen**

`frontend/src/auth/LoginScreen.jsx` — a centred `.card` with the app name as a `.screen-heading`, email and password inputs in `.input-group`s with `.label`s, a `btn btn-accent btn-block` submit button, and an error message in `.dim` when sign-in fails.

Requirements: the form is a real `<form>` with `onSubmit`; the button shows `Signing in…` and is `disabled` while the request is in flight; inputs use `type="email"` and `type="password"` with `autoComplete="email"` and `autoComplete="current-password"`. Zero inline styles — add any classes you need to `index.css`.

The error message must be the generic text returned by Supabase; do not write copy that distinguishes "no such user" from "wrong password".

- [ ] **Step 6: Gate the app**

Wrap the app in the provider in `frontend/src/main.jsx`:

```jsx
import { AuthProvider } from './auth/AuthProvider';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

Then at the top of `App`'s render in `frontend/src/App.jsx`:

```jsx
  const { session, loading } = useAuth();

  if (loading) return <div className="empty">Loading…</div>;
  if (!session) return <LoginScreen />;
```

`useAuth` must be called unconditionally at the top of the component with the other hooks — putting it after an early return breaks the rules of hooks.

- [ ] **Step 7: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src frontend/package.json frontend/package-lock.json frontend/.env.example
git commit -m "feat(auth): add Supabase login gate and forward JWTs to the API"
```

---

### Task 5: Checkpoint — prove auth works end to end

Nothing is written in this task. It exists because everything after it assumes a working login, and because the next task makes the security switch that is hard to debug if this is broken.

**Files:** none

- [ ] **Step 1: Start both servers**

Backend: `../../venv/Scripts/python.exe backend/app/main.py`
Frontend: `cd frontend && npm run dev`

If the backend exits complaining about `SUPABASE_URL`, the root `.env` is missing the values Task 2 made mandatory.

- [ ] **Step 2: Confirm the gate**

Open the app. Expected: the login screen, not the workout tabs.

- [ ] **Step 3: Confirm a wrong password fails**

Sign in with a deliberately wrong password. Expected: an error message, still on the login screen.

- [ ] **Step 4: Confirm the real login works**

Sign in with the account from Task 1. Expected: the app appears and the Plan tab lists your three existing programs.

- [ ] **Step 5: Confirm the session survives a reload**

Refresh the page. Expected: still signed in, no flash of the login screen beyond the brief loading state.

- [ ] **Step 6: Confirm the token actually reaches the backend**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/programs
```

Expected: `401`. The browser works because it sends a token; a bare curl must not.

- [ ] **Step 7: Confirm new programs get an owner**

Create a plan in the app, then in the Supabase SQL editor:

```sql
select name, user_id from programs order by created_at desc limit 1;
```

Expected: the new row carries your uid.

**Do not continue to Task 6 until every step above passes.** If any fails, fix it first — Task 6 removes the safety net.

---

### Task 6: Switch on real row-level security (manual)

**Files:** none (external)

This is the security switch. Everything before it has been running on the permissive `gympulse_all` policies.

- [ ] **Step 1: Make ownership mandatory**

```sql
alter table programs alter column user_id set not null;
```

If this errors, some program still has a null `user_id` — find it with `select * from programs where user_id is null`, assign it, and retry.

- [ ] **Step 2: Replace every permissive policy**

```sql
drop policy if exists gympulse_all on public.programs;
drop policy if exists gympulse_all on public.schedules;
drop policy if exists gympulse_all on public.workout_logs;
drop policy if exists gympulse_all on public.profiles;

create policy own_programs on public.programs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_schedules on public.schedules
  for all
  using (exists (
    select 1 from public.programs p
    where p.id = schedules.program_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from public.programs p
    where p.id = schedules.program_id and p.user_id = auth.uid()));

create policy own_workout_logs on public.workout_logs
  for all
  using (exists (
    select 1 from public.schedules s
    join public.programs p on p.id = s.program_id
    where s.id = workout_logs.schedule_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from public.schedules s
    join public.programs p on p.id = s.program_id
    where s.id = workout_logs.schedule_id and p.user_id = auth.uid()));

create policy own_profile on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
```

- [ ] **Step 3: Add the avatar storage policies**

```sql
create policy own_avatars_read on storage.objects
  for select using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy own_avatars_write on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy own_avatars_update on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy own_avatars_delete on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 4: Verify as a signed-in user**

Reload the app. Expected: still signed in, all three programs still listed, and creating a plan still works.

- [ ] **Step 5: Verify as an anonymous caller**

This is the test that proves the whole feature. In the SQL editor:

```sql
select count(*) from programs;
```

The SQL editor runs with elevated rights, so this still returns 3 — that is expected and proves nothing. The real check is the app behaving correctly while a bare `curl http://127.0.0.1:8000/programs` returns 401, which Task 5 Step 6 already established.

- [ ] **Step 6: Close signup**

Dashboard → Authentication → Providers → Email → turn **Enable signup** OFF.

Confirm: signing out and attempting to register a new account fails.

---

# Phase 2 — Profile

### Task 7: Profile endpoints

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_profile.py`

**Interfaces:**
- Consumes: `get_supabase`, `get_user_id` from Task 2.
- Produces: `GET /profile` and `PUT /profile`, both returning `{"data": {...}}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_profile.py`:

```python
from conftest import TEST_USER_ID


def test_get_profile_creates_an_empty_one_on_first_access(client, fake_db):
    response = client.get("/profile")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == TEST_USER_ID
    assert data["display_name"] is None
    assert len(fake_db.table("profiles").rows) == 1


def test_get_profile_returns_the_existing_row(client, fake_db):
    fake_db.seed("profiles", [{
        "id": TEST_USER_ID, "display_name": "Siang", "phone": None,
        "birth_year": 1998, "avatar_path": None,
    }])

    response = client.get("/profile")

    assert response.json()["data"]["display_name"] == "Siang"
    assert len(fake_db.table("profiles").rows) == 1


def test_put_profile_updates_permitted_fields(client, fake_db):
    fake_db.seed("profiles", [{
        "id": TEST_USER_ID, "display_name": None, "phone": None,
        "birth_year": None, "avatar_path": None,
    }])

    response = client.put("/profile", json={
        "display_name": "Siang",
        "phone": "0123456789",
        "birth_year": 1998,
        "avatar_path": f"{TEST_USER_ID}/avatar.png",
    })

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["display_name"] == "Siang"
    assert data["birth_year"] == 1998


def test_put_profile_rejects_an_implausible_birth_year(client, fake_db):
    response = client.put("/profile", json={"birth_year": 1200})

    assert response.status_code == 422
```

- [ ] **Step 2: Extend the fake with update support**

The endpoints need `.update(...).eq(...).execute()`, which `FakeTable` does not have. Add to `backend/tests/conftest.py`, alongside `FakeInsert`:

```python
class FakeUpdate:
    """Mimics .update(values).eq(col, val).execute()."""

    def __init__(self, table, values):
        self._table = table
        self._values = values
        self._filters = []

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def execute(self):
        updated = []
        for row in self._table.rows:
            if all(str(row.get(c)) == str(v) for c, v in self._filters):
                row.update(self._values)
                updated.append(row)
        return FakeResponse(updated)
```

and a method on `FakeTable`:

```python
    def update(self, values):
        return FakeUpdate(self, values)
```

Also extend the module docstring's list of fidelity gaps to note that `update` ignores Postgres triggers and defaults, so `updated_at` is not maintained by the fake.

- [ ] **Step 3: Run and watch them fail**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests/test_profile.py -v`

Expected: all four FAIL with 404 — the routes do not exist.

- [ ] **Step 4: Add the model and endpoints**

Add the model beside the others in `backend/app/main.py`:

```python
class ProfileUpdate(BaseModel):
    display_name: str | None = None
    phone: str | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    avatar_path: str | None = None
```

And the endpoints, after `create_program`:

```python
@app.get("/profile")
def get_profile(
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    try:
        existing = db.table("profiles").select("*").eq("id", user_id).execute()
        if len(existing.data) > 0:
            return {"data": existing.data[0]}

        created = db.table("profiles").insert({"id": user_id}).execute()
        if len(created.data) == 0:
            raise HTTPException(status_code=400, detail="Could not create profile.")
        return {"data": created.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/profile")
def update_profile(
    profile: ProfileUpdate,
    db: Client = Depends(get_supabase),
    user_id: str = Depends(get_user_id),
):
    try:
        # exclude_unset so omitting a field leaves it alone rather than nulling it.
        values = profile.model_dump(exclude_unset=True)
        if not values:
            raise HTTPException(status_code=400, detail="No fields to update.")

        response = db.table("profiles").update(values).eq("id", user_id).execute()
        if len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Profile not found.")
        return {"data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 5: Verify**

Run: `../../venv/Scripts/python.exe -m pytest backend/tests -v`

Expected: **21 passed** (17 from Phase 1 plus 4 new).

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_profile.py backend/tests/conftest.py
git commit -m "feat(profile): add profile read and update endpoints"
```

---

### Task 8: Profile UI on the Me tab

**Files:**
- Modify: `frontend/src/tabs/MeTab.jsx`, `frontend/src/api/client.js`, `frontend/src/App.jsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `GET /profile`, `PUT /profile` from Task 7; `useAuth()` from Task 4.
- Produces: `fitnessApi.getProfile()` and `fitnessApi.updateProfile(fields)`.

- [ ] **Step 1: Add the API wrappers**

In `frontend/src/api/client.js`, alongside the existing wrappers:

```js
  // Feature 5: Profile
  getProfile: () => apiClient.get('/profile'),
  updateProfile: (fields) => apiClient.put('/profile', fields),
```

- [ ] **Step 2: Replace the Account placeholder**

In `frontend/src/tabs/MeTab.jsx`, the current Account card reads "Sign in — Accounts are coming soon". Replace it with a real section:

- The signed-in email from `useAuth().user.email`, rendered read-only as a `.row` with `.row-title` "Email" and the address as `.row-sub`. Include a `.dim` note that it cannot be changed here.
- Editable `display_name`, `phone` and `birth_year` in `.input-group`s with `.label`s, loaded from `getProfile()` in a `useEffect` on mount.
- A `btn btn-accent btn-block` Save button calling `updateProfile()`, disabled while saving and while nothing has changed, showing `Saving…` in flight and a brief confirmation afterwards.
- A `btn btn-secondary btn-block` Sign out button calling `signOut()` from `useAuth()`.

`birth_year` uses `type="number"` with `min="1900"` and `max="2100"` to match the backend constraint. Send `null` rather than `""` when a field is cleared, so the column is nulled rather than set to an empty string.

Zero inline styles; add classes to `index.css` if needed.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds, `grep -c "style={{" frontend/src/tabs/MeTab.jsx` prints `0`.

Then in the app: open Me, set a name and birth year, save, reload, and confirm they persisted.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(profile): add editable profile and sign out to the Me tab"
```

---

### Task 9: Avatar upload

**Files:**
- Create: `frontend/src/lib/avatar.js`
- Modify: `frontend/src/tabs/MeTab.jsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: the `avatars` bucket and its policies from Tasks 1 and 6; `updateProfile` from Task 8.
- Produces: `uploadAvatar(file, userId)` returning the stored path, and `avatarUrl(path)` returning a displayable signed URL or `null`.

- [ ] **Step 1: Write the storage helpers**

`frontend/src/lib/avatar.js`:

```js
import { supabase } from './supabase';

// Files live under a folder named for the user id; the storage policies
// require that first path segment to match auth.uid().
export async function uploadAvatar(file, userId) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;
  return path;
}

// The bucket is private, so display needs a time-limited signed URL.
export async function avatarUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
```

- [ ] **Step 2: Wire it into the Me tab**

Above the profile fields, add an avatar row: a circular image when one exists, otherwise a lucide `User` icon in a circular `.surface-2` placeholder, with a "Change photo" button beside it.

The button opens a hidden `<input type="file" accept="image/*">`. On selection: validate the file is an image and under 2 MB (reject with a message otherwise), call `uploadAvatar`, then `updateProfile({ avatar_path })`, then refresh the displayed URL via `avatarUrl`.

Resolve the signed URL in a `useEffect` whenever `avatar_path` changes, holding the result in state — `avatarUrl` is async and cannot be called during render.

Add `.avatar`, `.avatar-placeholder` and `.avatar-row` classes to `index.css`.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds.

Then in the app: upload a photo, confirm it displays, reload and confirm it still displays, and check Storage in the dashboard shows the file under a folder named for your uid.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(profile): add avatar upload to private storage"
```

---

### Task 10: Final sweep

**Files:** as needed

- [ ] **Step 1: Confirm no credentials are committed**

```bash
git grep -nE "sb_publishable|sb_secret|eyJ[A-Za-z0-9_-]{20,}" -- . ':!docs' || echo "no credentials in tracked files"
```

Expected: no matches. If `backend/app/main.py` still shows a hardcoded key, Task 2 Step 4 was not completed properly.

- [ ] **Step 2: Confirm both env files are ignored**

```bash
git check-ignore .env frontend/.env && echo "both ignored"
```

- [ ] **Step 3: Full check**

```bash
../../venv/Scripts/python.exe -m pytest backend/tests -v
cd frontend && npm run lint && npm run build
```

Expected: 21 passed; no new lint entries; build succeeds.

- [ ] **Step 4: Update the README**

Add a short "Configuration" section documenting that `.env` and `frontend/.env` are required, listing the four variable names and pointing at the two `.env.example` files. Update the Getting Started steps so a fresh clone works.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document required environment variables"
```

---

## Self-Review Notes

**Spec coverage:**
- `user_id` on programs only, ownership inherited → Tasks 1, 6
- `profiles` table, email deliberately absent → Tasks 1, 7, 8
- Private `avatars` bucket with per-user folders → Tasks 1, 6, 9
- Per-request Supabase client carrying the JWT → Task 2
- Hardcoded credentials removed, `.env.example` added → Tasks 2, 10
- Migration ordering (nullable → backfill → NOT NULL) → Tasks 1, 6
- Rollout ordering (permissive policies until the JWT path works) → Tasks 1, 5, 6
- Login gate, session persistence, 401 sign-out → Task 4
- Profile endpoints and UI → Tasks 7, 8
- Signup closed → Task 6
- conftest reworked for dependency injection, 12 tests stay green → Task 2
- New auth tests → Tasks 2, 3

**Placeholder scan:** none. Task 4 Step 5, Task 8 Step 2 and Task 9 Step 2 describe UI structure in prose rather than full JSX, but each names the exact classes, props, attributes and behaviours required; the design system they build on is already committed in `index.css`.

**Type consistency:** `get_supabase` and `get_user_id` are defined in Task 2 and referenced by name in Tasks 3, 7 and the conftest overrides. `TEST_USER_ID` is defined in Task 2's conftest and imported in Tasks 3 and 7. `uploadAvatar` / `avatarUrl` are defined in Task 9 and used only there. `getProfile` / `updateProfile` are defined in Task 8 Step 1 and used in Steps 2 and Task 9.

**Known risk:** the fake Supabase client cannot enforce RLS, so no automated test proves the policies in Task 6 are correct. Task 5 Step 6 and Task 6 Step 4 cover this manually. This is the same fidelity gap documented in `conftest.py`, and it is why Task 6 is gated behind a full manual checkpoint.
