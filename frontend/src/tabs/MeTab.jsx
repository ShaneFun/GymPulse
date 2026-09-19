import { Camera, LogIn } from 'lucide-react';
import { formatWeight } from '../lib/format';

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

function MeTab({ workoutHistory, autoCamera, setAutoCamera }) {
  const bests = personalBests(workoutHistory);
  const totalRepsSum = workoutHistory.reduce((a, log) => a + totalReps(log), 0);

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
          <div className="stat-tile-value">{totalRepsSum}</div>
          <div className="stat-tile-label">Total Reps</div>
        </div>
      </div>

      {bests.length > 0 && (
        <>
          <div className="section-heading">Personal Bests</div>
          {bests.map(([name, weight]) => (
            <div key={name} className="row">
              <span className="row-title">{name}</span>
              <span className="row-title tnum">{formatWeight(weight)} kg</span>
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
            className={`btn btn-sm ${autoCamera ? 'btn-accent' : 'btn-secondary'}`}
            onClick={() => setAutoCamera(!autoCamera)}
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
