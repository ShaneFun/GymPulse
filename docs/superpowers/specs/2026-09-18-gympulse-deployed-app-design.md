# GymPulse deployed-app redesign

## Goal

Refresh GymPulse into a responsive, production-ready fitness application while preserving the existing camera rep counter, plan creation, workout logging, and progress analysis workflows. Add real user accounts, profile management, and private per-user data.

## Product experience

The app will use a performance-first "athlete's control room" visual system: a dark, high-contrast interface with a clear workout call to action, live-camera status cues, and responsive navigation. Desktop uses a persistent sidebar; mobile uses a bottom navigation bar. The primary destinations are Workout, Plans, Progress, and Profile.

## Authentication and accounts

Supabase Auth will provide email/password, Google OAuth, and Apple OAuth. Unauthenticated visitors see an authentication screen with sign in, registration, password reset, and provider buttons. Authenticated users retain their session across reloads and can sign out.

The Profile destination supports display name, avatar URL, training goal, measurement units, notification preference, and privacy preference. Account controls expose connected providers, password/security actions where applicable, data-export entry point, and a deliberate account-deletion flow. Google and Apple deployment requires their provider credentials and redirect URLs to be configured in Supabase.

## Data security and migration

Every program, schedule, and workout log is owned by a Supabase Auth user. The database will add `user_id` ownership and row-level security policies that restrict reads and writes to `auth.uid()`. The FastAPI API accepts a bearer token, resolves the authenticated user, and scopes all data operations to that user. The frontend adds the current access token to requests. A `profiles` table holds editable account metadata and is created automatically or by a documented SQL migration.

Existing data without an owner must be assigned to a chosen account by a one-time migration before production row-level security is enabled. No shared data is exposed after the migration.

## Preserved workflows

The app keeps these interactions and business rules unchanged:

- A user creates a programme and its exercise schedule.
- The workout page selects a plan, starts the existing MediaPipe camera counter, records set reps, and saves the completed workout.
- Analysis continues calculating pass/fail and progression recommendations from each schedule's targets.
- Progress continues charting logged workouts and listing history.

The redesign may relocate controls and improve validation/loading/error states, but does not alter rep-counting algorithms or workout evaluation criteria.

## Components and data flow

- `AuthProvider` listens to Supabase session changes and gates the application.
- `AppShell` owns responsive navigation and page layout.
- `WorkoutPage`, `PlansPage`, and `ProgressPage` extract the corresponding existing UI and API interactions from the current monolithic app.
- `ProfilePage` reads and updates the authenticated user's profile and preferences.
- API client attaches the session token; FastAPI verifies it and injects the authenticated user ID before querying Supabase.

## Failure handling and quality

The interface gives clear recovery states for sign-in failures, token expiry, unavailable API/database requests, empty workout history, and camera permission denial. Authentication controls are keyboard-accessible, inputs have visible labels, destructive actions require confirmation, and the responsive shell works at common phone and desktop sizes.

Tests will cover unauthenticated routing, session-token propagation, user-scoped API behavior, profile update validation, and retention of the existing plan/workout/progress flows. Build and lint checks remain required before handoff.
