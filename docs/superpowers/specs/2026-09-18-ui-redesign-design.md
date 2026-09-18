# UI Redesign — Design

## Problem

The current interface reads as a generic AI-generated prototype rather than a real fitness app. Four separate issues, all confirmed by the user:

- **Colour:** dark navy with indigo→purple gradients, gradient-filled title text, gradient buttons, and glassmorphism blur cards — the default "AI app" look.
- **Cheapness:** emoji used as iconography throughout (📷 📋 📊 💪 🎉), including in buttons.
- **Layout:** inconsistent spacing drawn from an ad-hoc set of values (2, 3, 6, 7, 10, 11, 13, 14, 18px), cramped data tables and set chips.
- **Typography:** sizes spanning 0.65rem–2.5rem and weights 600–900 with no system; uppercase micro-labels on every field.

The root structural cause is that styling lives in two places with no shared scale: [frontend/src/index.css](../../../frontend/src/index.css) defines classes, while [frontend/src/App.jsx](../../../frontend/src/App.jsx) carries roughly 80 hardcoded inline style objects that bypass them.

## Direction

Soft light "Apple-style" mobile UI, taken from a reference the user supplied: warm off-white ground, oversized bold headings, large-radius white cards floating on soft shadows, a single lime accent, black pill buttons, and thin line icons.

One deliberate adaptation: **the live camera/rep-counter is a dark card** in an otherwise light app. A bright screen washes out the pose overlay and is harder to read at arm's length in a gym. The reference itself mixes a dark calendar card into a light layout, so this reads as part of the aesthetic rather than an inconsistency.

## Goals

Replace the visual language to match that reference, add a fourth "Me" tab, and change no behaviour.

## Non-goals

- **Authentication is explicitly out of scope.** The user wants real accounts with login, but that is a separate project: it requires Supabase Auth, a `user_id` column, real RLS policies replacing the current `using (true)` ones, updates to every API call, and a decision about existing ownerless rows. It gets its own spec. This redesign only reserves a place for it in the Me tab.
- No changes to rep-counting logic, the progression feature, or any endpoint.
- No avatar clusters, segmented pill toolbars, or multi-colour pastel tag systems from the reference beyond the badge use described below.

## Palette

```
--bg           #F2F0ED   warm off-white page ground
--bg-tint      #EDE9E4   faint warm edge tint
--surface      #FFFFFF   cards
--surface-2    #F7F5F2   inputs, chips, inset rows
--surface-dark #111113   camera card, dark surfaces
--text         #0A0A0A
--text-dim     #8E8E93
--text-on-dark #FAFAFA
--accent       #D4F034   lime
--accent-ink   #0A0A0A   text on lime
--pass         #22C55E
--fail         #EF4444
--shadow-sm    0 1px 3px rgba(0,0,0,0.06)
--shadow-md    0 4px 16px rgba(0,0,0,0.05)
```

Rules: no `linear-gradient` on text or buttons; no `backdrop-filter`. Cards are separated by shadow, not borders. The lime accent appears on at most one or two elements per screen — primary action, active tab — never as a large fill. Green and red are reserved exclusively for PASS/FAIL and never used decoratively.

Light theme only. The existing `prefers-color-scheme: light` block is replaced wholesale; the dark palette is removed rather than maintained.

## Typography

Inter is named in the current font stack but never loaded, so the app has been rendering in system fallback. Load Inter (400/500/600/700/800) from Google Fonts. Inter is the cross-platform stand-in for SF Pro, which the reference uses.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Screen heading | 34px | 800 | -0.02em |
| Rep counter | 72px | 800 | -0.03em, `tabular-nums` |
| Section heading | 17px | 600 | -0.01em |
| Body | 15px | 400 | normal |
| Label | 13px | 500 | normal, `--text-dim` |
| Micro | 11px | 500 | normal |

The oversized bold screen heading is the signature element of the reference and appears at the top of every tab.

All numeric displays use `font-variant-numeric: tabular-nums`. This is functional, not cosmetic: the live rep count currently shifts width as digits change while the user is counting.

