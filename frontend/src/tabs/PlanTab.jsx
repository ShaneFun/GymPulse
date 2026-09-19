import { useRef, useState } from 'react';
import { Plus, ChevronRight, ClipboardList } from 'lucide-react';
import { EXERCISE_CONFIGS } from '../AICameraCounter';
import ExerciseFigure from '../components/ExerciseFigure';
import ExercisePicker from '../components/ExercisePicker';
import { formatWeight } from '../lib/format';

function PlanTab({
  plans, planName, setPlanName, planExercise, setPlanExercise, planSets, setPlanSets,
  planReps, setPlanReps, planWeight, setPlanWeight, planWeightInc, setPlanWeightInc,
  planRepInc, setPlanRepInc, planRest, setPlanRest, handleCreatePlan, onStartPlan,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const exerciseTriggerRef = useRef(null);
  const selectedLabel = EXERCISE_CONFIGS[planExercise]?.label || planExercise;

  const closePicker = () => {
    setPickerOpen(false);
    exerciseTriggerRef.current?.focus();
  };

  return (
    <div>
      <h1 className="screen-heading">Plan</h1>

      <div className="card">
        <form onSubmit={handleCreatePlan}>
          <div className="input-group">
            <label className="label">Plan Name</label>
            <input
              type="text"
              placeholder="e.g., Morning Push Day"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="label">Exercise</label>
            <button
              type="button"
              className="exercise-trigger"
              onClick={() => setPickerOpen(true)}
              ref={exerciseTriggerRef}
            >
              <span className="exercise-trigger-info">
                <ExerciseFigure exercise={planExercise} label={selectedLabel} size={32} />
                <span>{selectedLabel}</span>
              </span>
              <ChevronRight size={20} strokeWidth={1.5} />
            </button>
          </div>
          <div className="field-row input-group">
            <div>
              <label className="label">Sets</label>
              <input type="number" min="1" placeholder="5" value={planSets} onChange={e => setPlanSets(e.target.value)} />
            </div>
            <div>
              <label className="label">Reps / Set</label>
              <input type="number" min="1" placeholder="10" value={planReps} onChange={e => setPlanReps(e.target.value)} />
            </div>
            <div>
              <label className="label">Weight (kg)</label>
              <input type="number" min="0" step="0.5" placeholder="0" value={planWeight} onChange={e => setPlanWeight(e.target.value)} />
            </div>
          </div>

          <div className="section-heading">Rest</div>
          <p className="dim">Countdown between sets</p>
          <div className="input-group">
            <label className="label">Seconds</label>
            <input type="number" min="0" step="5" placeholder="90" value={planRest} onChange={e => setPlanRest(e.target.value)} />
          </div>

          <div className="section-heading">Progression</div>
          <p className="dim">On a passed workout, increase next week by</p>
          <div className="field-row input-group">
            <div>
              <label className="label">Weight (kg)</label>
              <input type="number" min="0" step="0.5" placeholder="0" value={planWeightInc} onChange={e => setPlanWeightInc(e.target.value)} />
            </div>
            <div>
              <label className="label">Reps / Set</label>
              <input type="number" min="0" step="1" placeholder="0" value={planRepInc} onChange={e => setPlanRepInc(e.target.value)} />
            </div>
          </div>

          <button type="submit" className="btn btn-accent btn-block">
            <Plus size={18} strokeWidth={1.5} />
            Create Plan
          </button>
        </form>
      </div>

      <div className="section-heading">My Plans</div>
      {plans.length === 0 ? (
        <div className="empty">
          <ClipboardList size={32} strokeWidth={1.5} />
          <p>No plans yet. Create one above to get started.</p>
        </div>
      ) : (
        plans.map(p => (
          <div key={p.id} className="row">
            <div>
              <div className="row-title">{p.programName} · Week {p.week}</div>
              <div className="row-sub">
                {EXERCISE_CONFIGS[p.exercise_name]?.label || p.exercise_name} · {p.target_sets}×{p.target_reps}{p.target_weight > 0 ? ` @ ${formatWeight(p.target_weight)}kg` : ''}
              </div>
            </div>
            <button className="icon-btn" onClick={() => onStartPlan(p)}>
              <ChevronRight size={20} strokeWidth={1.5} />
            </button>
          </div>
        ))
      )}

      {pickerOpen && (
        <ExercisePicker
          value={planExercise}
          onSelect={setPlanExercise}
          onClose={closePicker}
        />
      )}
    </div>
  );
}

export default PlanTab;
