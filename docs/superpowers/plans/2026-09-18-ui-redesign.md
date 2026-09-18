# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GymPulse's visual language with the soft light "Apple-style" direction from the user's reference — warm off-white ground, oversized bold headings, 24px rounded white cards on soft shadows, a single lime accent, black pill buttons, thin line icons — and add a fourth "Me" tab, without changing any behaviour.

**Architecture:** A design-token layer in `index.css` defines the palette, type scale and spacing. Component classes built on those tokens replace all 89 inline style objects. `App.jsx` (currently ~640 lines holding all four screens) is split into one component per tab, which both makes each screen independently reviewable and stops the file growing further as the Me tab is added. The camera view becomes a dark card so the pose overlay stays legible mid-set.

**Tech Stack:** React 19 + Vite, plain CSS with custom properties (no CSS framework), `lucide-react` for icons (already a dependency, never imported), Inter via Google Fonts, Chart.js for the progress chart.

**Reference spec:** `docs/superpowers/specs/2026-09-18-ui-redesign-design.md`

**Command note:** Work happens in a worktree; run commands from the worktree root. Frontend commands run from `frontend/`.

**Lint baseline (IMPORTANT):** `npm run lint` currently reports **10 errors and 1 warning, all pre-existing**:

- `AICameraCounter.jsx`: unused `React` (1:8), unused `onClose` (94:42), setState-in-effect (122:5, 130:7), use-before-declare (134:34, 137:9), exhaustive-deps warning (141:6)
- `App.jsx`: unused `React` (1:8), unused `useCallback` (1:38), use-before-declare (47:5, 48:5)

Task 1's dead-code removal **fixes four of these** (both unused `React` imports, the unused `useCallback`, and the unused `onClose` prop), so after Task 1 the expected baseline is **6 errors and 1 warning**:

- `AICameraCounter.jsx`: setState-in-effect (×2), use-before-declare (×2), exhaustive-deps warning
- `App.jsx`: use-before-declare (×2)

**Do not attempt to fix those remaining six** — they involve real behaviour (effect ordering and hoisting) and are out of scope. The success criterion for every lint step is: **no NEW entries**. The count may legitimately drop further as code moves out of `App.jsx` into new files. It must never go **up**, and no new entry may point at a line this plan touched.

This eslint config errors on `const` arrow functions referenced before their declaration. Declare every new helper above its first use.

**Behaviour freeze:** No API call, no rep-counting rule, no progression logic changes. If a task seems to require a behaviour change, stop and report it.

---

### Task 1: Design tokens, fonts, and dead-code cleanup

**Files:**
- Modify: `frontend/index.html`, `frontend/src/App.jsx`, `frontend/src/AICameraCounter.jsx`
- Rewrite: `frontend/src/index.css`
- Delete: `frontend/src/App.css`, `frontend/src/assets/`

- [ ] **Step 1: Load Inter**

In `frontend/index.html`, add these three lines inside `<head>`, immediately after the `<meta name="viewport" ...>` line:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Delete dead files**

`frontend/src/App.css` contains Vite template leftovers (`.hero`, `#next-steps`, `#docs`, `.ticks`, `#spacer`) and is imported by nothing — `main.jsx` imports only `index.css`, and `App.jsx` imports no CSS at all.

`frontend/src/assets/` holds `hero.png`, `react.svg` and `vite.svg`. All three were verified unreferenced by any file in `src/` or `index.html`.

```bash
git rm frontend/src/App.css
git rm -r frontend/src/assets
```

Do **not** delete `frontend/public/favicon.svg` — it is referenced by `index.html`. Before deleting `frontend/public/icons.svg`, check whether anything references it:

```bash
grep -rn "icons.svg" frontend/src frontend/index.html || echo "unreferenced — safe to delete"
```

Delete it only if that prints "unreferenced".

- [ ] **Step 3: Remove unused imports**

These are four of the ten pre-existing lint errors, and React 19's JSX transform makes the `React` imports unnecessary.

