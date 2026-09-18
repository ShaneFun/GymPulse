import React, { useState, useEffect, useCallback } from 'react';
import { fitnessApi } from './api/client';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import AICameraCounter, { EXERCISE_CONFIGS } from './AICameraCounter';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

// ── Constants ───────────────────────────────────────────────────────────────
const EXERCISE_OPTIONS = Object.entries(EXERCISE_CONFIGS).map(([key, cfg]) => ({
  key,
  label: cfg.label,
}));

// Targets accumulate by repeated float addition, so trim display noise
// (e.g. 22.200000000000003) without showing a pointless ".0" on whole numbers.
const formatWeight = (kg) => Number(kg.toFixed(2)).toString();

// ── App ──────────────────────────────────────────────────────────────────────
function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('counter'); // 'counter' | 'plan' | 'progress'

  // ── Plan Tab ──
  const [plans, setPlans] = useState([]); // list of {id, program_id, exercise_name, target_sets, target_reps, target_weight, week}
  const [planName, setPlanName] = useState('');
  const [planExercise, setPlanExercise] = useState('bicep_curl');
  const [planSets, setPlanSets] = useState('');
  const [planReps, setPlanReps] = useState('');
  const [planWeight, setPlanWeight] = useState('0');
  const [planWeightInc, setPlanWeightInc] = useState('0');
  const [planRepInc, setPlanRepInc] = useState('0');

  // ── Counter Tab ──
  const [selectedPlan, setSelectedPlan] = useState(null); // full plan object
  // sessionState: 'idle' | 'active' | 'done'
  const [sessionState, setSessionState] = useState('idle');
  const [currentSet, setCurrentSet] = useState(1);
  const [completedSets, setCompletedSets] = useState([]); // array of rep counts
  const [liveReps, setLiveReps] = useState(0);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [autoCamera, setAutoCamera] = useState(true); // user toggle: auto vs manual
  // When a PASS has a nonzero increment: { nextWeek, nextWeight, nextReps }
  const [progression, setProgression] = useState(null);
  const [advancing, setAdvancing] = useState(false); // in-flight guard for the Confirm button

  // ── Progress Tab ──
  const [workoutHistory, setWorkoutHistory] = useState([]); // all logs across all plans

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadPlans();
    loadHistory();
  }, []);

  const loadPlans = async () => {
    try {
      const res = await fitnessApi.getPrograms();
      const programs = res.data.data || [];
      // For each program, fetch its schedules — each schedule IS a plan
      const allSchedules = await Promise.all(
        programs.map(p =>
          fitnessApi.getSchedules(p.id).then(r =>
            (r.data.data || []).map(s => ({ ...s, programName: p.name }))
          )
        )
      );
      setPlans(allSchedules.flat());
    } catch (err) {
      console.error('loadPlans:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fitnessApi.getPrograms();
      const programs = res.data.data || [];
      const schedResults = await Promise.all(
        programs.map(p =>
          fitnessApi.getSchedules(p.id).then(r =>
            (r.data.data || []).map(s => ({ ...s, programName: p.name }))
          )
        )
      );
      const schedules = schedResults.flat();

      const analysisResults = await Promise.all(
        schedules.map(s =>
          fitnessApi.getAnalysis(s.id)
            .then(r => (r.data?.history || []).map(h => ({
              ...h,
              exercise_name: s.exercise_name,
              target_sets: s.target_sets,
              target_reps: s.target_reps,
              target_weight: s.target_weight,
            })))
            .catch(() => [])
        )
      );
      const all = analysisResults.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setWorkoutHistory(all);
    } catch (err) {
      console.error('loadHistory:', err);
    }
  };

  // ── Plan Creation ─────────────────────────────────────────────────────────
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!planName.trim() || !planSets || !planReps) {
      alert('Please fill in all fields');
      return;
    }
    try {
      // Create a program with the plan name, then add one schedule
      const progRes = await fitnessApi.createProgram(planName.trim());
      const programId = progRes.data?.data?.[0]?.id;
      if (!programId) throw new Error('Could not create plan');

      await fitnessApi.createSchedule({
        program_id: programId,
        week: 1,
        exercise_name: planExercise,
        target_weight: parseFloat(planWeight) || 0,
        target_sets: parseInt(planSets),
        target_reps: parseInt(planReps),
        weight_increment: Math.max(0, Number(planWeightInc) || 0),
        rep_increment: Math.max(0, Math.round(Number(planRepInc) || 0)),
      });

      setPlanName('');
      setPlanSets('');
      setPlanReps('');
      setPlanWeight('0');
      setPlanWeightInc('0');
      setPlanRepInc('0');
      loadPlans();
      alert(`Plan "${planName}" created!`);
    } catch (err) {
      alert('Error creating plan: ' + err.message);
    }
  };

  // ── Workout Session ───────────────────────────────────────────────────────
  const resetSession = () => {
    setSessionState('idle');
    setCompletedSets([]);
    setCurrentSet(1);
    setLiveReps(0);
    setProgression(null);
  };

  const startSession = () => {
    if (!selectedPlan) { alert('Select a plan first'); return; }
    setCurrentSet(1);
    setCompletedSets([]);
    setLiveReps(0);
    setCameraResetKey(k => k + 1);
    setSessionState('active');
  };

  const doneSet = () => {
    if (liveReps < 1) return; // Q3: require at least 1 rep
    const newSets = [...completedSets, liveReps];
    setCompletedSets(newSets);
    setLiveReps(0);

    if (newSets.length >= selectedPlan.target_sets) {
      // All sets done
      setSessionState('done');
    } else {
      setCurrentSet(s => s + 1);
      setCameraResetKey(k => k + 1); // reset counter for next set
    }
  };

  const finishWorkout = async () => {
    try {
      const res = await fitnessApi.logWorkout({
        schedule_id: selectedPlan.id,
        log_name: `Session ${new Date().toLocaleDateString()}`,
        actual_weight: selectedPlan.target_weight,
        actual_reps: completedSets,
      });

      await loadHistory();

      const passed = res.data?.status_calculated === 'PASS';
      const weightInc = selectedPlan.weight_increment || 0;
      const repInc = selectedPlan.rep_increment || 0;

      // On a PASS with something to progress by, stay here and ask first.
      if (passed && (weightInc > 0 || repInc > 0)) {
        setProgression({
          nextWeek: (selectedPlan.week || 1) + 1,
          nextWeight: selectedPlan.target_weight + weightInc,
          nextReps: selectedPlan.target_reps + repInc,
        });
        return;
      }

      resetSession();
      setActiveTab('progress');
    } catch (err) {
      alert('Error saving workout: ' + err.message);
    }
  };

  const confirmProgression = async () => {
    // Guard against a double tap: the backend's existence check and its insert
    // are two separate round trips, so two in-flight calls can both decide to
    // create week+1 and produce a duplicate the app has no way to delete.
    if (advancing) return;
    setAdvancing(true);
    try {
      await fitnessApi.advanceSchedule(selectedPlan.id);
      await loadPlans();
      resetSession();
      setActiveTab('progress');
    } catch (err) {
      alert('Error creating next week: ' + err.message);
    } finally {
      setAdvancing(false);
    }
  };

  const skipProgression = () => {
    resetSession();
    setActiveTab('progress');
  };

  const cancelSession = () => {
    resetSession();
  };

  // ── Chart Data ────────────────────────────────────────────────────────────
  const chartData = {
    labels: workoutHistory.map(l => new Date(l.created_at).toLocaleDateString()).reverse(),
    datasets: [{
      label: 'Total Reps',
      data: workoutHistory.map(l => (l.actual_reps || []).reduce((a, b) => a + b, 0)).reverse(),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.15)',
      tension: 0.4,
      fill: true,
    }],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-title">💪 GymPulse</div>
        <div className="app-header-subtitle">AI-Powered Rep Counter</div>
      </header>

      {/* ── Content ── */}
      <main className="app-content animate-fade-in">

        {/* ══════════════════════════════════════════
            TAB: COUNTER
        ══════════════════════════════════════════ */}
        {activeTab === 'counter' && (
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
                            {p.programName} — {p.exercise_name} ({p.target_sets}×{p.target_reps})
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
        )}

        {/* ══════════════════════════════════════════
            TAB: PLAN
        ══════════════════════════════════════════ */}
        {activeTab === 'plan' && (
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
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.programName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {EXERCISE_CONFIGS[p.exercise_name]?.label || p.exercise_name} · {p.target_sets}×{p.target_reps}{p.target_weight > 0 ? ` @ ${p.target_weight}kg` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedPlan(p); setActiveTab('counter'); }}
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
        )}

        {/* ══════════════════════════════════════════
            TAB: PROGRESS
        ══════════════════════════════════════════ */}
        {activeTab === 'progress' && (
          <div>
            {workoutHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Complete a workout to see your progress here!
                </p>
              </div>
            ) : (
              <>
                <p className="section-label">Total Reps Over Time</p>
                <div className="card">
                  <Line options={chartOptions} data={chartData} />
                </div>

                <p className="section-label">Session History</p>
                {/* Table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.2fr 0.7fr 0.7fr 0.6fr',
                  gap: 4, padding: '8px 12px',
                  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  <span>Date</span>
                  <span>Exercise</span>
                  <span style={{ textAlign: 'center' }}>Sets</span>
                  <span style={{ textAlign: 'center' }}>Reps</span>
                  <span style={{ textAlign: 'center' }}>Result</span>
                </div>

                {workoutHistory.map(log => {
                  const repsArr = Array.isArray(log.actual_reps) ? log.actual_reps : [];
                  const totalReps = repsArr.reduce((a, b) => a + b, 0);
                  const setsDone = repsArr.length;
                  return (
                    <div key={log.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.2fr 0.7fr 0.7fr 0.6fr',
                      gap: 4, padding: '12px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 10, marginBottom: 6,
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        {log.exercise_name}
                      </span>
                      <span style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                        {setsDone}/{log.target_sets}
                      </span>
                      <span style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                        {totalReps}
                      </span>
                      <span style={{ textAlign: 'center' }}>
                        <span className={`badge ${log.status === 'PASS' ? 'badge-pass' : 'badge-fail'}`}
                          style={{ fontSize: '0.65rem', padding: '3px 6px' }}>
                          {log.status === 'PASS' ? '✅' : '❌'}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

      </main>

      {/* ── Bottom Tab Bar ── */}
      <nav className="tab-bar">
        <button className={`tab-btn ${activeTab === 'counter' ? 'active' : ''}`} onClick={() => setActiveTab('counter')}>
          <span className="tab-btn-icon">📷</span>
          Workout
        </button>
        <button className={`tab-btn ${activeTab === 'plan' ? 'active' : ''}`} onClick={() => setActiveTab('plan')}>
          <span className="tab-btn-icon">📋</span>
          Plan
        </button>
        <button className={`tab-btn ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setActiveTab('progress')}>
          <span className="tab-btn-icon">📊</span>
          Progress
        </button>
      </nav>

    </div>
  );
}

export default App;