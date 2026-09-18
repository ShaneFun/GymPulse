# UI Redesign — Design

## Problem

The current interface reads as a generic AI-generated prototype rather than a real fitness app. Four separate issues, all confirmed by the user:

- **Colour:** dark navy with indigo→purple gradients, gradient-filled title text, gradient buttons, and glassmorphism blur cards — the default "AI app" look.
- **Cheapness:** emoji used as iconography throughout (📷 📋 📊 💪 🎉), including in buttons.
- **Layout:** inconsistent spacing drawn from an ad-hoc set of values (2, 3, 6, 7, 10, 11, 13, 14, 18px), cramped data tables and set chips.
- **Typography:** sizes spanning 0.65rem–2.5rem and weights 600–900 with no system; uppercase micro-labels on every field.

The root structural cause is that styling lives in two places with no shared scale: [frontend/src/index.css](../../../frontend/src/index.css) defines classes, while [frontend/src/App.jsx](../../../frontend/src/App.jsx) carries roughly 80 hardcoded inline style objects that bypass them.

## Goals

Replace the visual language with a high-contrast athletic direction optimised for the app's real usage context: glancing at a propped-up phone mid-set, from about a metre away, in variable gym lighting. Add a fourth "Me" tab. Change no behaviour.

## Non-goals

- **Authentication is explicitly out of scope.** The user wants real accounts with login, but that is a separate project: it requires Supabase Auth, a `user_id` column, real RLS policies replacing the current `using (true)` ones, updates to every API call, and a decision about existing ownerless rows. It gets its own spec. This redesign only reserves a place for it in the Me tab.
- No changes to rep-counting logic, the progression feature, or any endpoint.
- No light theme.

## Direction

**Athletic / high-contrast.** Near-black ground, a single warm accent used sparingly, oversized numerals, no gradients and no blur.

## Palette

```
--bg          #0A0A0B    near-black page ground
--surface     #141416    cards
--surface-2   #1C1C1F    inputs, chips
--border      rgba(255,255,255,0.08)
--text        #FAFAFA
--text-dim    #8A8A93
--accent      #FF5C1A    orange — primary actions and active states only
--pass        #22C55E
--fail        #EF4444
```

Rules: no `linear-gradient` anywhere; no `backdrop-filter`. The accent is reserved for primary actions, the active tab, and the highlighted joint in the camera overlay. Green and red are reserved exclusively for PASS/FAIL semantics and never used decoratively.

**Dark only.** The existing half-finished `prefers-color-scheme: light` block is removed rather than maintained — this direction has no light counterpart worth double-maintaining.

## Typography

Inter is named in the current font stack but never actually loaded, so the app has been rendering in system fallback. Load Inter (weights 400/600/700/800) from Google Fonts.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Rep counter | 72px | 800 | `tabular-nums` |
| Screen title | 24px | 700 | |
| Section heading | 17px | 600 | |
| Body | 15px | 400 | |
| Label | 12px | 600 | uppercase, used sparingly |
| Micro | 11px | 500 | timestamps, units |

All numeric displays use `font-variant-numeric: tabular-nums`. This is functional, not cosmetic: the live rep count currently shifts width as digits change while the user is counting.

The gradient-filled 900-weight title treatment is removed.

## Spacing and shape

A strict 4px scale: 4, 8, 12, 16, 24, 32. Card padding is uniformly 16px, border radius uniformly 12px. Every current off-scale value is snapped to the nearest step.

## Icons

`lucide-react` is already a dependency ([package.json](../../../frontend/package.json)) but has never been imported. It replaces all emoji.

Tab bar: `Camera`, `ClipboardList`, `TrendingUp`, `User`. Buttons and empty states take appropriate icons at 20px, `currentColor`.

## Components

- **Card** — `--surface`, 1px `--border`, radius 12, padding 16. No shadow, no blur.
- **Button** — primary is solid `--accent` with near-black text; secondary is transparent with a 1px border; destructive uses `--fail`. Minimum height 48px.
- **Input / select** — `--surface-2`, 1px border, radius 12, accent border on focus with no glow ring.
- **Badge** — PASS/FAIL pills in `--pass`/`--fail` at 12% opacity with a solid text colour.
- **Stat tile** — large tabular number over a 12px uppercase label; used on the Me tab.
- **Tab bar** — four items, icon over label, active item in `--accent`.

## Screens

**Workout.** The rep counter becomes the dominant element at 72px. Set-progress chips get consistent sizing and spacing. The camera auto/manual toggle moves to the Me tab. The progression banner is restyled flat, keeping its exact Confirm/Skip behaviour.

**Plan.** Form fields on the consistent input style; the progression increment inputs are grouped under a single heading rather than a long inline label. The plan list becomes cards showing program, week, exercise and target.

**Progress.** The Chart.js line chart is restyled to the new palette (accent line, `--border` grid, `--text-dim` ticks, no fill gradient). The history table is rebuilt as rows with consistent column alignment and tabular figures.

**Me (new).**
- Stats computed from existing workout logs: total workouts, current streak, pass rate, and personal best per exercise.
- Settings: camera auto-start toggle (moved off the Workout screen), and a kg/lb unit toggle.
- Account: a placeholder section stating that login is coming, reserving the location for the auth project.

## Units toggle — the one behavioural change

Every other item in this spec is presentational. The kg/lb toggle is not, so its semantics are fixed here:

- **Storage is always kilograms.** No stored value is ever converted.
- The preference persists in `localStorage` under `gympulse.units`, defaulting to `kg`.
- When `lb` is active, displayed weights are converted (`kg × 2.20462`) and rounded to one decimal, and weight *inputs* are interpreted as pounds and converted back to kilograms on submit.
- The unit suffix is rendered from the active preference rather than hardcoded as `kg`.

## Structural cleanup

- Delete [frontend/src/App.css](../../../frontend/src/App.css) — Vite template leftovers (`.hero`, `#next-steps`, `#docs`, `.ticks`), not imported anywhere.
- Move App.jsx's inline style objects into CSS classes. This is the fix that makes the redesign hold together; without it the file keeps two competing style systems.

## Camera overlay

Restyle [AICameraCounter.jsx](../../../frontend/src/AICameraCounter.jsx): skeleton lines white at 60% opacity, joints white, the measured joint and its angle readout in `--accent`. This replaces the cyan `#00ffcc` / pink `#ff0055` scheme, which clashes with the new palette.

## Verification

The project has no frontend test framework (eslint + vite only), and adding one is out of scope. Verification is therefore:

- `npm run lint` — must stay at exactly the pre-existing 10 errors / 1 warning baseline, with no new entries.
- `npm run build` — must succeed.
- Manual pass over all four tabs plus an active camera session, confirming: rep counter legible at arm's length, no gradients or blur remaining, no emoji remaining, progression banner still behaves identically, and the units toggle converting both display and input correctly.