In `frontend/src/App.jsx`, change the first line from:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
```

to:

```jsx
import { useState, useEffect } from 'react';
```

In `frontend/src/AICameraCounter.jsx`, change the first line from:

```jsx
import React, { useEffect, useRef, useState } from 'react';
```

to:

```jsx
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 4: Remove the unreachable "Use Count" feature**

`AICameraCounter` declares `onApplyCount` and `onClose` props, but `App.jsx` passes neither — it passes only `exerciseLocked`, `autoStart`, `resetKey` and `onRepUpdate`. The entire "Use Count" button is therefore unreachable.

In `frontend/src/AICameraCounter.jsx`:

Change the signature from:

```jsx
function AICameraCounter({ onApplyCount, onClose, onRepUpdate, resetKey = 0, autoStart = false, exerciseLocked = null }) {
```

to:

```jsx
function AICameraCounter({ onRepUpdate, resetKey = 0, autoStart = false, exerciseLocked = null }) {
```

Delete this entire block from the render:

```jsx
        {onApplyCount && (
          <button
            onClick={() => { stopCamera(); onApplyCount(repCount); }}
            disabled={repCount === 0}
            style={{ flex: 1, background: '#4f46e5', color: '#fff', border: 'none', padding: '11px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
          >
            Use Count
          </button>
        )}
```

And delete the now-inaccurate line from the JSDoc comment above the component:

```
 *  onApplyCount(reps)  — called when user presses "Use Count" (optional)
```

- [ ] **Step 5: Drop the unused chart registration**

`App.jsx` registers `BarElement` but renders only a `Line` chart. Remove `BarElement` from both the import and the `ChartJS.register(...)` call, leaving the other registrations untouched.

- [ ] **Step 6: Replace the token layer**

In `frontend/src/index.css`, replace everything from the start of the file through the closing brace of the `@media (prefers-color-scheme: light)` block (i.e. the old `:root` and the light-theme override) with:

```css
:root {
  /* ─── Colour ─── */
  --bg:           #F2F0ED;
  --bg-tint:      #EDE9E4;
  --surface:      #FFFFFF;
  --surface-2:    #F7F5F2;
  --surface-dark: #111113;

  --text:         #0A0A0A;
  --text-dim:     #8E8E93;
  --text-on-dark: #FAFAFA;

  --accent:       #D4F034;
  --accent-ink:   #0A0A0A;

  --pass:         #22C55E;
  --fail:         #EF4444;

  --hairline:     rgba(0, 0, 0, 0.08);
  --shadow-sm:    0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md:    0 4px 16px rgba(0, 0, 0, 0.05);

  /* ─── Shape ─── */
  --r-card:  24px;
  --r-inner: 16px;
  --r-pill:  999px;

  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

There is no dark-theme block. This app is light-only by design.

- [ ] **Step 7: Replace the base layer**

Immediately after the `:root` block, replace the existing `*`, `html, body`, and `body` rules with:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  height: 100%;
  overscroll-behavior: none;
}

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
  line-height: 1.5;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Every number in the app must not jitter as digits change width. */
.tnum,
.rep-counter,
.stat-tile-value,
.set-chip-value {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 8: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: lint drops to **6 errors and 1 warning** (the four unused-import/unused-prop errors are now fixed), with no NEW entries, and `✓ built in <time>`.

The app will look broken at this point — old classes still reference removed variables. That is expected; Task 2 restores them.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/
git commit -m "feat(ui): add design tokens, load Inter, remove dead code"
```

The `-A` is needed here because this step both adds and deletes files.

---

### Task 2: Component classes

Replaces every old component class with the new design system. This is the contract the screen tasks build on — get it exactly right.

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Replace everything below the base layer**

In `frontend/src/index.css`, delete all remaining rules after the `.tnum` block from Task 1 (the old app-shell, header, tab bar, card, typography, form, button, badge, log-item, section-label, quick-tool, container, desktop-override and animation rules) and replace with:

