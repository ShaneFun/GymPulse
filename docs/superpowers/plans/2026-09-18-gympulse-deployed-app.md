# GymPulse Deployed App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive GymPulse application with Supabase authentication, private user-owned workout data, and a functional profile/account area while retaining the existing workout workflows and rep-counting logic.

**Architecture:** The React client owns Supabase Auth state and supplies a bearer token to FastAPI. FastAPI verifies that token with a verification-only client, then creates a request-scoped Supabase data client using the browser-safe anon/publishable key and that bearer token; this preserves RLS for every table operation. A service-role key is never exposed to the browser or used for normal user data access. The current monolithic React page is split into focused pages within a common responsive shell; the MediaPipe counter is retained unchanged behind the workout-session page.

**Tech Stack:** React 19, Vite 8, Supabase Auth/JavaScript SDK, FastAPI, Pydantic, supabase-py, Chart.js, Vitest/React Testing Library, SQL migrations.

---

## File structure

- Create `supabase/migrations/20260918_user_owned_data.sql`: profile table, nullable ownership columns, indexes, and the legacy-data backfill runbook.
- Create `supabase/migrations/20260919_enforce_user_owned_data.sql` only in a separately released change after the backfill checks pass: non-null ownership enforcement and RLS policies.
- Create `frontend/src/lib/supabase.js`: environment-backed browser Supabase client.
- Create `frontend/src/auth/AuthProvider.jsx`: session subscription, profile loading, and auth actions.
- Create `frontend/src/auth/RequireAuth.jsx`: loading, redirect, and session guard.
- Create `frontend/src/pages/AuthPage.jsx`: sign-in, registration, reset-password, Google, and Apple UI.
- Create `frontend/src/pages/ProfilePage.jsx`: editable profile/preferences and account controls.
- Create `frontend/src/components/AppShell.jsx`: accessible responsive navigation and account menu.
- Create `frontend/src/pages/WorkoutPage.jsx`, `PlansPage.jsx`, `ProgressPage.jsx`: extracted existing experiences.
- Create `frontend/src/api/client.test.js`, `frontend/src/auth/AuthProvider.test.jsx`, `backend/tests/test_auth_scope.py`, `backend/tests/test_account_actions.py`: focused client and API security tests.
- Modify `frontend/src/App.jsx`, `frontend/src/App.css`, `frontend/src/index.css`, `frontend/src/api/client.js`, `frontend/package.json`, `frontend/.env.example`: application composition, styling, token handling, test tooling, and deployment configuration.
- Modify `backend/app/main.py`, `requirements.txt`, `.env.example`, `README.md`: JWT verification, user-scoped endpoints, CORS/configuration, and operator instructions.

## Chunk 1: secure accounts and data

### Task 1: Add the database migration

**Files:**
- Create: `supabase/migrations/20260918_user_owned_data.sql`
- Test: Supabase SQL editor or local Supabase migration validation

- [ ] **Step 1: Add nullable ownership columns and the profile table only**

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  fitness_goal text,
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  notifications_enabled boolean not null default true,
  profile_private boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.programs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.schedules add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists programs_user_id_idx on public.programs(user_id);
create index if not exists schedules_user_id_idx on public.schedules(user_id);
create index if not exists workout_logs_user_id_idx on public.workout_logs(user_id);
```

- [ ] **Step 2: Write an explicit, operator-supplied legacy-data backfill runbook**

```sql
-- Replace USER_UUID only after the operator confirms the account that owns
-- legacy data. Run once before the enforcement migration:
update public.programs set user_id = 'USER_UUID' where user_id is null;
update public.schedules set user_id = 'USER_UUID' where user_id is null;
update public.workout_logs set user_id = 'USER_UUID' where user_id is null;
select count(*) from public.programs where user_id is null;
select count(*) from public.schedules where user_id is null;
select count(*) from public.workout_logs where user_id is null;
```

- [ ] **Step 3: Release and deploy only the nullable-column migration, then run and verify the production backfill**

Do not create or include the enforcement migration in this deployment or CI migration batch. The operator applies `20260918_user_owned_data.sql`, chooses and supplies the legacy owner, runs the three updates, and records all-zero ownership counts.

- [ ] **Step 4: In a subsequent release, create and deploy `supabase/migrations/20260919_enforce_user_owned_data.sql` only after the recorded checks are zero**

```sql
alter table public.programs alter column user_id set not null;
alter table public.schedules alter column user_id set not null;
alter table public.workout_logs alter column user_id set not null;
```

- [ ] **Step 5: Add correct RLS policies after ownership enforcement, including parent ownership checks**

```sql
alter table public.programs enable row level security;
create policy "users manage own programs" on public.programs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.profiles enable row level security;
create policy "users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

