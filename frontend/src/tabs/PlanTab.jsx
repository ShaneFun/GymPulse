import { useRef, useState } from 'react';
import { Plus, ChevronRight, ClipboardList, Trash2, Check, Pencil, X } from 'lucide-react';
import { EXERCISE_CONFIGS } from '../AICameraCounter';
import ExerciseFigure from '../components/ExerciseFigure';
import ExercisePicker from '../components/ExercisePicker';
import { formatWeight } from '../lib/format';

function PlanTab({
  plans, planName, setPlanName, planExerciseRest, setPlanExerciseRest,
  planExercises, setPlanExercises, handleCreatePlan, onStartPlan, creatingPlan,
  editingProgramId, onStartEditPlan, onCancelEditPlan, onDeletePlan,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // The form starts closed so the tab opens on your plans, not a blank form.
  const [formOpen, setFormOpen] = useState(false);
  const addExerciseBtnRef = useRef(null);

  const closePicker = () => {
    setPickerOpen(false);
    addExerciseBtnRef.current?.focus();
  };

  const addExercise = (exerciseName) => {
    setPlanExercises(list => [...list, {
      key: `${exerciseName}-${Date.now()}`,
      exerciseName, sets: '3', reps: '10', weight: '0',
      rest: '90', weightInc: '0', repInc: '0',
    }]);
  };

  const updateExercise = (key, field, value) => {
    setPlanExercises(list => list.map(ex => (ex.key === key ? { ...ex, [field]: value } : ex)));
  };

  const removeExercise = (key) => {
    setPlanExercises(list => list.filter(ex => ex.key !== key));
  };

  return (
    <div>
      <h1 className="screen-heading">Plan</h1>

      {!formOpen && (
        <button
          type="button"
          className="btn btn-accent btn-block"
          onClick={() => setFormOpen(true)}
        >
          <Plus size={18} strokeWidth={1.5} />
          Create plan
        </button>
      )}

      {formOpen && (
      <div className="card">
        <div className="card-row plan-form-head">
          <div className="row-title">
            {editingProgramId ? 'Edit plan' : 'New plan'}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => { onCancelEditPlan?.(); setFormOpen(false); }}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            // Close only on success -- a failed create keeps the form up with
            // the user's work still in it.
            const ok = await handleCreatePlan(e);
            if (ok) setFormOpen(false);
          }}
        >
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
            <label className="label">Rest between exercises (seconds)</label>
            <input
              type="number"
              min="0"
              step="5"
              placeholder="180"
              value={planExerciseRest}
              onChange={e => setPlanExerciseRest(e.target.value)}
            />
          </div>

          <div className="section-heading">Exercises</div>
          {planExercises.length === 0 ? (
            <p className="dim">No exercises added yet.</p>
          ) : (
            planExercises.map(ex => {
              const label = EXERCISE_CONFIGS[ex.exerciseName]?.label || ex.exerciseName;
              const weight = Number(ex.weight) || 0;
              return (
                <div key={ex.key} className="plan-exercise-card">
                  <div className="plan-exercise-head">
                    <span className="exercise-trigger-info">
                      <ExerciseFigure exercise={ex.exerciseName} label={label} size={32} />
                      <span>
                        <div className="plan-exercise-name">{label}</div>
                        <div className="plan-exercise-meta">
                          {ex.sets}×{ex.reps}{weight > 0 ? ` @ ${formatWeight(weight)}kg` : ''}
                        </div>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeExercise(ex.key)}
                      aria-label={`Remove ${label}`}
                    >
                      <Trash2 size={18} strokeWidth={1.5} />
                    </button>
                  </div>

                  <div className="field-row input-group">
                    <div>
                      <label className="label">Sets</label>
                      <input
                        type="number" min="1" value={ex.sets}
                        onChange={e => updateExercise(ex.key, 'sets', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Reps / Set</label>
                      <input
                        type="number" min="1" value={ex.reps}
                        onChange={e => updateExercise(ex.key, 'reps', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Weight (kg)</label>
                      <input
                        type="number" min="0" step="0.5" value={ex.weight}
                        onChange={e => updateExercise(ex.key, 'weight', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field-row input-group">
                    <div>
                      <label className="label">Rest (s)</label>
                      <input
                        type="number" min="0" step="5" value={ex.rest}
                        onChange={e => updateExercise(ex.key, 'rest', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Weight Inc.</label>
                      <input
                        type="number" min="0" step="0.5" value={ex.weightInc}
                        onChange={e => updateExercise(ex.key, 'weightInc', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Rep Inc.</label>
                      <input
                        type="number" min="0" step="1" value={ex.repInc}
                        onChange={e => updateExercise(ex.key, 'repInc', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPickerOpen(true)}
              ref={addExerciseBtnRef}
            >
              <Plus size={18} strokeWidth={1.5} />
              Add exercise
            </button>

            <button
              type="submit"
              className="btn btn-accent"
              disabled={planExercises.length === 0 || creatingPlan}
            >
              <Check size={18} strokeWidth={1.5} />
              {creatingPlan ? 'Saving…' : 'Done'}
            </button>
          </div>
        </form>
      </div>
      )}

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
                {p.exercises.length === 1
                  ? `${EXERCISE_CONFIGS[p.exercises[0].exercise_name]?.label || p.exercises[0].exercise_name} · ${p.exercises[0].target_sets}×${p.exercises[0].target_reps}${p.exercises[0].target_weight > 0 ? ` @ ${formatWeight(p.exercises[0].target_weight)}kg` : ''}`
                  : p.exercises.map(ex => EXERCISE_CONFIGS[ex.exercise_name]?.label || ex.exercise_name).join(' · ')}
              </div>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => { onStartEditPlan?.(p); setFormOpen(true); }}
                aria-label={`Edit ${p.programName}`}
              >
                <Pencil size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onDeletePlan?.(p)}
                aria-label={`Delete ${p.programName}`}
              >
                <Trash2 size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onStartPlan(p)}
                aria-label={`Start ${p.programName}`}
              >
                <ChevronRight size={20} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ))
      )}

      {pickerOpen && (
        <ExercisePicker
          value={null}
          onSelect={addExercise}
          onClose={closePicker}
        />
      )}
    </div>
  );
}

export default PlanTab;