```css
/* ─── App shell ─── */
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  background: var(--bg);
  position: relative;
}

.app-content {
  flex: 1;
  padding: 8px 20px 96px;
}

/* ─── Typography ─── */
.screen-heading {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 12px 0 20px;
}

.section-heading {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 24px 0 12px;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.micro {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
}

.dim { color: var(--text-dim); }

/* ─── Cards ─── */
.card {
  background: var(--surface);
  border-radius: var(--r-card);
  padding: 20px;
  box-shadow: var(--shadow-md);
  margin-bottom: 12px;
}

.card-dark {
  background: var(--surface-dark);
  color: var(--text-on-dark);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  margin-bottom: 12px;
}

.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* ─── Buttons ─── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 0 20px;
  border: none;
  border-radius: var(--r-pill);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.12s ease;
  touch-action: manipulation;
}

.btn:active  { transform: scale(0.97); }
.btn:disabled { opacity: 0.4; cursor: default; transform: none; }

.btn-primary   { background: var(--text);    color: #FFFFFF; }
.btn-accent    { background: var(--accent);  color: var(--accent-ink); }
.btn-secondary { background: transparent;    color: var(--text); border: 1px solid var(--hairline); }
.btn-danger    { background: rgba(239,68,68,0.10); color: var(--fail); }

.btn-row { display: flex; gap: 8px; }
.btn-row .btn { flex: 1; }

.icon-btn {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}

/* ─── Forms ─── */
.input-group { margin-bottom: 16px; }

input, select {
  width: 100%;
  padding: 14px 16px;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: var(--r-inner);
  color: var(--text);
  font-family: inherit;
  font-size: 15px;
  -webkit-appearance: none;
  transition: border-color 0.15s ease;
}

input:focus, select:focus {
  outline: none;
  border-color: var(--accent);
}

.field-row { display: flex; gap: 8px; }
.field-row > div { flex: 1; }

/* ─── Badges ─── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  font-size: 12px;
  font-weight: 600;
}

.badge-pass { background: rgba(34,197,94,0.12);  color: var(--pass); }
.badge-fail { background: rgba(239,68,68,0.12);  color: var(--fail); }

/* ─── Stat tiles ─── */
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-tile {
  background: var(--surface-2);
  border-radius: var(--r-inner);
  padding: 16px;
}

.stat-tile-value {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.stat-tile-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  margin-top: 4px;
}

/* ─── Rep counter (inside the dark camera card) ─── */
.rep-counter {
  font-size: 72px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--text-on-dark);
}

/* ─── Set chips ─── */
.set-chips { display: flex; flex-wrap: wrap; gap: 8px; }

.set-chip {
  min-width: 56px;
  padding: 10px 12px;
  border-radius: var(--r-inner);
  background: var(--surface-2);
  text-align: center;
}

.set-chip-done    { background: rgba(34,197,94,0.12); }
.set-chip-current { background: var(--accent); }
.set-chip-label   { font-size: 11px; font-weight: 600; color: var(--text-dim); }
.set-chip-value   { font-size: 18px; font-weight: 700; }
.set-chip-done .set-chip-label   { color: var(--pass); }
.set-chip-current .set-chip-label { color: var(--accent-ink); opacity: 0.6; }

/* ─── List rows ─── */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--surface);
  border-radius: var(--r-inner);
  padding: 16px;
  margin-bottom: 8px;
  box-shadow: var(--shadow-sm);
}

.row-title { font-size: 15px; font-weight: 600; }
.row-sub   { font-size: 13px; color: var(--text-dim); margin-top: 2px; }

/* ─── Empty state ─── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 20px;
  color: var(--text-dim);
  text-align: center;
}

/* ─── Bottom tab bar ─── */
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  display: flex;
  background: var(--surface);
  border-top: 1px solid var(--hairline);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  z-index: 100;
}

.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
  position: relative;
}

.tab-btn.active { color: var(--text); font-weight: 600; }

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: 4px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

/* ─── Desktop: centre the phone frame ─── */
@media (min-width: 600px) {
  body { background: var(--bg-tint); }
  .app-shell { box-shadow: 0 0 80px rgba(0,0,0,0.08); }
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(ui): add component classes for the new design system"
```

