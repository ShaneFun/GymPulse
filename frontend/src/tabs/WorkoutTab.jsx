import { useState, useEffect, useRef } from 'react';
import { Play, Square, RotateCcw, Check, X, Save, ArrowUp, Trophy, ClipboardList } from 'lucide-react';
import AICameraCounter, { EXERCISE_CONFIGS } from '../AICameraCounter';
import ExerciseFigure from '../components/ExerciseFigure';
import { formatWeight } from '../lib/format';
import { say, beep, primeAudio } from '../lib/beep';

// No-op defaults so the control row can render (and stay disabled-feeling)
// before AICameraCounter's first onControls handoff lands.
const NO_CAMERA_CONTROLS = {
  isCameraActive: false,
  startCamera: () => {},
  stopCamera: () => {},
  resetCount: () => {},
};

// Rest reads as a clock, not a bare second count: 1:30 is quicker to parse
// mid-workout than 90.
const formatClock = (totalSeconds) => {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function WorkoutTab({
  plans, selectedPlan, setSelectedPlan, sessionState, currentSet, completedSets,
  liveReps, setLiveReps, cameraResetKey, autoCamera, progression,
  advancing, startSession, doneSet, finishWorkout, confirmProgression, skipProgression,
  cancelSession, restRemaining, getReadyRemaining, beginGetReady, addRestTime,
}) {
  const [cameraControls, setCameraControls] = useState(NO_CAMERA_CONTROLS);

  // Reps left in this set, or null when there is no active target. Drives both
  // the on-screen countdown and the beeps.
  const repsRemaining = (sessionState === 'active' && selectedPlan)
    ? selectedPlan.target_reps - liveReps
    : null;
  const showCountdown = repsRemaining !== null && repsRemaining > 0 && repsRemaining <= 3;

  // One beep per value, not per render: without this guard any re-render while
  // sitting on the same rep would retrigger the tone.
  // Which rep number was last called, so a re-render never repeats a cue.
  const lastCalledRepRef = useRef(0);

  useEffect(() => {
    if (sessionState !== 'active' || !selectedPlan || liveReps <= 0) {
      lastCalledRepRef.current = 0;
      return;
    }
    if (lastCalledRepRef.current === liveReps) return;
    lastCalledRepRef.current = liveReps;

    const left = selectedPlan.target_reps - liveReps;

    // Every rep is called out, because you cannot read the screen mid-rep.
    // The tail switches from counting up to counting down, so the last
    // stretch tells you how much is left rather than how far you have come.
    if (left === 0) {
      // Target hit: a tone, not a word — it needs to cut through, and by
      // then you are not listening for a number.
      beep({ frequency: 1320, duration: 0.35 });
    } else if (left === 3) {
      say('Last three', { fallback: { frequency: 990, duration: 0.18 } });
    } else if (left === 2) {
      say('Two', { fallback: { frequency: 990, duration: 0.15 } });
    } else if (left === 1) {
      say('One', { fallback: { frequency: 1100, duration: 0.15 } });
    } else {
      say(liveReps, { fallback: { frequency: 880, duration: 0.1 } });
    }
  }, [liveReps, sessionState, selectedPlan]);


  return (
    <div>
      <h1 className="screen-heading">Workout</h1>

      {/* IDLE — Plan selector */}
      {sessionState === 'idle' && (
        <div>
          {plans.length === 0 ? (
            <div className="empty">
              <ClipboardList size={32} strokeWidth={1.5} />
              <p>No plans yet. Go to the Plan tab to create one.</p>
            </div>
          ) : (
            <>
              <div className="plan-grid">
                {plans.map((p) => {
                  const selected = selectedPlan?.id === p.id;
                  const exercises = p.exercises;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={`plan-card ${selected ? 'selected' : ''}`}
                      onClick={() => setSelectedPlan(p)}
                      aria-pressed={selected}
                    >
                      <div className="plan-card-figures">
                        {exercises.map((ex) => (
                          <ExerciseFigure
                            key={ex.id}
                            exercise={ex.exercise_name}
                            label={EXERCISE_CONFIGS[ex.exercise_name]?.label || ex.exercise_name}
                            size={56}
                          />
                        ))}
                      </div>
                      <div className="plan-card-name">{p.programName}</div>
                      <div className="plan-card-meta">Week {p.week}</div>
                      <div className="plan-card-target tnum">
                        {exercises.length === 1
                          ? (
                            <>
                              {exercises[0].target_sets}×{exercises[0].target_reps}
                              {exercises[0].target_weight > 0 ? ` · ${formatWeight(exercises[0].target_weight)}kg` : ''}
                            </>
                          )
                          : `${exercises.length} exercises`}
                      </div>
                      {selected && (
                        <span className="plan-card-check" aria-hidden="true">
                          <Check size={14} strokeWidth={2} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

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
      {(sessionState === 'active' || sessionState === 'getready') && selectedPlan && (
        <>
          <div className="card-dark">
            <AICameraCounter
              exerciseLocked={selectedPlan.exercise_name}
              autoStart={autoCamera}
              resetKey={cameraResetKey}
              onRepUpdate={setLiveReps}
              onControls={setCameraControls}
              overlay={
                <>
                  <div className="camera-readout">
                    <span className="camera-readout-set">Set {currentSet} of {selectedPlan.target_sets}</span>
                    <span className="camera-readout-reps tnum">{liveReps}</span>
                  </div>
                  {sessionState === 'getready' && (
                    <div className="camera-countdown camera-countdown-lead tnum"
                      key={`lead-${getReadyRemaining}`} aria-hidden="true">
                      {getReadyRemaining}
                    </div>
                  )}
                  {showCountdown && (
                    // key remounts the node each time the number changes, which
                    // replays the animation. aria-hidden: the live rep count
                    // above already conveys this to assistive tech.
                    <div className="camera-countdown tnum" key={repsRemaining} aria-hidden="true">
                      {repsRemaining}
                    </div>
                  )}
                </>
              }
            />

            {/* One icon-only row: camera controls (Reset, Start/Stop) plus
                session controls (Done Set, Cancel) — merged so every control
                stays reachable under a tall portrait camera without scrolling. */}
            <div className="card-dark-body">
              <div className="camera-controls">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={cameraControls.resetCount}
                  aria-label="Reset rep count"
                >
                  <RotateCcw size={18} strokeWidth={1.5} />
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    primeAudio();
                    if (cameraControls.isCameraActive) cameraControls.stopCamera();
                    else cameraControls.startCamera();
                  }}
                  aria-label={cameraControls.isCameraActive ? 'Stop camera' : 'Start camera'}
                >
                  {cameraControls.isCameraActive
                    ? <Square size={18} strokeWidth={1.5} />
                    : <Play size={18} strokeWidth={1.5} />}
                </button>

                <button
                  type="button"
                  className="icon-btn-primary"
                  onClick={() => { primeAudio(); doneSet(); }}
                  disabled={liveReps < 1}
                  aria-label={`Done set, ${liveReps} reps`}
                >
                  <Check size={18} strokeWidth={1.5} />
                  <span className="tnum">{liveReps}</span>
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  onClick={cancelSession}
                  aria-label="Cancel session"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>
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
        </>
      )}

      {/* DONE — Workout complete */}
      {sessionState === 'resting' && selectedPlan && (
        <>
          <div className="rest-panel">
            <div className="rest-label">
              {restRemaining > 0 ? 'Rest' : 'Ready when you are'}
            </div>
            <div className="rest-clock tnum">{formatClock(restRemaining)}</div>
            <div className="rest-next">Up next &middot; Set {currentSet} of {selectedPlan.target_sets}</div>

            <button type="button" className="btn btn-accent btn-block" onClick={beginGetReady}>
              <Play size={18} strokeWidth={1.5} />
              {restRemaining > 0 ? 'Skip rest' : 'Start set'}
            </button>

            <div className="btn-row rest-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addRestTime(30)}>
                +30s
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelSession}>
                <X size={16} strokeWidth={1.5} />
                End workout
              </button>
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
        </>
      )}

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
