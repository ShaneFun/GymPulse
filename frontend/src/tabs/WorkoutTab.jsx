import { Play, Check, Save, ArrowUp, Trophy } from 'lucide-react';
import AICameraCounter, { EXERCISE_CONFIGS } from '../AICameraCounter';
import { formatWeight } from '../lib/format';

function WorkoutTab({
  plans, selectedPlan, setSelectedPlan, sessionState, currentSet, completedSets,
  liveReps, setLiveReps, cameraResetKey, autoCamera, progression,
  advancing, startSession, doneSet, finishWorkout, confirmProgression, skipProgression,
  cancelSession,
}) {
  return (
    <div>
      <h1 className="screen-heading">Workout</h1>

      {/* IDLE — Plan selector */}
      {sessionState === 'idle' && (
        <div className="card">
          {plans.length === 0 ? (
            <div className="empty">
              <p>No plans yet. Go to the Plan tab to create one.</p>
            </div>
          ) : (
            <>
              <div className="input-group">
                <label className="label">Select Plan</label>
                <select
                  value={selectedPlan?.id || ''}
                  onChange={(e) => {
                    const p = plans.find(x => x.id === parseInt(e.target.value) || x.id === e.target.value);
                    setSelectedPlan(p || null);
                  }}
                >
                  <option value="">-- Choose a plan --</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.programName} · Week {p.week} — {p.exercise_name} ({p.target_sets}×{p.target_reps})
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlan && (
                <div className="input-group">
                  <div className="card-row">
                    <span className="dim">Exercise</span>
                    <strong>{EXERCISE_CONFIGS[selectedPlan.exercise_name]?.label || selectedPlan.exercise_name}</strong>
                  </div>
                  <div className="card-row">
                    <span className="dim">Target</span>
                    <strong>{selectedPlan.target_sets} sets × {selectedPlan.target_reps} reps</strong>
                  </div>
                  {selectedPlan.target_weight > 0 && (
                    <div className="card-row">
                      <span className="dim">Weight</span>
                      <strong>{selectedPlan.target_weight} kg</strong>
                    </div>
                  )}
                </div>
              )}

              <button
                className="btn btn-accent btn-block"
                onClick={startSession}
                disabled={!selectedPlan}
              >
                <Play size={18} strokeWidth={1.5} />
                Start Workout
              </button>
            </>
          )}
        </div>
      )}

      {/* ACTIVE — Workout in progress */}
      {sessionState === 'active' && selectedPlan && (
        <>
          <div className="card-dark">
            <AICameraCounter
              exerciseLocked={selectedPlan.exercise_name}
              autoStart={autoCamera}
              resetKey={cameraResetKey}
              onRepUpdate={setLiveReps}
            />
            <div className="card-dark-body">
              <div className="micro">Set {currentSet} of {selectedPlan.target_sets}</div>
              <div className="rep-counter">{liveReps}</div>
            </div>
          </div>

          <div className="set-chips">
            {completedSets.map((reps, i) => (
              <div key={i} className="set-chip set-chip-done">
                <div className="set-chip-label">Set {i + 1}</div>
                <div className="set-chip-value">{reps}</div>
              </div>
            ))}
            <div className="set-chip set-chip-current">
              <div className="set-chip-label">Set {currentSet}</div>
              <div className="set-chip-value">…</div>
            </div>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-accent"
              onClick={doneSet}
              disabled={liveReps < 1}
            >
              <Check size={18} strokeWidth={1.5} />
              Done Set ({liveReps} reps)
            </button>
            <button className="btn btn-secondary" onClick={cancelSession}>
              Cancel
            </button>
          </div>
        </>
      )}

      {/* DONE — Workout complete */}
      {sessionState === 'done' && selectedPlan && (
        <>
          <div className="card">
            <p className="section-heading">
              <Trophy size={18} strokeWidth={1.5} /> Workout Complete!
            </p>
            <div className="card-row">
              <span className="dim">Sets completed</span>
              <strong>{completedSets.length} / {selectedPlan.target_sets}</strong>
            </div>
            <div className="card-row">
              <span className="dim">Total reps</span>
              <strong>{completedSets.reduce((a, b) => a + b, 0)}</strong>
            </div>
          </div>

          <div className="set-chips">
            {completedSets.map((reps, i) => (
              <div key={i} className="set-chip set-chip-done">
                <div className="set-chip-label">Set {i + 1}</div>
                <div className="set-chip-value">{reps}</div>
              </div>
            ))}
          </div>

          {progression ? (
            <div className="card">
              <p className="section-heading">Ready for Week {progression.nextWeek}?</p>
              <p className="dim">
                Next target: {progression.nextWeight > 0 ? `${formatWeight(progression.nextWeight)}kg × ` : ''}
                {progression.nextReps} reps × {selectedPlan.target_sets} sets
              </p>
              <div className="btn-row">
                <button
                  className="btn btn-accent"
                  onClick={confirmProgression}
                  disabled={advancing}
                >
                  <ArrowUp size={18} strokeWidth={1.5} />
                  {advancing ? 'Creating…' : `Create Week ${progression.nextWeek}`}
                </button>
                <button className="btn btn-secondary" onClick={skipProgression}>
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div className="btn-row">
              <button className="btn btn-accent" onClick={finishWorkout}>
                <Save size={18} strokeWidth={1.5} />
                Save &amp; View Progress
              </button>
              <button className="btn btn-secondary" onClick={cancelSession}>
                Discard
              </button>
            </div>
          )}
        </>
      )}

    </div>
  );
}

export default WorkoutTab;