Uppercase micro-labels are dropped except on stat tiles. The gradient-filled 900-weight title treatment is removed.

## Spacing and shape

Spacing scale: 4, 8, 12, 16, 20, 24, 32. Every current off-scale value snaps to the nearest step.

Radii: cards 24px, inner elements and inputs 16px, pills and buttons 999px. Card padding 20px.

## Icons

`lucide-react` is already a dependency ([package.json](../../../frontend/package.json)) but has never been imported. It replaces all emoji, at `strokeWidth={1.5}` to match the reference's thin line style.

Tab bar: `Camera`, `ClipboardList`, `TrendingUp`, `User`.

## Components

- **Card** — `--surface`, radius 24, padding 20, `--shadow-md`, no border.
- **Dark card** — `--surface-dark`, same radius and shadow, `--text-on-dark`. Used for the camera surface.
- **Button** — primary is a black pill with white text; accent variant is a lime pill with near-black text, used for the single most important action on a screen; secondary is transparent with a hairline border. Minimum height 48px, radius 999px.
- **Icon button** — 40px circle, `--surface-2`, thin icon.
- **Input / select** — `--surface-2`, radius 16, no visible border at rest, accent ring on focus.
- **Badge** — fully round pill; PASS/FAIL in `--pass`/`--fail` at 12% opacity with solid text colour.
- **Stat tile** — large tabular number over a 12px uppercase label, on `--surface-2`.
- **Tab bar** — four items on `--surface` with a top hairline, icon over label, active item in near-black with a lime dot indicator.

## Screens

Every tab opens with the oversized bold heading.

**Workout.** Heading "Workout". The plan selector becomes a card. During an active session the camera is a **dark card** with the rep count at 72px in `--text-on-dark` overlaid, set-progress chips beneath it. The camera auto/manual toggle moves to the Me tab. The progression banner is restyled as a light card with a lime primary action, keeping its exact Confirm/Skip behaviour.

**Plan.** Heading "Plan". Form fields on the consistent input style; the progression increment inputs grouped under a single section heading rather than a long inline label. Plans render as cards showing program, week, exercise and target.

**Progress.** Heading "Progress". The Chart.js line chart is restyled: near-black line, no fill gradient, `--border`-weight grid, `--text-dim` ticks. The history table becomes rows on white cards with consistent column alignment and tabular figures.

**Me (new).**
- Stats computed from existing workout logs: total workouts, current streak, pass rate, and personal best per exercise, as stat tiles.
- Settings: camera auto-start toggle, moved off the Workout screen.
- Account: a placeholder section stating login is coming, reserving the location for the auth project.

The kg/lb unit toggle discussed earlier is **dropped**. It was the only behavioural change in the redesign, it touches weight values that feed the progression maths, and the user has not said they train in pounds. It can be added later as its own small change.

## Camera overlay

Restyle [AICameraCounter.jsx](../../../frontend/src/AICameraCounter.jsx) to sit inside the dark card: skeleton lines white at 60% opacity, joints white, and the measured joint plus its angle readout in `--accent` lime. This replaces the cyan `#00ffcc` / pink `#ff0055` scheme.

## Structural cleanup

- Delete [frontend/src/App.css](../../../frontend/src/App.css) — Vite template leftovers (`.hero`, `#next-steps`, `#docs`, `.ticks`), not imported anywhere.
- Move App.jsx's inline style objects into CSS classes. This is the fix that makes the redesign hold together; without it the file keeps two competing style systems.

## Verification

The project has no frontend test framework (eslint + vite only), and adding one is out of scope. Verification is therefore:

- `npm run lint` — must stay at exactly the pre-existing 10 errors / 1 warning baseline, with no new entries.
- `npm run build` — must succeed.
- Manual pass over all four tabs plus an active camera session, confirming: the rep counter is legible at arm's length against the dark card, no gradients or blur remain, no emoji remain, and the progression banner still behaves identically.
