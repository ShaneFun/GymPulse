import { useState, useEffect } from 'react';
import { fitnessApi } from './api/client';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Camera, ClipboardList, TrendingUp, User } from 'lucide-react';
import { primeAudio, say } from './lib/beep';
import WorkoutTab from './tabs/WorkoutTab';
import PlanTab from './tabs/PlanTab';
import ProgressTab from './tabs/ProgressTab';
import MeTab from './tabs/MeTab';
import { useAuth } from './auth/AuthProvider';
import LoginScreen from './auth/LoginScreen';

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
  const { session, loading } = useAuth();
  const userId = session?.user?.id ?? null;

  // Navigation
  const [activeTab, setActiveTab] = useState('counter'); // 'counter' | 'plan' | 'progress' | 'me'

  // ── Plan Tab ──
  const [plans, setPlans] = useState([]); // list of {id, program_id, exercise_name, target_sets, target_reps, target_weight, week}
  const [planName, setPlanName] = useState('');
  const [planExercise, setPlanExercise] = useState('bicep_curl');
  const [planSets, setPlanSets] = useState('');
  const [planReps, setPlanReps] = useState('');
  const [planWeight, setPlanWeight] = useState('0');
  const [planWeightInc, setPlanWeightInc] = useState('0');
  const [planRepInc, setPlanRepInc] = useState('0');
  const [planRest, setPlanRest] = useState('90');

  // ── Counter Tab ──
  const [selectedPlan, setSelectedPlan] = useState(null); // full plan object
  // sessionState: 'idle' | 'active' | 'done'
  const [sessionState, setSessionState] = useState('idle');
  const [currentSet, setCurrentSet] = useState(1);
  const [completedSets, setCompletedSets] = useState([]); // array of rep counts
  const [liveReps, setLiveReps] = useState(0);
  // Between sets: 'resting' counts the rest down then waits for a tap;
  // 'getready' is the short lead-in after that tap, during which the camera
  // warms up but any reps it sees are discarded.
  const [restRemaining, setRestRemaining] = useState(0);
  const [getReadyRemaining, setGetReadyRemaining] = useState(0);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [autoCamera, setAutoCamera] = useState(true); // user toggle: auto vs manual
  // When a PASS has a nonzero increment: { nextWeek, nextWeight, nextReps }
  const [progression, setProgression] = useState(null);
  const [advancing, setAdvancing] = useState(false); // in-flight guard for the Confirm button

  // ── Progress Tab ──
  const [workoutHistory, setWorkoutHistory] = useState([]); // all logs across all plans

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    loadPlans();
    loadHistory();
  }, [userId]);

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
      setPlans(
        allSchedules.flat().sort(
          (a, b) => (a.programName || '').localeCompare(b.programName || '') || a.week - b.week
        )
      );
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
      const programId = progRes.data?.data?.id;
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
        rest_seconds: Math.max(0, Math.round(Number(planRest) || 0)),
      });

      setPlanName('');
      setPlanSets('');
      setPlanReps('');
      setPlanWeight('0');
      setPlanWeightInc('0');
      setPlanRepInc('0');
      setPlanRest('90');
      loadPlans();
      alert(`Plan "${planName}" created!`);
    } catch (err) {
      alert('Error creating plan: ' + err.message);
    }
  };

  // ── Workout Session ───────────────────────────────────────────────────────
  const resetSession = () => {
    setSessionState('idle');
    setRestRemaining(0);
    setGetReadyRemaining(0);
    setCompletedSets([]);
    setCurrentSet(1);
    setLiveReps(0);
    setProgression(null);
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
      // Rest instead of leaving the camera live and counting.
      setRestRemaining(selectedPlan.rest_seconds ?? 90);
      setSessionState('resting');
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
  if (!session) return <LoginScreen />;

  return (
    <div className="app-shell">

      {/* ── Content ── */}
      <main className="app-content">

        {/* Kept mounted (merely hidden) while a session is active: unmounting
            would tear down the camera and reset the rep counter mid-set. */}
        {(activeTab === 'counter' || sessionState === 'active'
          || sessionState === 'resting' || sessionState === 'getready') && (
          <div hidden={activeTab !== 'counter'}>
          <WorkoutTab
            plans={plans}
            selectedPlan={selectedPlan}
            setSelectedPlan={setSelectedPlan}
            sessionState={sessionState}
            currentSet={currentSet}
            completedSets={completedSets}
            liveReps={liveReps}
            setLiveReps={setLiveReps}
            cameraResetKey={cameraResetKey}
            autoCamera={autoCamera}
            setAutoCamera={setAutoCamera}
            progression={progression}
            advancing={advancing}
            startSession={startSession}
            doneSet={doneSet}
            finishWorkout={finishWorkout}
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
            planExercise={planExercise}
            setPlanExercise={setPlanExercise}
            planSets={planSets}
            setPlanSets={setPlanSets}
            planReps={planReps}
            setPlanReps={setPlanReps}
            planWeight={planWeight}
            setPlanWeight={setPlanWeight}
            planWeightInc={planWeightInc}
            setPlanWeightInc={setPlanWeightInc}
            planRepInc={planRepInc}
            planRest={planRest}
            setPlanRest={setPlanRest}
            setPlanRepInc={setPlanRepInc}
            handleCreatePlan={handleCreatePlan}
            onStartPlan={onStartPlan}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressTab
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
            <Icon size={22} strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </nav>

    </div>
  );
}

export default App;