---

### Task 3: App shell, four-tab bar, and screen extraction

Splits `App.jsx`'s four screens into their own components. This is a **structural move with no visual change of its own** — screens keep their existing markup and inline styles here, and Tasks 4–7 restyle them one at a time. Doing it this way keeps each later task to one focused file.

**Files:**
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/tabs/WorkoutTab.jsx`, `frontend/src/tabs/PlanTab.jsx`, `frontend/src/tabs/ProgressTab.jsx`

- [ ] **Step 1: Create the tab components**

Create each file exporting a component that takes everything it needs as props. Move the corresponding JSX **verbatim** out of `App.jsx` — same markup, same inline styles, same handlers. All state stays in `App.jsx` and is passed down.

Props each component receives:

- `WorkoutTab`: `plans, selectedPlan, setSelectedPlan, sessionState, currentSet, completedSets, liveReps, setLiveReps, cameraResetKey, autoCamera, progression, advancing, startSession, doneSet, finishWorkout, confirmProgression, skipProgression, cancelSession`
- `PlanTab`: `plans, planName, setPlanName, planExercise, setPlanExercise, planSets, setPlanSets, planReps, setPlanReps, planWeight, setPlanWeight, planWeightInc, setPlanWeightInc, planRepInc, setPlanRepInc, handleCreatePlan, onStartPlan`
- `ProgressTab`: `workoutHistory, chartData, chartOptions`

`onStartPlan` replaces the inline `() => { resetSession(); setSelectedPlan(p); setActiveTab('counter'); }` — define it in `App.jsx` and pass it down, so `PlanTab` needs neither `resetSession` nor `setActiveTab`.

- [ ] **Step 2: Reduce App.jsx to shell + state**

`App.jsx` keeps all `useState`/`useEffect`, all API handlers, `chartData`/`chartOptions`, and renders:

```jsx
      <main className="app-content">
        {activeTab === 'counter'  && <WorkoutTab  {...workoutProps}  />}
        {activeTab === 'plan'     && <PlanTab     {...planProps}     />}
        {activeTab === 'progress' && <ProgressTab {...progressProps} />}
      </main>
```

- [ ] **Step 3: Rebuild the shell and tab bar with four tabs**

Replace the `<header>` and `<nav>` in `App.jsx`. The header is removed entirely — each screen now carries its own `screen-heading`, which is the reference's pattern.

Add the icon import at the top of `App.jsx`:

```jsx
import { Camera, ClipboardList, TrendingUp, User } from 'lucide-react';
```

Define this above the `App` component (it must be declared above its first use):

```jsx
const TABS = [
  { key: 'counter',  label: 'Workout',  Icon: Camera },
  { key: 'plan',     label: 'Plan',     Icon: ClipboardList },
  { key: 'progress', label: 'Progress', Icon: TrendingUp },
  { key: 'me',       label: 'Me',       Icon: User },
];
```

And render the nav as:

```jsx
      <nav className="tab-bar">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={22} strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </nav>
```

The `me` tab renders nothing until Task 7 — that is expected and temporary.

- [ ] **Step 4: Verify behaviour is unchanged**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries (the count will likely drop as code leaves `App.jsx`), build succeeds.

Then load the app and confirm all three existing tabs still work exactly as before — only the header and tab bar should look different.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/tabs
git commit -m "refactor(ui): split screens into tab components, add four-tab bar"
```

---

### Task 4: Restyle the Workout tab

**Files:**
- Modify: `frontend/src/tabs/WorkoutTab.jsx`

- [ ] **Step 1: Replace every inline style with design-system classes**

Remove all `style={{...}}` from this file. Structure:

