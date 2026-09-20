import { useState, useEffect } from 'react';
import { fitnessApi } from './api/client';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Camera, ClipboardList, TrendingUp, User } from 'lucide-react';
import { primeAudio, say } from './lib/beep';
import { isAdvancable } from './lib/advancable';
import { clearSession, loadSession, resumablePlan, saveSession } from './lib/workoutSession';
import WorkoutTab from './tabs/WorkoutTab';
import PlanTab from './tabs/PlanTab';
import ProgressTab from './tabs/ProgressTab';
import MeTab from './tabs/MeTab';
import { useAuth } from './auth/AuthProvider';
import LoginScreen from './auth/LoginScreen';
import ResetPasswordScreen from './auth/ResetPasswordScreen';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// ── Constants ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'counter',  label: 'Workout',  Icon: Camera },
  { key: 'plan',     label: 'Plan',     Icon: ClipboardList },
  { key: 'progress', label: 'Progress', Icon: TrendingUp },
  { key: 'me',       label: 'Me',       Icon: User },
];

// ── App ──────────────────────────────────────────────────────────────────────
function App() {
  const { session, loading, recovery } = useAuth();
  const userId = session?.user?.id ?? null;

  // Navigation
  const [activeTab, setActiveTab] = useState('counter'); // 'counter' | 'plan' | 'progress' | 'me'

  // ── Plan Tab ──
  const [plans, setPlans] = useState([]); // list of {id, program_id, exercise_name, target_sets, target_reps, target_weight, week}
  const [planName, setPlanName] = useState('');
  const [planExerciseRest, setPlanExerciseRest] = useState('180');
  // Each entry is one exercise in the plan being built.
  const [planExercises, setPlanExercises] = useState([]);
  // Non-null while editing an existing plan; the form is otherwise creating.
  const [editingProgramId, setEditingProgramId] = useState(null);
  const [creatingPlan, setCreatingPlan] = useState(false); // in-flight guard for Create Plan

  // ── Counter Tab ──
  const [selectedPlan, setSelectedPlan] = useState(null); // full plan object
  // sessionState: 'idle' | 'active' | 'done'
  const [sessionState, setSessionState] = useState('idle');
  const [currentSet, setCurrentSet] = useState(1);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  // One array of rep counts per exercise, parallel to selectedPlan.exercises.
  const [completedByExercise, setCompletedByExercise] = useState([]);
  const [liveReps, setLiveReps] = useState(0);
  // Between sets: 'resting' counts the rest down then waits for a tap;
  // 'getready' is the short lead-in after that tap, during which the camera
  // warms up but any reps it sees are discarded.
  const [restRemaining, setRestRemaining] = useState(0);
  const [getReadyRemaining, setGetReadyRemaining] = useState(0);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [autoCamera, setAutoCamera] = useState(true); // user toggle: auto vs manual
  // Per-exercise outcomes from finishWorkout: [{ exercise, reps, passed, logged }]
  const [results, setResults] = useState([]);
  const [advancing, setAdvancing] = useState(false); // in-flight guard for the Confirm button
  const [saving, setSaving] = useState(false); // in-flight guard for Save & retry-failed-logs

  // A workout left unfinished when the page went away, read back from
  // localStorage. Adjusted during render rather than in an effect: reading
  // it at mount would miss the user signing in a moment later, and a
  // setState inside an effect is what this eslint config rejects.
  const [snapshotUserId, setSnapshotUserId] = useState(undefined);
  const [snapshot, setSnapshot] = useState(null);
  if (userId !== snapshotUserId) {
    setSnapshotUserId(userId);
    setSnapshot(loadSession(userId));
  }

  // Derived above their first use (this eslint config errors on
  // use-before-declaration for const arrow functions that reference them).
  const currentExercise = selectedPlan?.exercises?.[exerciseIndex] ?? null;
  // The flat list becomes the current exercise's list, derived rather than
  // kept as a second piece of state, so the two can never disagree.
  const completedSets = completedByExercise[exerciseIndex] ?? [];

  // A session is live whenever the machine is anywhere other than idle/done.
  const sessionLive = sessionState === 'active'
    || sessionState === 'resting'
    || sessionState === 'getready';

  // Only offer to resume when nothing is running and the snapshot still fits
  // a plan that exists — see resumablePlan for what disqualifies one.
  const resumePlan = sessionLive || sessionState === 'done'
    ? null
    : resumablePlan(snapshot, plans);

  // ── Progress Tab ──
  const [workoutHistory, setWorkoutHistory] = useState([]); // all logs across all plans
  // Days the user intends to train, as 'YYYY-MM-DD' strings.
  const [plannedDays, setPlannedDays] = useState([]);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    loadPlans();
    loadHistory();
    fitnessApi.getPlannedDays()
      .then(res => setPlannedDays((res.data?.data || []).map(d => d.day)))
      .catch(err => console.error('loadPlannedDays:', err));
  }, [userId]);

  const loadPlans = async () => {
    try {
      const res = await fitnessApi.getPrograms();
      const programs = res.data.data || [];

      const perProgram = await Promise.all(
        programs.map(p =>
          fitnessApi.getSchedules(p.id).then(r => ({ program: p, schedules: r.data.data || [] }))
        )
      );

      // A plan is every exercise a program holds in one week, so
      // (programId, week) is its identity — not a schedule id.
      const grouped = [];
      for (const { program, schedules } of perProgram) {
        const byWeek = new Map();
        for (const s of schedules) {
          if (!byWeek.has(s.week)) byWeek.set(s.week, []);
          byWeek.get(s.week).push(s);
        }
        for (const [week, exercises] of byWeek) {
          grouped.push({
            id: `${program.id}-${week}`,
            programId: program.id,
            programName: program.name,
            week,
            exerciseRestSeconds: program.exercise_rest_seconds ?? 180,
            exercises: exercises.slice().sort(
              (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))
            ),
          });
        }
      }

      grouped.sort(
        (a, b) => (a.programName || '').localeCompare(b.programName || '') || a.week - b.week
      );
      setPlans(grouped);
    } catch (err) {
      console.error('loadPlans:', err);
    }
  };

  const togglePlannedDay = async (day) => {
    const planned = plannedDays.includes(day);
    // Optimistic: the calendar should respond to the tap immediately, and a
    // failure reverts by reloading the truth rather than guessing.
    setPlannedDays(list => (planned ? list.filter(d => d !== day) : [...list, day]));
    try {
      if (planned) await fitnessApi.unplanDay(day);
      else await fitnessApi.planDay(day);
    } catch (err) {
      console.error('togglePlannedDay:', err);
      setPlannedDays(list => (planned ? [...list, day] : list.filter(d => d !== day)));
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
  const planPayload = () => ({
    name: planName.trim(),
    exercise_rest_seconds: Math.max(0, Math.round(Number(planExerciseRest) || 0)),
    exercises: planExercises.map(ex => ({
      exercise_name: ex.exerciseName,
      target_sets: Math.max(1, Math.round(Number(ex.sets) || 0)),
      target_reps: Math.max(1, Math.round(Number(ex.reps) || 0)),
      target_weight: Math.max(0, Number(ex.weight) || 0),
      rest_seconds: Math.max(0, Math.round(Number(ex.rest) || 0)),
      weight_increment: Math.max(0, Number(ex.weightInc) || 0),
      rep_increment: Math.max(0, Math.round(Number(ex.repInc) || 0)),
    })),
  });

  // Turn a grouped plan back into the form's draft shape.
  const startEditingPlan = (plan) => {
    setEditingProgramId(plan.programId);
    setPlanName(plan.programName);
    setPlanExerciseRest(String(plan.exerciseRestSeconds ?? 180));
    setPlanExercises(plan.exercises.map(ex => ({
      key: `${ex.exercise_name}-${ex.id}`,
      exerciseName: ex.exercise_name,
      sets: String(ex.target_sets ?? ''),
      reps: String(ex.target_reps ?? ''),
      weight: String(ex.target_weight ?? 0),
      rest: String(ex.rest_seconds ?? 90),
      weightInc: String(ex.weight_increment ?? 0),
      repInc: String(ex.rep_increment ?? 0),
    })));
  };

  const cancelEditingPlan = () => {
    setEditingProgramId(null);
    setPlanName('');
    setPlanExerciseRest('180');
    setPlanExercises([]);
  };

  const handleDeletePlan = async (plan) => {
    const sessions = workoutHistory.filter(
      h => plan.exercises.some(ex => ex.id === h.schedule_id)
    ).length;
    const note = sessions > 0
      ? `

${sessions} logged session${sessions === 1 ? '' : 's'} will be kept in your history.`
      : '';
    if (!window.confirm(`Delete "${plan.programName}"?${note}`)) return;

    try {
      await fitnessApi.deletePlan(plan.programId);
      if (selectedPlan?.programId === plan.programId) setSelectedPlan(null);
      if (editingProgramId === plan.programId) cancelEditingPlan();
      await loadPlans();
      await loadHistory();
    } catch (err) {
      alert('Error deleting plan: ' + err.message);
    }
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (creatingPlan) return;
    if (!planName.trim()) { alert('Give the plan a name'); return; }
    if (planExercises.length === 0) { alert('Add at least one exercise'); return; }

    for (const ex of planExercises) {
      if (!ex.sets || Number(ex.sets) < 1) {
        alert(`${ex.exerciseName}: sets must be at least 1`);
        return;
      }
      if (!ex.reps || Number(ex.reps) < 1) {
        alert(`${ex.exerciseName}: reps must be at least 1`);
        return;
      }
    }

    setCreatingPlan(true);
    try {
      // Same payload either way: editing replaces the plan wholesale, which
      // is what lets add, remove and edit be one operation.
      if (editingProgramId) {
        await fitnessApi.updatePlan(editingProgramId, planPayload());
      } else {
        await fitnessApi.createPlan(planPayload());
      }

      setEditingProgramId(null);
      setPlanName('');
      setPlanExerciseRest('180');
      setPlanExercises([]);
      await loadPlans();
      // Targets may have changed, so the grading shown in Progress can move.
      await loadHistory();
      return true;
    } catch (err) {
      alert(`Error ${editingProgramId ? 'updating' : 'creating'} plan: ` + err.message);
      return false;
    } finally {
      setCreatingPlan(false);
    }
  };

  // ── Workout Session ───────────────────────────────────────────────────────
  const resetSession = () => {
    // The one place a session ends for good — cancelled, finished and logged,
    // or replaced by a new one. The saved snapshot goes with it, so the next
    // visit to this tab is not offered a workout that is already over.
    clearSession(userId);
    setSnapshot(null);
    setSessionState('idle');
    setRestRemaining(0);
    setGetReadyRemaining(0);
    setExerciseIndex(0);
    setCompletedByExercise([]);
    setCurrentSet(1);
    setLiveReps(0);
    setResults([]);
  };

  const onStartPlan = (p) => {
    resetSession();
    setSelectedPlan(p);
    setActiveTab('counter');
  };

  const startSession = () => {
    if (!selectedPlan) { alert('Select a plan first'); return; }
    // iOS blocks audio until the page has had a user gesture. This tap is one,
    // so unlock the context here or the countdown beeps never sound.
    primeAudio();
    setCurrentSet(1);
    setExerciseIndex(0);
    setCompletedByExercise(selectedPlan.exercises.map(() => []));
    setLiveReps(0);
    setCameraResetKey(k => k + 1);
    setSessionState('active');
  };

  const doneSet = () => {
    if (liveReps < 1 || !currentExercise) return;

    const forThisExercise = [...(completedByExercise[exerciseIndex] ?? []), liveReps];
    const next = completedByExercise.map((v, i) => (i === exerciseIndex ? forThisExercise : v));
    setCompletedByExercise(next);
    setLiveReps(0);

    const moreSets = forThisExercise.length < currentExercise.target_sets;
    const moreExercises = exerciseIndex < selectedPlan.exercises.length - 1;

    if (moreSets) {
      setCurrentSet(s => s + 1);
      setCameraResetKey(k => k + 1);
      setRestRemaining(currentExercise.rest_seconds ?? 90);
      setSessionState('resting');
    } else if (moreExercises) {
      // Longer gap between exercises: time to change station or weights.
      setExerciseIndex(i => i + 1);
      setCurrentSet(1);
      setCameraResetKey(k => k + 1);
      setRestRemaining(selectedPlan.exerciseRestSeconds ?? 180);
      setSessionState('resting');
    } else {
      setSessionState('done');
    }
  };

  // Tick rest down to zero and stop there. Hitting zero does NOT start the
  // next set -- the user taps when they are actually ready.
  useEffect(() => {
    if (sessionState !== 'resting' || restRemaining <= 0) return;
    const id = setInterval(() => setRestRemaining(r => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [sessionState, restRemaining]);

  // One tone the moment rest runs out.
  useEffect(() => {
    if (sessionState === 'resting' && restRemaining === 0) {
      say('Rest over', { fallback: { frequency: 660, duration: 0.3 } });
    }
  }, [sessionState, restRemaining]);

  // Seconds of lead-in after tapping start. Long enough to put the phone
  // down and get into position -- 5 was not.
  const GET_READY_SECONDS = 8;

  const beginGetReady = () => {
    primeAudio();
    setGetReadyRemaining(GET_READY_SECONDS);
    setSessionState('getready');
    // Speak the opening number here: the ticking effect below only fires a
    // second later, so without this the first number is shown but never said.
    say(GET_READY_SECONDS, { fallback: { frequency: 880, duration: 0.1 } });
  };

  const addRestTime = (seconds) => setRestRemaining(r => Math.max(0, r + seconds));

  // Mirror the session to localStorage so a reload — or iOS quietly
  // discarding the tab while you were off reading something — can pick it
  // back up. This only ever writes; clearing happens where a session
  // genuinely ends (resetSession, discardResume), because an effect that
  // cleared whenever nothing was running would wipe the snapshot on mount,
  // which is precisely when it is needed.
  //
  // 'done' keeps saving too: the Done screen is where logs are written, and
  // a reload there should not lose the sets that produced them.
  useEffect(() => {
    if (!userId || sessionState === 'idle' || !selectedPlan) return;
    saveSession(userId, {
      planId: selectedPlan.id,
      exerciseIndex,
      currentSet,
      completedByExercise,
    });
  }, [userId, sessionState, selectedPlan, exerciseIndex, currentSet, completedByExercise]);

  const resumeWorkout = () => {
    if (!resumePlan) return;
    setSelectedPlan(resumePlan);
    setExerciseIndex(snapshot.exerciseIndex);
    setCurrentSet(snapshot.currentSet);
    setCompletedByExercise(snapshot.completedByExercise);
    setLiveReps(0);
    setRestRemaining(0);
    setSnapshot(null);
    // Straight into the lead-in rather than 'active': this tap is the user
    // gesture iOS needs to unlock audio, and the phone is in their hand, not
    // propped up facing them.
    beginGetReady();
  };

  const discardResume = () => {
    clearSession(userId);
    setSnapshot(null);
  };

  // Lead-in. The camera mounts and warms during this, so the set starts
  // against a live feed rather than a cold one.
  useEffect(() => {
    if (sessionState !== 'getready') return;

    // Everything happens inside the timer callback: transitioning straight
    // from the effect body would be a synchronous setState in an effect.
    const id = setTimeout(() => {
      if (getReadyRemaining <= 1) {
        // Throw away whatever the warming camera saw before you were set.
        setLiveReps(0);
        setCameraResetKey(k => k + 1);
        setSessionState('active');
        say('Go', { fallback: { frequency: 1320, duration: 0.25 } });
      } else {
        setGetReadyRemaining(n => n - 1);
        say(getReadyRemaining - 1, { fallback: { frequency: 880, duration: 0.1 } });
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [sessionState, getReadyRemaining]);

  const finishWorkout = async () => {
    // Guard against a double tap: this now makes N sequential round trips
    // (one per exercise), so the in-flight window can be seconds on slow
    // wifi, and there is no dedup or delete on the backend -- a second tap
    // would permanently write duplicate logs.
    if (saving) return;
    setSaving(true);
    try {
      const stamp = new Date().toLocaleDateString();
      const outcomes = [];

      for (let i = 0; i < selectedPlan.exercises.length; i++) {
        const exercise = selectedPlan.exercises[i];
        const reps = completedByExercise[i] ?? [];
        if (reps.length === 0) continue; // never started; nothing to record

        try {
          const res = await fitnessApi.logWorkout({
            schedule_id: exercise.id,
            log_name: `Session ${stamp}`,
            actual_weight: exercise.target_weight,
            actual_reps: reps,
          });
          outcomes.push({
            exercise,
            reps,
            logged: true,
            passed: res.data?.status_calculated === 'PASS',
          });
        } catch (err) {
          console.error('logWorkout:', exercise.exercise_name, err);
          outcomes.push({ exercise, reps, logged: false, passed: false });
        }
      }

      await loadHistory();
      setResults(outcomes);

      // Offer progression only for exercises that passed AND have something to
      // progress by; an exercise that failed stays on its current week.
      const anyFailed = outcomes.some(o => !o.logged);
      const advancable = outcomes.filter(isAdvancable);

      // Only leave automatically when there is nothing for the user to see or
      // decide. A failed log has to stay on screen, or it reads as a success.
      if (advancable.length === 0 && !anyFailed) {
        resetSession();
        setActiveTab('progress');
      }
    } finally {
      setSaving(false);
    }
  };

  // Re-post only the exercises that failed to log. Entries that already
  // landed (`logged: true`) are left alone, so this can never double-post
  // one that already succeeded.
  const retryFailedLogs = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const stamp = new Date().toLocaleDateString();
      const next = [];
      for (const outcome of results) {
        if (outcome.logged) { next.push(outcome); continue; }
        try {
          const res = await fitnessApi.logWorkout({
            schedule_id: outcome.exercise.id,
            log_name: `Session ${stamp}`,
            actual_weight: outcome.exercise.target_weight,
            actual_reps: outcome.reps,
          });
          next.push({
            ...outcome,
            logged: true,
            passed: res.data?.status_calculated === 'PASS',
          });
        } catch (err) {
          console.error('retry logWorkout:', outcome.exercise.exercise_name, err);
          next.push(outcome);
        }
      }
      await loadHistory();
      setResults(next);
    } finally {
      setSaving(false);
    }
  };

  const confirmProgression = async () => {
    // Guard against a double tap: the backend's existence check and its insert
    // are two separate round trips, so two in-flight calls can both decide to
    // create week+1 and produce a duplicate the app has no way to delete.
    if (advancing) return;
    setAdvancing(true);
    try {
      const advancable = results.filter(isAdvancable);

      // Sequential, and /advance is idempotent, so a partial failure can be
      // retried without duplicating the rows that already landed.
      for (const o of advancable) {
        await fitnessApi.advanceSchedule(o.exercise.id);
      }
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
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
        ticks: { color: '#6B6B70', font: { size: 11 } },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#6B6B70', font: { size: 11 } },
      },
    },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="empty">Loading…</div>;
  // Before the session check, not after: a recovery link signs the user in,
  // so they would otherwise land in the app with the reset unfinished.
  if (recovery) return <ResetPasswordScreen />;
  if (!session) return <LoginScreen />;

  return (
    <div className="app-shell">

      {/* ── Content ── */}
      <main className="app-content">

        {/* Kept mounted (merely hidden) while a session is active: unmounting
            would tear down the camera and reset the rep counter mid-set. */}
        {(activeTab === 'counter' || sessionLive) && (
          <div hidden={activeTab !== 'counter'}>
          <WorkoutTab
            plans={plans}
            resumePlan={resumePlan}
            resumeSnapshot={snapshot}
            onResumeWorkout={resumeWorkout}
            onDiscardResume={discardResume}
            selectedPlan={selectedPlan}
            setSelectedPlan={setSelectedPlan}
            sessionState={sessionState}
            currentSet={currentSet}
            currentExercise={currentExercise}
            completedSets={completedSets}
            completedByExercise={completedByExercise}
            liveReps={liveReps}
            setLiveReps={setLiveReps}
            cameraResetKey={cameraResetKey}
            autoCamera={autoCamera}
            setAutoCamera={setAutoCamera}
            results={results}
            advancing={advancing}
            saving={saving}
            startSession={startSession}
            doneSet={doneSet}
            finishWorkout={finishWorkout}
            retryFailedLogs={retryFailedLogs}
            confirmProgression={confirmProgression}
            skipProgression={skipProgression}
            cancelSession={cancelSession}
            restRemaining={restRemaining}
            getReadyRemaining={getReadyRemaining}
            beginGetReady={beginGetReady}
            addRestTime={addRestTime}
          />
          </div>
        )}

        {activeTab === 'plan' && (
          <PlanTab
            plans={plans}
            planName={planName}
            setPlanName={setPlanName}
            planExerciseRest={planExerciseRest}
            setPlanExerciseRest={setPlanExerciseRest}
            planExercises={planExercises}
            editingProgramId={editingProgramId}
            onStartEditPlan={startEditingPlan}
            onCancelEditPlan={cancelEditingPlan}
            onDeletePlan={handleDeletePlan}
            setPlanExercises={setPlanExercises}
            handleCreatePlan={handleCreatePlan}
            onStartPlan={onStartPlan}
            creatingPlan={creatingPlan}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressTab
            plannedDays={plannedDays}
            onTogglePlannedDay={togglePlannedDay}
            workoutHistory={workoutHistory}
            chartData={chartData}
            chartOptions={chartOptions}
          />
        )}

        {activeTab === 'me' && (
          <MeTab
            workoutHistory={workoutHistory}
            autoCamera={autoCamera}
            setAutoCamera={setAutoCamera}
          />
        )}

      </main>

      {/* ── Bottom Tab Bar ── */}
      <nav className="tab-bar">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            <span className="tab-icon">
              <Icon size={22} strokeWidth={1.5} />
              {/* A workout is running, or one is waiting to be picked back
                  up — visible from whichever tab you wandered off to. */}
              {key === 'counter' && (sessionLive || resumePlan) && (
                <span className="tab-dot" aria-label="Workout in progress" />
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>

    </div>
  );
}

export default App;
