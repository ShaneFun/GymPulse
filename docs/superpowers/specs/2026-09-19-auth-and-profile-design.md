# Authentication and Profile — Design

## Problem

GymPulse has no authentication. Every table is protected only by a `gympulse_all` policy of `using (true) with check (true)`, and the browser holds a Supabase publishable key, so anyone with that key can read and write all workout data. The key itself is hardcoded as a fallback in [backend/app/main.py:19-20](../../../backend/app/main.py) and sits in public git history.

The user wants a private account: their data readable only by them, with signup closed so nobody else can create one. They also want a profile — name, email, phone, year of birth, avatar.

## Goals

- A login gate; the app is unusable without a session.
- Workout data scoped to its owner and enforced by the database, not by application code.
- A profile page with editable name, phone, year of birth, and avatar.
- Existing data (3 programs, 2 schedules) preserved and assigned to the user's account.
- No public signup.

## Non-goals

- Multi-user features of any kind — no sharing, no teams, no roles.
- Password reset flows, OAuth providers, or MFA.
- Changing the login email from within the app (see below).
- Reminders, language switching, and iPhone/HTTPS deployment — separate projects.

## Approach

Supabase Auth runs in the browser. The frontend obtains a JWT and forwards it to FastAPI, which constructs a **per-request** Supabase client carrying that JWT, so Postgres sees `auth.uid()` and row-level security performs the actual enforcement.

The alternative — verifying the token in FastAPI and filtering with `.eq("user_id", …)` under a service-role key — was rejected. A service-role key bypasses RLS entirely, so security would rest on never once forgetting a filter, and a single omission would silently expose everything. That is the wrong failure mode for the feature whose entire purpose is privacy. Under the chosen approach the database refuses regardless of backend bugs.

Talking to Supabase directly from the browser and dropping FastAPI from the data path was also considered and rejected: it would mean rewriting the whole data layer and discarding the `/schedules/{id}/advance` endpoint and its 12 passing tests.

## Data model

**`programs`** gains `user_id uuid references auth.users(id) on delete cascade`.

Only `programs` carries an owner. `schedules` and `workout_logs` derive ownership through their parent using an `EXISTS` check in their policies. This keeps one source of truth: a schedule cannot disagree with its program about who owns it, and reassigning a program moves everything with it.

**`profiles`** — new, keyed to the auth user:

```sql
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone        text,
  birth_year   integer check (birth_year is null or birth_year between 1900 and 2100),
  avatar_path  text,
  updated_at   timestamptz not null default now()
);
```

**Email is deliberately absent.** It already exists on `auth.users` as the login identity; duplicating it creates two values that can disagree. The Me page renders it read-only from the session. Changing a login email is an auth operation requiring confirmation on both addresses — out of scope.

**Avatar storage** — a private Supabase Storage bucket named `avatars`, with policies restricting each user to the folder matching their own uid. `profiles.avatar_path` stores the object path, not a URL; the frontend resolves it to a signed URL for display.

## Security model

Every existing `gympulse_all` policy is dropped and replaced:

- `programs` — `user_id = auth.uid()` for all operations, with `with check` on writes.
- `schedules` — `exists (select 1 from programs p where p.id = schedules.program_id and p.user_id = auth.uid())`.
- `workout_logs` — the same shape, joined through `schedules` to `programs`.
- `profiles` — `id = auth.uid()`.
- `storage.objects` in `avatars` — the first path segment must equal `auth.uid()::text`.

Signup is disabled in the Supabase dashboard once the user's account exists. This is a manual step and cannot be done from code.

The hardcoded `SUPABASE_URL` and `SUPABASE_KEY` fallbacks are removed; the backend fails loudly at startup if the environment does not provide them. A committed `.env.example` documents the required names. **The existing publishable key should be rotated** — it is in public git history.

## Migration ordering

Existing rows have no owner, so the order is load-bearing:

1. Add `user_id` as **nullable**.
2. Create the user's account (dashboard or the app's own signup, before signup is closed).
3. Backfill: `update programs set user_id = '<uid>' where user_id is null`.
4. Only then `alter column user_id set not null`.

Doing step 4 before step 3 fails on the existing rows.

## Rollout ordering

The permissive `gympulse_all` policies **stay in place until the JWT path works end to end**, and are swapped for the scoped policies only at the end.

This is not hypothetical caution: enabling RLS before the app could authenticate has already happened once in this project, and the result was every query silently returning empty with writes rejected as `42501`. Swapping policies first would reproduce that.

## Backend changes

`backend/app/main.py` currently creates one module-level `supabase` client shared by all 9 endpoints. That global is removed and replaced with a FastAPI dependency:

- `get_supabase(authorization: Header)` extracts the bearer token, builds a client carrying it, and returns it. A missing or malformed header returns 401.
- All 9 endpoints take `db = Depends(get_supabase)` and use it in place of the global.
- `create_program` stamps `user_id` from the authenticated user.
- New: `GET /profile` returns the caller's profile row, creating an empty one on first access; `PUT /profile` updates `display_name`, `phone`, `birth_year`, `avatar_path`.

Avatar uploads do not pass through FastAPI. The browser uploads directly to Supabase Storage with the user's JWT, and Storage RLS enforces the path. Only `avatar_path` reaches the backend.

## Frontend changes

New dependency: `@supabase/supabase-js`.

- `src/lib/supabase.js` — client built from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/auth/AuthProvider.jsx` — context exposing `session`, `user`, `loading`, `signIn`, `signOut`; subscribes to `onAuthStateChange`.
- `src/auth/LoginScreen.jsx` — email and password form using the existing design system.
- `App.jsx` gates on session: while loading, a spinner; with no session, the login screen; otherwise the app.
- `api/client.js` — a request interceptor attaching `Authorization: Bearer <token>`, and a response interceptor that signs out on 401.
- `MeTab` — the placeholder Account card becomes real: avatar with upload, editable name, phone and birth year, read-only email, and sign out.

## Testing

The 12 existing backend tests reach the fake Supabase client by monkeypatching the module global that this change deletes. `conftest.py` must be reworked to override the `get_supabase` dependency with a fake authed client instead. All 12 must stay green.

New backend tests:
- A request with no `Authorization` header returns 401.
- A request with a malformed header returns 401.
- `create_program` persists the `user_id` taken from the token, not from the request body.
- `GET /profile` creates an empty profile on first access and returns the existing one thereafter.
- `PUT /profile` updates only the permitted fields.

The fake client cannot enforce RLS, so the policies themselves are verified manually against the live database: sign in, confirm your data appears; then query the same tables with an anonymous client and confirm nothing comes back.

Frontend verification is manual (there is no frontend test framework, and adding one stays out of scope): login, wrong-password error, session surviving a refresh, sign out, profile edit persisting, avatar upload and display.

## Risk

This is the largest and most security-sensitive change in the project. It touches all 9 endpoints, the database schema, and the app's entry point. The two failure modes are locking the user out of their own data and leaving data exposed — the rollout ordering above exists to prevent the first, and database-enforced RLS to prevent the second.
