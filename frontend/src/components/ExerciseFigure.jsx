// Simple line figures, one per exercise, drawn on a 64x64 grid.
//
// They use stroke="currentColor" so they inherit whatever colour the
// surrounding card uses — no per-theme variants needed. Deliberately simple:
// the job is "recognise the movement at a glance on a phone", not anatomy.

const FIGURES = {
  // Standing, forearm curled up. The elbow is pushed well clear of the torso
  // so the bend reads as a curl rather than merging into the body.
  bicep_curl: (
    <>
      <circle cx="24" cy="12" r="5" />
      <line x1="24" y1="17" x2="24" y2="38" />
      <line x1="24" y1="38" x2="19" y2="56" />
      <line x1="24" y1="38" x2="30" y2="56" />
      <polyline points="24,22 39,31 33,17" />
      <line x1="29" y1="14" x2="37" y2="20" />
    </>
  ),

  // Side view: hips driven back, knees forward, arms counterbalancing.
  squat: (
    <>
      <circle cx="33" cy="11" r="5" />
      <line x1="33" y1="16" x2="28" y2="35" />
      <line x1="31" y1="21" x2="46" y2="24" />
      <polyline points="28,35 41,40 38,56" />
      <line x1="34" y1="56" x2="43" y2="56" />
    </>
  ),

  // Side view: body held horizontal, arm bent underneath, grounded on a floor line.
  pushup: (
    <>
      <circle cx="13" cy="24" r="5" />
      <line x1="18" y1="27" x2="45" y2="36" />
      <line x1="45" y1="36" x2="57" y2="42" />
      <line x1="57" y1="42" x2="58" y2="48" />
      <polyline points="21,28 26,38 21,48" />
      <line x1="8" y1="50" x2="60" y2="50" />
    </>
  ),

  // Side view: torso lifted well off the floor, knees up.
  situp: (
    <>
      <circle cx="21" cy="25" r="5" />
      <line x1="24" y1="29" x2="36" y2="44" />
      <polyline points="36,44 47,33 53,46" />
      <line x1="25" y1="31" x2="43" y2="37" />
      <line x1="30" y1="48" x2="56" y2="48" />
    </>
  ),

  // Front view: arms straight out to the sides at shoulder height.
  lateral_raise: (
    <>
      <circle cx="32" cy="12" r="5" />
      <line x1="32" y1="17" x2="32" y2="37" />
      <line x1="11" y1="23" x2="53" y2="23" />
      <line x1="32" y1="37" x2="25" y2="56" />
      <line x1="32" y1="37" x2="39" y2="56" />
    </>
  ),

  // Front view: both arms extended overhead.
  overhead_press: (
    <>
      <circle cx="32" cy="16" r="5" />
      <line x1="32" y1="21" x2="32" y2="40" />
      <polyline points="19,8 22,24 32,26" />
      <polyline points="45,8 42,24 32,26" />
      <line x1="32" y1="40" x2="25" y2="56" />
      <line x1="32" y1="40" x2="39" y2="56" />
    </>
  ),

  // Hanging from a bar at the top of the pull: chin level with the bar,
  // elbows flared out to either side, body hanging straight below.
  pullup: (
    <>
      <line x1="8" y1="7" x2="56" y2="7" />
      <polyline points="24,7 21,18 27,28" />
      <polyline points="40,7 43,18 37,28" />
      <circle cx="32" cy="23" r="5" />
      <line x1="32" y1="29" x2="32" y2="46" />
      <line x1="32" y1="46" x2="27" y2="58" />
      <line x1="32" y1="46" x2="37" y2="58" />
    </>
  ),

  // Side view: only a short torso lift (vs the sit-up's full rise), knees bent.
  // No arm drawn - at this scale it only ever crossed the head.
  crunch: (
    <>
      <circle cx="17" cy="38" r="5" />
      <line x1="22" y1="40" x2="38" y2="47" />
      <polyline points="38,47 48,36 55,48" />
      <line x1="8" y1="51" x2="60" y2="51" />
    </>
  ),
};

// An unknown key renders this rather than throwing, so adding an exercise to
// EXERCISE_CONFIGS without drawing one here degrades instead of crashing.
const FALLBACK = (
  <>
    <circle cx="32" cy="14" r="5" />
    <line x1="32" y1="19" x2="32" y2="39" />
    <line x1="22" y1="26" x2="42" y2="26" />
    <line x1="32" y1="39" x2="25" y2="56" />
    <line x1="32" y1="39" x2="39" y2="56" />
  </>
);

function ExerciseFigure({ exercise, label, size = 64 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label || exercise}
    >
      {FIGURES[exercise] || FALLBACK}
    </svg>
  );
}

export default ExerciseFigure;
