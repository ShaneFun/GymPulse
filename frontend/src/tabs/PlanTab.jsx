import { EXERCISE_CONFIGS } from '../AICameraCounter';
import { formatWeight } from '../lib/format';

// ── Constants ───────────────────────────────────────────────────────────────
const EXERCISE_OPTIONS = Object.entries(EXERCISE_CONFIGS).map(([key, cfg]) => ({
  key,
  label: cfg.label,
}));

function PlanTab({
  plans, planName, setPlanName, planExercise, setPlanExercise, planSets, setPlanSets,
  planReps, setPlanReps, planWeight, setPlanWeight, planWeightInc, setPlanWeightInc,
  planRepInc, setPlanRepInc, handleCreatePlan, onStartPlan,
}) {
  return (
    <div>
      <p className="section-label">Create Workout Plan</p>
      <div className="card">
        <form onSubmit={handleCreatePlan}>
          <div className="input-group">
            <label>Plan Name</label>
            <input
              type="text"
              placeholder="e.g., Morning Push Day"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Exercise</label>
            <select value={planExercise} onChange={e => setPlanExercise(e.target.value)}>
              {EXERCISE_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }} className="input-group">
            <div style={{ flex: 1 }}>
              <label>Sets</label>
              <input type="number" min="1" placeholder="5" value={planSets} onChange={e => setPlanSets(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Reps / Set</label>
              <input type="number" min="1" placeholder="10" value={planReps} onChange={e => setPlanReps(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Weight (kg)</label>
              <input type="number" min="0" step="0.5" placeholder="0" value={planWeight} onChange={e => setPlanWeight(e.target.value)} />
            </div>
          </div>
          <div className="input-group">
            <label>Progression — on a passed workout, increase next week by</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Weight (kg)</label>
                <input type="number" min="0" step="0.5" placeholder="0" value={planWeightInc} onChange={e => setPlanWeightInc(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Reps / Set</label>
                <input type="number" min="0" step="1" placeholder="0" value={planRepInc} onChange={e => setPlanRepInc(e.target.value)} />
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">+ Create Plan</button>
        </form>
      </div>

      {plans.length > 0 && (
        <>
          <p className="section-label">My Plans</p>
          {plans.map(p => (
            <div key={p.id} className="log-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {p.programName} · Week {p.week}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  {EXERCISE_CONFIGS[p.exercise_name]?.label || p.exercise_name} · {p.target_sets}×{p.target_reps}{p.target_weight > 0 ? ` @ ${formatWeight(p.target_weight)}kg` : ''}
                </div>
              </div>
              <button
                onClick={() => onStartPlan(p)}
                style={{
                  background: '#6366f1', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 700,
                }}
              >
                Start →
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default PlanTab;
