<div align="center">
  <h1>💪 GymPulse</h1>
  <p><strong>Counts your gym reps through your camera. The video never leaves your device.</strong></p>

  <a href="https://github.com/ShaneFun/GymPulse/actions/workflows/ci.yml"><img src="https://github.com/ShaneFun/GymPulse/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/MediaPipe_Pose-orange?style=flat-square&logo=google&logoColor=white" alt="MediaPipe" />

  <br /><br />
  <img src="docs/demo.gif" alt="GymPulse counting bicep curl reps, then starting the rest timer" width="300" />
</div>

## What it does

- **Counts reps** for 8 exercises from the camera, and calls them out loud
- **Plans** multi-exercise workouts with weekly targets and rest timers
- **Grades** each session PASS / FAIL and offers next week's heavier plan when you pass
- **Tracks** your history in a calendar and charts
- **Keeps data private**: login with Supabase, every row scoped to its owner

## Tech stack

| | |
|---|---|
| AI | MediaPipe Pose, running in the browser |
| Frontend | React 19, Vite, Chart.js |
| Backend | Python, FastAPI |
| Database & login | Supabase (PostgreSQL, Auth, Storage) |
| Tests & CI | pytest, ESLint, GitHub Actions |

## Run it

You need Python 3.11+, Node.js 18+ and a Supabase project.

**1. Add your Supabase details** (project URL + publishable key):

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

**2. Start the backend**

```bash
python -m venv venv
venv\Scripts\activate            # macOS / Linux: source venv/bin/activate
pip install -r requirements.txt
python backend/app/main.py
```

**3. Start the frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign up.

**On your phone:** the camera needs HTTPS, so use [Tailscale](https://tailscale.com): `tailscale serve --bg 5173`.

## Tests

```bash
pytest -q
```

GitHub Actions runs the tests, lint and build on every push and pull request.