alter table public.schedules enable row level security;
create policy "users manage own schedules" on public.schedules
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.programs p
      where p.id = program_id and p.user_id = auth.uid()
    )
  );

alter table public.workout_logs enable row level security;
create policy "users manage own workout logs" on public.workout_logs
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.schedules s
      where s.id = schedule_id and s.user_id = auth.uid()
    )
  );
```

The `WITH CHECK` predicates above must remain in place even though FastAPI also validates parent records: an authenticated user can otherwise call Supabase/PostgREST directly and attach their own child row to another user’s parent. Do not refer to `profiles.user_id`, because the profile primary key is the Auth user ID.

- [ ] **Step 6: Verify the migrations in a non-production Supabase project**

Run: apply the migration in Supabase SQL Editor.

Expected: all tables and policies are created; an authenticated user cannot select another user’s rows.

- [ ] **Step 7: Commit the first migration release**

```bash
git add supabase/migrations/20260918_user_owned_data.sql
git commit -m "feat: add nullable workout data ownership"
```

- [ ] **Step 8: After production backfill evidence is recorded, commit the enforcement release**

```bash
git add supabase/migrations/20260919_enforce_user_owned_data.sql
git commit -m "feat: enforce user-owned workout data"
```

### Task 2: Make FastAPI authenticate and scope all records

**Files:**
- Modify: `backend/app/main.py`
- Modify: `requirements.txt`
- Create: `backend/tests/test_auth_scope.py`

- [ ] **Step 1: Write failing tests for missing tokens and user-scoped inserts/queries**

```python
def test_programs_require_bearer_token(client):
    assert client.get('/programs').status_code == 401

def test_create_program_sets_authenticated_user_id(client, auth_headers, fake_supabase):
    client.post('/programs', headers=auth_headers, json={'name': 'Strength'})
    assert fake_supabase.inserted['user_id'] == 'user-123'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest backend/tests/test_auth_scope.py -v`

Expected: FAIL because the API does not require or scope authentication.

- [ ] **Step 3: Implement a FastAPI `get_current_user` dependency**

Use `HTTPBearer(auto_error=False)`, return 401 for absent/invalid tokens, call a verification-only Supabase client’s `auth.get_user(token)`, and return only the verified user ID. Do not trust a user ID supplied by the client. Construct a separate request-scoped data client with `SUPABASE_ANON_KEY` and the user token so RLS applies to table operations. Keep any `SUPABASE_SERVICE_ROLE_KEY` out of normal request code and out of browser configuration.

- [ ] **Step 4: Inject the dependency into every programme, schedule, log, and analysis route**

Set `user_id` on inserts and add `.eq('user_id', user_id)` to every select/query. When creating a schedule/log, additionally verify that its parent programme/schedule belongs to the same user; return 404 for cross-user IDs. Make analysis return 404, not an empty history, if the requested schedule cannot be selected by the current user.

- [ ] **Step 5: Run focused API tests**

Run: `pytest backend/tests/test_auth_scope.py -v`

Expected: PASS, including cross-user schedule creation, log creation, and analysis requests returning 404.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_auth_scope.py requirements.txt
git commit -m "feat: secure API data by authenticated user"
```

### Task 3: Add Supabase Auth and authenticated API requests in React

