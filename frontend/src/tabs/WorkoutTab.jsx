import AICameraCounter, { EXERCISE_CONFIGS } from '../AICameraCounter';
import { formatWeight } from '../lib/format';

function WorkoutTab({
  plans, selectedPlan, setSelectedPlan, sessionState, currentSet, completedSets,
  liveReps, setLiveReps, cameraResetKey, autoCamera, setAutoCamera, progression,
  advancing, startSession, doneSet, finishWorkout, confirmProgression, skipProgression,
  cancelSession,
}) {
  return (
    <div>

      {/* IDLE — Plan selector */}
      {sessionState === 'idle' && (
        <>
          <p className="section-label">Today's Workout</p>
          <div className="card">
            {plans.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '12px 0' }}>
                No plans yet. Go to Plan tab to create one 👉
              </p>
            ) : (
              <>
                <label>Select Plan</label>
                <select
                  value={selectedPlan?.id || ''}
                  onChange={(e) => {
                    const p = plans.find(x => x.id === parseInt(e.target.value) || x.id === e.target.value);
                    setSelectedPlan(p || null);
                  }}
                  style={{ marginBottom: 14 }}
                >
                  <option value="">-- Choose a plan --</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.programName} · Week {p.week} — {p.exercise_name} ({p.target_sets}×{p.target_reps})
                    </option>
                  ))}
                </select>

                {selectedPlan && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Exercise</span>
                      <strong>{EXERCISE_CONFIGS[selectedPlan.exercise_name]?.label || selectedPlan.exercise_name}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Target</span>
                      <strong>{selectedPlan.target_sets} sets × {selectedPlan.target_reps} reps</strong>
                    </div>
                    {selectedPlan.target_weight > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Weight</span>
                        <strong>{selectedPlan.target_weight} kg</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Auto / Manual camera toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>Camera:</span>
                  <button
                    onClick={() => setAutoCamera(a => !a)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      background: autoCamera ? '#6366f1' : 'var(--bg-secondary)',
                      color: autoCamera ? '#fff' : 'var(--text-secondary)',
                      fontWeight: 600, fontSize: '0.8rem',
                    }}
                  >
                    {autoCamera ? '⚡ Auto' : '🖐 Manual'}
                  </button>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={startSession}
                  disabled={!selectedPlan}
                >
                  🚀 Start Workout
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ACTIVE — Workout in progress */}
      {sessionState === 'active' && selectedPlan && (
        <>
          {/* Progress banner */}
          <div style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', marginBottom: 2 }}>
                {EXERCISE_CONFIGS[selectedPlan.exercise_name]?.label}
              </div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>
                Set {currentSet} of {selectedPlan.target_sets}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>This set</div>
              <div style={{ color: '#00ffcc', fontWeight: 800, fontSize: '1.4rem' }}>{liveReps}</div>
            </div>
          </div>

          {/* Completed sets tracker */}
          {completedSets.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {completedSets.map((reps, i) => (
                <div key={i} style={{
                  background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: 8, padding: '6px 10px', textAlign: 'center', minWidth: 50,
                }}>
                  <div style={{ fontSize: '0.65rem', color: '#6ee7b7' }}>Set {i + 1}</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#34d399' }}>{reps}</div>
                </div>
              ))}
              <div style={{
                background: 'rgba(99,102,241,0.1)', border: '1px dashed rgba(99,102,241,0.4)',
                borderRadius: 8, padding: '6px 10px', textAlign: 'center', minWidth: 50,
              }}>
                <div style={{ fontSize: '0.65rem', color: '#818cf8' }}>Set {currentSet}</div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#818cf8' }}>…</div>
              </div>
            </div>
          )}

          {/* Total reps so far */}
          <div style={{ textAlign: 'center', marginBottom: 10, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Total reps done: <strong style={{ color: 'var(--text-primary)' }}>
              {completedSets.reduce((a, b) => a + b, 0) + liveReps}
            </strong>
            {selectedPlan.target_weight > 0 && (
              <span> · Weight: <strong style={{ color: 'var(--text-primary)' }}>{selectedPlan.target_weight}kg</strong></span>
            )}
          </div>

          {/* Camera */}
          <AICameraCounter
            exerciseLocked={selectedPlan.exercise_name}
            autoStart={autoCamera}
            resetKey={cameraResetKey}
            onRepUpdate={setLiveReps}
          />

          {/* Done Set / Cancel */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="btn btn-success"
              onClick={doneSet}
              disabled={liveReps < 1}
              style={{ flex: 2 }}
            >
              ✅ Done Set ({liveReps} reps)
            </button>
            <button
              onClick={cancelSession}
              style={{
                flex: 1, background: 'rgba(239,68,68,0.15)', color: '#f87171',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
                padding: 13, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* DONE — Workout complete */}
      {sessionState === 'done' && selectedPlan && (
        <>
          <div style={{
            background: 'linear-gradient(135deg, #059669, #10b981)',
            borderRadius: 14, padding: '20px 16px', marginBottom: 14, textAlign: 'center',
          }}>
            <div style={{ fontSize: '2.5rem' }}>🎉</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem', marginTop: 6 }}>
              Workout Complete!
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: 4 }}>
              {completedSets.length} sets · {completedSets.reduce((a, b) => a + b, 0)} total reps
            </div>
          </div>

          <p className="section-label">Set Breakdown</p>
          <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {completedSets.map((reps, i) => (
              <div key={i} style={{
                background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px',
                textAlign: 'center', flex: '1 1 60px',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Set {i + 1}</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>{reps}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>reps</div>
              </div>
            ))}
          </div>

          {progression ? (
            <div style={{
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 14, padding: '16px', marginTop: 12,
            }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>
                ⬆ You passed! Ready for Week {progression.nextWeek}?
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Next target: {progression.nextWeight > 0 ? `${formatWeight(progression.nextWeight)}kg × ` : ''}
                {progression.nextReps} reps × {selectedPlan.target_sets} sets
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-success"
                  onClick={confirmProgression}
                  disabled={advancing}
                  style={{ flex: 2 }}
                >
                  {advancing ? 'Creating…' : `Create Week ${progression.nextWeek}`}
                </button>
                <button
                  onClick={skipProgression}
                  style={{
                    flex: 1, background: 'transparent', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', borderRadius: 10,
                    padding: 13, cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-success" onClick={finishWorkout} style={{ flex: 2 }}>
                💾 Save & View Progress
              </button>
              <button
                onClick={cancelSession}
                style={{
                  flex: 1, background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', borderRadius: 10,
                  padding: 13, cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
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