- Top: `<h1 className="screen-heading">Workout</h1>`
- **Idle:** plan `<select>` inside a `.card`; the selected plan's target shown as `.card-row` lines; primary action `<button className="btn btn-accent">Start Workout</button>`. Remove the camera auto/manual toggle entirely — it moves to the Me tab in Task 7.
- **Active:** a `.card-dark` containing the `AICameraCounter`, with `Set {currentSet} of {target_sets}` as `.micro` above and the live count as `<div className="rep-counter">{liveReps}</div>`. Beneath the card, `.set-chips` with one `.set-chip.set-chip-done` per completed set and one `.set-chip.set-chip-current` for the set in progress. Actions: `btn btn-accent` for Done Set, `btn btn-secondary` for Cancel, wrapped in `.btn-row`.
- **Done:** a `.card` summarising sets and total reps, `.set-chips` for the breakdown, then either the progression banner or the Save/Discard `.btn-row`.
- **Progression banner:** a `.card` with a `.section-heading` reading `Ready for Week {nextWeek}?`, the target as `.dim` text, and `.btn-row` holding `btn btn-accent` (Confirm, `disabled={advancing}`, label `Creating…` while advancing) and `btn btn-secondary` (Skip).

Replace emoji with lucide icons at `size={18} strokeWidth={1.5}`: `Play` (Start), `Check` (Done Set), `Save`, `ArrowUp` (progression), `PartyPopper` or `Trophy` (complete).

- [ ] **Step 2: Preserve behaviour exactly**

Every `onClick`, every `disabled` condition, and the three-way `sessionState` render must be unchanged. In particular keep: `disabled={liveReps < 1}` on Done Set, `disabled={advancing}` on Confirm, and the `progression ? banner : saveButtons` conditional.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds. Confirm no `style={{` remains: `grep -c "style={{" frontend/src/tabs/WorkoutTab.jsx` should print `0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/tabs/WorkoutTab.jsx
git commit -m "feat(ui): restyle Workout tab"
```

---

### Task 5: Restyle the Plan tab

**Files:**
- Modify: `frontend/src/tabs/PlanTab.jsx`

- [ ] **Step 1: Replace every inline style with design-system classes**

- `<h1 className="screen-heading">Plan</h1>`
- Creation form in a `.card`: each field in `.input-group` with a `.label`; Sets / Reps / Weight in a `.field-row`; the two progression increments in their own `.field-row` under a `<div className="section-heading">Progression</div>` with a `.dim` one-line explanation beneath it, replacing the current long inline label.
- Submit: `<button type="submit" className="btn btn-accent">`, with a `Plus` icon.
- Plan list: `<div className="section-heading">My Plans</div>` then one `.row` per plan — `.row-title` showing `{programName} · Week {week}`, `.row-sub` showing exercise and target, and an `.icon-btn` with a `ChevronRight` icon calling `onStartPlan(p)`.
- Empty state: `.empty` with a `ClipboardList` icon.

- [ ] **Step 2: Preserve behaviour exactly**

Keep `handleCreatePlan` wiring, every `value`/`onChange` binding, and the `min`/`step` attributes on all number inputs (`min="0" step="0.5"` on weight fields, `min="0" step="1"` on the rep increment) — those attributes are load-bearing, they stop negative and fractional values reaching the API.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds, `grep -c "style={{" frontend/src/tabs/PlanTab.jsx` prints `0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/tabs/PlanTab.jsx
git commit -m "feat(ui): restyle Plan tab"
```

---

### Task 6: Restyle the Progress tab

**Files:**
- Modify: `frontend/src/tabs/ProgressTab.jsx`, `frontend/src/App.jsx` (chart options only)

- [ ] **Step 1: Restyle the chart**

In `App.jsx`, replace the `chartData` dataset styling and `chartOptions` with:

```jsx
  const chartData = {
    labels: workoutHistory.map(l => new Date(l.created_at).toLocaleDateString()).reverse(),
    datasets: [{
      label: 'Total Reps',
      data: workoutHistory.map(l => (l.actual_reps || []).reduce((a, b) => a + b, 0)).reverse(),
      borderColor: '#0A0A0A',
      backgroundColor: 'transparent',
      pointBackgroundColor: '#D4F034',
      pointBorderColor: '#0A0A0A',
      pointRadius: 4,
      borderWidth: 2,
      tension: 0.35,
      fill: false,
    }],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
        ticks: { color: '#8E8E93', font: { size: 11 } },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#8E8E93', font: { size: 11 } },
      },
    },
  };
```

- [ ] **Step 2: Rebuild the history list**

In `ProgressTab.jsx`, remove all inline styles.

- `<h1 className="screen-heading">Progress</h1>`
- Chart inside a `.card`, under a `.section-heading` reading "Total Reps Over Time"
- `<div className="section-heading">History</div>` then one `.row` per log: `.row-title` with the exercise name, `.row-sub` with the date and `{setsDone}/{target_sets} sets · {totalReps} reps` (wrap the numbers in `<span className="tnum">`), and a `.badge.badge-pass` / `.badge.badge-fail` on the right showing `PASS` / `FAIL` as text rather than emoji.
- Empty state: `.empty` with a `TrendingUp` icon and the existing copy.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds, `grep -c "style={{" frontend/src/tabs/ProgressTab.jsx` prints `0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/tabs/ProgressTab.jsx frontend/src/App.jsx
git commit -m "feat(ui): restyle Progress tab and chart"
```

---

### Task 7: Build the Me tab

**Files:**
- Create: `frontend/src/tabs/MeTab.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the stats helpers**

Create `frontend/src/tabs/MeTab.jsx`. Declare these **above** the component (the eslint config errors on use-before-declare):

```jsx
import { Camera, LogIn } from 'lucide-react';

const totalReps = (log) => (log.actual_reps || []).reduce((a, b) => a + b, 0);

// Consecutive distinct calendar days ending today or yesterday.
const currentStreak = (history) => {
  const days = [...new Set(
    history.map(l => new Date(l.created_at).toDateString())
  )].map(d => new Date(d).getTime()).sort((a, b) => b - a);

  if (days.length === 0) return 0;

  const DAY = 86400000;
  const today = new Date(new Date().toDateString()).getTime();
  if (days[0] !== today && days[0] !== today - DAY) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1] - days[i] === DAY) streak++;
    else break;
  }
  return streak;
};

const passRate = (history) => {
  if (history.length === 0) return 0;
  const passed = history.filter(l => l.status === 'PASS').length;
  return Math.round((passed / history.length) * 100);
};

