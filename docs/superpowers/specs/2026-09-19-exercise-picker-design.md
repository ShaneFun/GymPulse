# Exercise Picker — Design

## Problem

Choosing an exercise when creating a plan is a bare `<select>` dropdown listing eight text labels. Nothing shows what the movement actually is, which matters here because the app's rep counting depends on performing a specific movement that the pose tracker recognises. The user asked for pictures alongside the choices, or a dedicated page for choosing.

## Goals

Replace the dropdown with a full-screen picker showing a drawn figure for each exercise. Change no exercise keys, no rep-counting behaviour, and no API calls.

## Non-goals

- The Workout tab's plan selector (which picks a saved *plan*, not an exercise) is unchanged.
- No new exercises are added; the eight keys in `EXERCISE_CONFIGS` stay exactly as they are.
- No photographic or animated imagery, and no image files — see below.

## Imagery

Hand-authored inline SVG line figures, one per exercise, on a `0 0 64 64` viewBox using `stroke="currentColor"` at a weight matching the app's lucide icons (1.5 at 24px, scaled proportionally).

Rationale: the project has no image assets and no licensed source for exercise photography; inline SVG adds no network requests, scales without artefacts, inherits theme colour automatically, and stays consistent with the thin-line icon language established in the redesign. It also echoes the app's own pose-skeleton overlay.

Each figure depicts the movement's characteristic position:

| Exercise key | Depiction |
|---|---|
| `bicep_curl` | standing, forearm raised at the elbow |
| `squat` | side view, hips back, knees bent |
| `pushup` | side view, body horizontal, arms bent |
| `situp` | side view, torso lifted, knees up |
| `lateral_raise` | front view, arms straight out to the sides |
| `overhead_press` | front view, arms extended overhead |
| `pullup` | hanging from a bar, arms bent |
| `crunch` | side view, small torso lift, knees bent |

These are deliberately simple, recognisable figures rather than anatomical illustrations. The user has accepted that tradeoff explicitly.

## Components

**`ExerciseFigure`** — takes an `exercise` key and an optional `size` (default 64), returns the matching inline SVG. Unknown keys render a neutral fallback figure rather than throwing, so a future exercise added to `EXERCISE_CONFIGS` without a drawing degrades gracefully instead of crashing the picker.

**`ExercisePicker`** — a fixed full-screen overlay containing a close button, a "Choose Exercise" heading, and a two-column grid of cards. Each card is a `<button>` holding the figure above the exercise label. The currently-selected card is marked with a lime border and a check icon. Selecting calls back with the key and closes.

Because the app has no router, this is an overlay driven by local state, not a route. A consequence worth noting: the Plan form's other fields keep their state underneath while the picker is open, which is the desired behaviour.

## Plan tab integration

The exercise `<select>` is replaced by a tappable row showing the selected exercise's figure, its label, and a chevron. Tapping opens the picker. The `planExercise` / `setPlanExercise` props are unchanged — only the input mechanism differs.

## Accessibility

Replacing a native `<select>` means re-implementing what it provided for free:

- Cards are real `<button type="button">` elements, so they are keyboard-reachable and activate on Enter/Space.
- The overlay is `role="dialog"` with `aria-modal="true"` and is labelled by its heading.
- Escape closes the picker.
- Focus moves into the picker when it opens and returns to the trigger when it closes.
- The selected card carries `aria-current="true"`.
- Each SVG has `role="img"` and a `<title>` naming the exercise; decorative strokes are not separately announced.
- Body scroll is locked while the overlay is open.

## Verification

The project has no frontend test framework (eslint + vite only), and adding one remains out of scope.

- `npm run lint` — no new entries beyond the 5 errors / 1 warning baseline.
- `npm run build` — succeeds.
- Manual: open the picker from the Plan tab, confirm all eight figures render and are distinguishable, select one and confirm the Plan form updates, create a plan and confirm the correct `exercise_name` reaches the API, and confirm Escape and keyboard navigation work.