**Files:**
- Create: `frontend/src/lib/supabase.js`
- Create: `frontend/src/auth/AuthProvider.jsx`
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/package.json`
- Create: `frontend/.env.example`
- Test: `frontend/src/api/client.test.js`, `frontend/src/auth/AuthProvider.test.jsx`

- [ ] **Step 1: Write failing tests for token attachment and auth-state rendering**

```jsx
it('adds the current access token to API requests', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
  await apiClient.get('/programs');
  expect(requestHeaders.authorization).toBe('Bearer token');
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `npm run test -- --run frontend/src/api/client.test.js frontend/src/auth/AuthProvider.test.jsx`

Expected: FAIL because Supabase Auth and test tooling do not exist.

- [ ] **Step 3: Install and configure `@supabase/supabase-js`, Vitest, and Testing Library**

Create the browser client only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are supplied. Document these plus `VITE_API_URL` in `.env.example`; never hard-code the current publishable key or API URL.

- [ ] **Step 4: Implement `AuthProvider` and the Axios request interceptor**

Expose session, user, profile, sign-in, sign-up, OAuth sign-in, reset password, sign-out, and profile refresh. Use `onAuthStateChange` and clean up its subscription. The interceptor reads the current session and sets `Authorization: Bearer <token>` only when one exists.

- [ ] **Step 5: Re-run focused frontend tests**

Run: `npm run test -- --run frontend/src/api/client.test.js frontend/src/auth/AuthProvider.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env.example frontend/src/lib/supabase.js frontend/src/auth frontend/src/api/client.js
git commit -m "feat: add Supabase authentication client"
```

## Chunk 2: product shell and preserved fitness experience

### Task 4: Create the login and account-recovery experience

**Files:**
- Create: `frontend/src/pages/AuthPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/pages/AuthPage.test.jsx`

- [ ] **Step 1: Write failing tests for sign-in, registration, reset/recovery completion, and OAuth actions**

```jsx
it('starts Google OAuth after the provider button is pressed', async () => {
  render(<AuthPage />);
  await user.click(screen.getByRole('button', { name: /continue with google/i }));
  expect(signInWithOAuth).toHaveBeenCalledWith('google');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- --run frontend/src/pages/AuthPage.test.jsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement accessible auth and recovery screens**

Add sign-in/sign-up mode, email/password form validation, clear asynchronous errors, reset-email confirmation, Google/Apple controls, and a recovery-session new-password screen with confirmation/validation. OAuth and recovery redirects must use `window.location.origin`; configure matching redirect URLs in Supabase before deployment.

- [ ] **Step 4: Gate the application and recover from an expired session in `App.jsx`**

Render a loading state while AuthProvider initializes, AuthPage when no session exists, and the protected shell when a session exists. On a 401 response, clear stale local auth state and return to AuthPage with a sign-in-again message. Add tests covering direct unauthenticated access to the protected shell and token expiry. Preserve camera page state only within a logged-in session.

- [ ] **Step 5: Re-run the auth-page test**

Run: `npm run test -- --run frontend/src/pages/AuthPage.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/AuthPage.jsx frontend/src/pages/AuthPage.test.jsx
git commit -m "feat: add sign-in and recovery screens"
```

### Task 5: Split and preserve workout, plan, and progress features

**Files:**
- Create: `frontend/src/pages/WorkoutPage.jsx`
- Create: `frontend/src/pages/PlansPage.jsx`
- Create: `frontend/src/pages/ProgressPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/pages/WorkoutPage.test.jsx`, `PlansPage.test.jsx`, `ProgressPage.test.jsx`

- [ ] **Step 1: Write failing regression tests using the current user-visible flows**

```jsx
it('saves the existing completed-set payload after using the camera count', async () => {
  render(<WorkoutPage plans={[plan]} />);
  // select plan, start, simulate set completion, finish, and save
  expect(logWorkout).toHaveBeenCalledWith(expect.objectContaining({ schedule_id: plan.id }));
});
```

- [ ] **Step 2: Run the page tests to verify they fail**

Run: `npm run test -- --run frontend/src/pages/WorkoutPage.test.jsx frontend/src/pages/PlansPage.test.jsx frontend/src/pages/ProgressPage.test.jsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Extract the existing state and handlers without changing business rules**

Move the existing programme/schedule creation, plan selection, set progression, `AICameraCounter` props, workout-log payload, analysis loading, Chart.js configuration, and pass/fail presentation into the three pages. Retain all target comparison rules exactly as in the current app.

- [ ] **Step 4: Add explicit loading, empty, and API-error states**

Keep retry actions local to each page and do not obscure the camera-permission state supplied by `AICameraCounter`.

- [ ] **Step 5: Re-run the regression tests**

Run: `npm run test -- --run frontend/src/pages/WorkoutPage.test.jsx frontend/src/pages/PlansPage.test.jsx frontend/src/pages/ProgressPage.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/WorkoutPage.jsx frontend/src/pages/PlansPage.jsx frontend/src/pages/ProgressPage.jsx frontend/src/pages/*.test.jsx
git commit -m "refactor: separate preserved fitness workflows into pages"
```

### Task 6: Build the responsive application shell and profile page

**Files:**
- Create: `frontend/src/components/AppShell.jsx`
- Create: `frontend/src/pages/ProfilePage.jsx`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/pages/ProfilePage.test.jsx`, `frontend/src/components/AppShell.test.jsx`, `backend/tests/test_account_actions.py`

- [ ] **Step 1: Write failing navigation, profile validation, and profile-save tests**

```jsx
it('saves profile preferences for the current user', async () => {
  render(<ProfilePage />);
  await user.clear(screen.getByLabelText(/display name/i));
  await user.type(screen.getByLabelText(/display name/i), 'Sam');
  await user.click(screen.getByRole('button', { name: /save profile/i }));
  expect(upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Sam' }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- --run frontend/src/pages/ProfilePage.test.jsx frontend/src/components/AppShell.test.jsx`

Expected: FAIL because the shell and profile page do not exist.

- [ ] **Step 3: Implement the dark performance-first shell**

Use semantic nav elements, Lucide icons with accessible names, a desktop side rail, mobile bottom navigation, an active-route indicator, and an account trigger. Make focus styles, contrast, and touch targets production-ready. Do not constrain desktop to the existing phone-frame width.

- [ ] **Step 4: Implement the functional profile/account controls**

Load/upsert profile data by `user.id`; validate avatar URLs, enumerated units, and max text lengths before saving. Add display name, avatar URL with initials fallback, goal, units, notifications, privacy, sign-out, email display, connected provider list from `user.identities`, and a password-reset email action. Implement `GET /account/export`, protected by the current user token, returning JSON with only that user’s profile, programmes, schedules, and logs. Implement `POST /account/delete` accepting `{ confirmation: 'DELETE', password?: string }`, protected by the current user token. For password users, the server verifies the supplied password through Supabase Auth before an admin-only server client calls `auth.admin.delete_user(current_user_id)`. For OAuth-only identities, do not claim a fresh provider re-auth guarantee that Supabase does not expose server-side: require a valid current session and typed confirmation, clearly explain this limitation in the confirmation dialog, and provide a support-contact fallback for users who need stronger identity verification. Foreign-key cascades remove profile and workout data. Test export isolation, missing/invalid token rejection, confirmation cancellation, invalid confirmation, invalid password rejection for password users, and successful self deletion; never accept a target user ID from the client.

- [ ] **Step 5: Re-run navigation and profile tests**

Run: `npm run test -- --run frontend/src/pages/ProfilePage.test.jsx frontend/src/components/AppShell.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AppShell.jsx frontend/src/pages/ProfilePage.jsx frontend/src/App.css frontend/src/index.css frontend/src/pages/ProfilePage.test.jsx frontend/src/components/AppShell.test.jsx backend/app/main.py backend/tests/test_account_actions.py
git commit -m "feat: add responsive shell and profile settings"
```

## Chunk 3: deployment readiness

### Task 7: Configure deployment safety, documentation, and final verification

**Files:**
- Modify: `backend/app/main.py`
- Modify: `frontend/.env.example`
- Modify: `.env.example`
- Modify: `README.md`
- Test: all frontend and backend tests

- [ ] **Step 1: Write a failing configuration test for production CORS origin parsing**

```python
def test_cors_origins_are_read_from_environment(monkeypatch):
    monkeypatch.setenv('CORS_ORIGINS', 'https://app.example.com')
    assert load_cors_origins() == ['https://app.example.com']
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pytest backend/tests/test_config.py -v`

Expected: FAIL because origins are hard-coded.

- [ ] **Step 3: Implement environment-driven production configuration**

Read Supabase URL, `SUPABASE_ANON_KEY`, required server-only `SUPABASE_SERVICE_ROLE_KEY` (because the approved delete-account flow needs it), and comma-separated CORS origins from environment variables. Remove fallback credentials from source. Validate required server configuration at startup and expose account deletion only when the server confirms its admin capability; otherwise fail startup in production rather than show a broken destructive action. Document that only the anon/publishable key can be shipped via `VITE_*`, that the service-role key must remain server-only, frontend redirect URLs, Supabase Google/Apple provider setup, recovery redirect, RLS migration/backfill and its mandatory ordering, API URL, and required secrets.

- [ ] **Step 4: Run the complete verification suite**

Run: `pytest backend/tests -v`

Expected: PASS.

Run: `npm run test -- --run`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS and a production bundle is emitted.

- [ ] **Step 5: Manually verify the deployed-flow checklist**

1. Email registration and verification works.
2. Google and Apple redirect back to the configured application URL.
3. A user cannot access another user’s programme URL or API data.
4. Profile settings persist after reload.
5. Camera permissions, rep counting, plan creation, logging, and progress analysis still work.
6. Mobile and desktop navigation are keyboard- and touch-accessible.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py frontend/.env.example .env.example README.md backend/tests/test_config.py
git commit -m "docs: document secure GymPulse deployment"
```