// Heaviest weight logged per exercise.
const personalBests = (history) => {
  const best = {};
  for (const log of history) {
    const name = log.exercise_name;
    if (!name) continue;
    const w = log.actual_weight || 0;
    if (!(name in best) || w > best[name]) best[name] = w;
  }
  return Object.entries(best).sort((a, b) => b[1] - a[1]);
};
```

- [ ] **Step 2: Write the component**

```jsx
function MeTab({ workoutHistory, autoCamera, setAutoCamera }) {
  const bests = personalBests(workoutHistory);

  return (
    <div>
      <h1 className="screen-heading">Me</h1>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-value">{workoutHistory.length}</div>
          <div className="stat-tile-label">Workouts</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{currentStreak(workoutHistory)}</div>
          <div className="stat-tile-label">Day Streak</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{passRate(workoutHistory)}%</div>
          <div className="stat-tile-label">Pass Rate</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">
            {workoutHistory.reduce((sum, l) => sum + totalReps(l), 0)}
          </div>
          <div className="stat-tile-label">Total Reps</div>
        </div>
      </div>

      {bests.length > 0 && (
        <>
          <div className="section-heading">Personal Bests</div>
          {bests.map(([name, weight]) => (
            <div className="row" key={name}>
              <div className="row-title">{name}</div>
              <div className="row-title tnum">{weight} kg</div>
            </div>
          ))}
        </>
      )}

      <div className="section-heading">Settings</div>
      <div className="card">
        <div className="card-row">
          <div>
            <div className="row-title">Auto-start camera</div>
            <div className="row-sub">Begin tracking as soon as a set starts</div>
          </div>
          <button
            className={`btn ${autoCamera ? 'btn-accent' : 'btn-secondary'}`}
            style={{ width: 'auto', minHeight: 36, padding: '0 16px', fontSize: 13 }}
            onClick={() => setAutoCamera(a => !a)}
          >
            <Camera size={16} strokeWidth={1.5} />
            {autoCamera ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="section-heading">Account</div>
      <div className="card">
        <div className="card-row">
          <div>
            <div className="row-title">Sign in</div>
            <div className="row-sub">Accounts are coming soon</div>
          </div>
          <LogIn size={20} strokeWidth={1.5} className="dim" />
        </div>
      </div>
    </div>
  );
}

export default MeTab;
```

Note: the one remaining inline style above is a deliberate size override on a single button. If you prefer, add a `.btn-chip` class to `index.css` with those four properties and use that instead — either is acceptable, but do not leave other inline styles in this file.

- [ ] **Step 3: Wire it into App.jsx**

Import `MeTab` and render it:

```jsx
        {activeTab === 'me' && (
          <MeTab
            workoutHistory={workoutHistory}
            autoCamera={autoCamera}
            setAutoCamera={setAutoCamera}
          />
        )}
```

`workoutHistory` entries already carry `exercise_name`, `status` and `actual_weight` — `loadHistory` merges those in from the schedule and the analysis endpoint, so no API change is needed.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds. Load the app, open the Me tab, and confirm the four stat tiles render real numbers and the camera toggle flips.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/tabs/MeTab.jsx frontend/src/App.jsx
git commit -m "feat(ui): add Me tab with training stats and settings"
```

---

### Task 8: Restyle the camera component

**Files:**
- Modify: `frontend/src/AICameraCounter.jsx`

- [ ] **Step 1: Recolour the canvas drawing**

The skeleton is currently cyan `#00ffcc` with pink `#ff0055` joints, which clashes with the new palette. In `drawSkeleton`, change the stroke to `rgba(255,255,255,0.6)` and the joint fill to `#FFFFFF`. In `drawAngleText`, change `ctx.fillStyle` to `#D4F034` and the font to `bold 18px Inter, sans-serif`.

- [ ] **Step 2: Restyle the component chrome**

Remove the 16 inline style objects. The outer wrapper loses its own background and radius — it now sits inside the parent's `.card-dark`, so it must not paint its own. Keep the `<video>` hidden and the `<canvas>` at `width: 100%`.

The floating rep-count badge in the corner is removed: the parent Workout screen now renders the count at 72px via `.rep-counter`, and two counters on one screen is redundant.

Feedback text becomes `.micro` centred on the dark surface. Start/Stop/Reset become `.btn-secondary` sized down, using lucide `Play`, `Square` and `RotateCcw` icons.

- [ ] **Step 3: Preserve behaviour exactly**

Do not touch `onResults`, `calculateAngle`, `smoothAngle`, the `EXERCISE_CONFIGS` map, the rep state machine, or any `useEffect`. This task is presentation only. The lint errors still remaining in this file after Task 1 (setState-in-effect ×2, use-before-declare ×2, exhaustive-deps warning) stay as they are — they involve real effect ordering and are out of scope.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries, build succeeds. Then run a real camera session and confirm reps still count correctly and the skeleton renders white with a lime angle readout.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/AICameraCounter.jsx
git commit -m "feat(ui): restyle camera overlay for the dark card"
```

---

### Task 9: Final sweep and verification

**Files:**
- Modify: whichever files still fail the checks below

- [ ] **Step 1: Confirm no inline styles or emoji survive**

Run from the worktree root:

```bash
grep -rn "style={{" frontend/src/ || echo "no inline styles"
grep -rnE "linear-gradient|backdrop-filter" frontend/src/ || echo "no gradients or blur"
```

Expected: only the single deliberate button override in `MeTab.jsx` (if you kept it), and no gradients or blur anywhere.

- [ ] **Step 2: Confirm no emoji remain in the UI**

```bash
grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" frontend/src/ || echo "no emoji"
```

Expected: no matches.

- [ ] **Step 3: Full check**

Run: `cd frontend && npm run lint && npm run build`

Expected: no NEW lint entries versus the 10 errors / 1 warning baseline, build succeeds.

- [ ] **Step 4: Manual pass**

With both servers running, walk every screen:

1. **Workout idle** — heading, plan selector, Start button
2. **Workout active** — dark camera card, 72px rep count legible at arm's length, set chips
3. **Done → PASS with increments** — progression banner appears, Confirm creates next week
4. **Plan** — create a plan with increments; confirm it appears in the list
5. **Progress** — chart in the new palette, history rows with PASS/FAIL badges
6. **Me** — four stat tiles with real numbers, camera toggle works

- [ ] **Step 5: Commit any fixes**

```bash
git add -A frontend/
git commit -m "fix(ui): final redesign sweep"
```

---

## Self-Review Notes

**Spec coverage:**
- Palette, shape tokens → Task 1
- Typography, Inter loading → Tasks 1–2
- Spacing scale, radii → Task 2
- Icons (lucide, strokeWidth 1.5) → Tasks 3–8
- Components (card, dark card, buttons, inputs, badges, stat tiles, tab bar) → Task 2
- Workout / Plan / Progress / Me screens → Tasks 4, 5, 6, 7
- Camera overlay recolour → Task 8
- Delete App.css, remove inline styles → Tasks 1, 4–8, verified in Task 9
- Light-only, no gradients/blur → Task 1, verified in Task 9

**Dead-code removal** (user request, added after the spec was approved) → Task 1, Steps 2–5:
- `App.css` — Vite template leftovers, imported by nothing
- `src/assets/` — `hero.png`, `react.svg`, `vite.svg`, all verified unreferenced
- Unused `React` imports in both components (React 19 needs no JSX import) and unused `useCallback` in `App.jsx`
- The `onApplyCount` / `onClose` props and the unreachable "Use Count" button in `AICameraCounter.jsx` — neither prop is ever passed
- The unused `BarElement` Chart.js registration

Four of the ten pre-existing lint errors are fixed as a side effect, which is why the baseline is restated as 6 errors / 1 warning from Task 1 onward.

**Beyond the spec:** Task 3 splits `App.jsx` into per-tab components. The spec calls only for moving inline styles into classes, but `App.jsx` is ~640 lines holding four screens and would grow further with the Me tab. Splitting keeps each restyle task to one focused file. It is a pure structural move with no behaviour change, verified before any restyling begins.

**Type consistency:** class names used in Tasks 4–8 are all defined in Task 2 (`card`, `card-dark`, `card-row`, `btn`, `btn-primary`, `btn-accent`, `btn-secondary`, `btn-danger`, `btn-row`, `icon-btn`, `input-group`, `label`, `field-row`, `badge`, `badge-pass`, `badge-fail`, `stat-grid`, `stat-tile`, `stat-tile-value`, `stat-tile-label`, `rep-counter`, `set-chips`, `set-chip`, `set-chip-done`, `set-chip-current`, `set-chip-label`, `set-chip-value`, `row`, `row-title`, `row-sub`, `empty`, `tab-bar`, `tab-btn`, `screen-heading`, `section-heading`, `micro`, `dim`, `tnum`). The `me` tab key introduced in Task 3 is consumed in Task 7.

**Known gap:** the lint baseline is expressed as "no new entries" rather than a fixed count, because moving code out of `App.jsx` legitimately changes which file reports the pre-existing unused-import and use-before-declare errors.
