import { useEffect, useRef, useState } from 'react';
import { Play, Square, RotateCcw, Camera } from 'lucide-react';

// Exercise configurations ported from Good-GYM's exercises.json
// MediaPipe landmark indices:
// Left shoulder (11), Left elbow (13), Left wrist (15)
// Right shoulder (12), Right elbow (14), Right wrist (16)
// Left hip (23), Left knee (25), Left ankle (27)
// Right hip (24), Right knee (26), Right ankle (28)
const EXERCISE_CONFIGS = {
  bicep_curl: {
    label: 'Bicep Curl',
    points: [12, 14, 16],
    startAngle: 150,
    endAngle: 60,
    direction: 'decreasing',
    startMsg: 'Lift the weight!',
    endMsg: 'Good rep! Lower slowly',
  },
  squat: {
    label: 'Squat',
    points: [24, 26, 28],
    startAngle: 120,
    endAngle: 150,
    direction: 'increasing',
    startMsg: 'Squat down!',
    endMsg: 'Great squat!',
  },
  pushup: {
    label: 'Push-up',
    points: [12, 14, 16],
    startAngle: 120,
    endAngle: 150,
    direction: 'increasing',
    startMsg: 'Go down!',
    endMsg: 'Good push-up!',
  },
  situp: {
    label: 'Sit-up',
    points: [12, 24, 26],
    startAngle: 155,
    endAngle: 130,
    direction: 'decreasing',
    startMsg: 'Sit up!',
    endMsg: 'Good sit-up!',
  },
  lateral_raise: {
    label: 'Lateral Raise',
    points: [24, 12, 14],
    startAngle: 30,
    endAngle: 80,
    direction: 'increasing',
    startMsg: 'Raise your arms!',
    endMsg: 'Good raise!',
  },
  overhead_press: {
    label: 'Overhead Press',
    points: [12, 14, 16],
    startAngle: 70,
    endAngle: 140,
    direction: 'increasing',
    startMsg: 'Press up!',
    endMsg: 'Good press!',
  },
  pullup: {
    label: 'Pull-up',
    points: [12, 14, 16],
    startAngle: 140,
    endAngle: 70,
    direction: 'decreasing',
    startMsg: 'Pull up!',
    endMsg: 'Good pull-up!',
  },
  crunch: {
    label: 'Crunch',
    points: [12, 24, 26],
    startAngle: 160,
    endAngle: 140,
    direction: 'decreasing',
    startMsg: 'Crunch up!',
    endMsg: 'Good crunch!',
  },
};

export { EXERCISE_CONFIGS };

/**
 * Props:
 *  onRepUpdate(reps)   — called live on every new rep (optional)
 *  resetKey            — increment this number to reset counter to 0
 *  autoStart           — start camera immediately on mount (default false)
 *  exerciseLocked      — exercise key string; if set, hides the dropdown
 */
function AICameraCounter({ onRepUpdate, resetKey = 0, autoStart = false, exerciseLocked = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [exercise, setExercise] = useState(exerciseLocked || 'bicep_curl');
  // Display badge removed (WorkoutTab now shows the live count via onRepUpdate);
  // setRepCount is kept so the rep state machine below stays untouched.
  const [, setRepCount] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [feedback, setFeedback] = useState('Stand in frame');

  const repCountRef = useRef(0);
  const stageRef = useRef(null);
  const exerciseRef = useRef(exerciseLocked || 'bicep_curl');
  const cameraInstanceRef = useRef(null);
  const poseInstanceRef = useRef(null);
  const angleHistoryRef = useRef([]);
  const onRepUpdateRef = useRef(onRepUpdate);

  useEffect(() => { onRepUpdateRef.current = onRepUpdate; }, [onRepUpdate]);

  // Sync exercise ref when dropdown changes
  useEffect(() => {
    exerciseRef.current = exercise;
    stageRef.current = null;
    angleHistoryRef.current = [];
  }, [exercise]);

  // Reset counter when resetKey changes (parent triggers this between sets)
  useEffect(() => {
    repCountRef.current = 0;
    setRepCount(0);
    stageRef.current = null;
    angleHistoryRef.current = [];
  }, [resetKey]);

  // Auto-start or cleanup on unmount
  useEffect(() => {
    if (!window.Pose || !window.Camera) {
      setFeedback('⚠️ MediaPipe failed to load. Check index.html script tags.');
      return;
    }
    if (autoStart) {
      const t = setTimeout(() => startCamera(), 400);
      return () => {
        clearTimeout(t);
        stopCamera();
      };
    }
    return () => stopCamera();
  }, []);

  // ── Camera & Pose ──────────────────────────────────────
  const startCamera = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const pose = new window.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 2,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    pose.onResults(onResults);
    poseInstanceRef.current = pose;

    const camera = new window.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) await pose.send({ image: videoRef.current });
      },
      width: 640,
      height: 480,
    });

    camera.start()
      .then(() => {
        setIsCameraActive(true);
        setFeedback('Camera ready — position yourself!');
      })
      .catch((err) => {
        console.error('Camera start error:', err);
        setFeedback('Failed to access camera.');
      });

    cameraInstanceRef.current = camera;
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }
    cameraInstanceRef.current?.stop();
    poseInstanceRef.current?.close();
    setIsCameraActive(false);
    setFeedback('Camera stopped');
  };

  // ── Angle Math ──────────────────────────────────────────
  const calculateAngle = (a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  const smoothAngle = (angle) => {
    angleHistoryRef.current.push(angle);
    if (angleHistoryRef.current.length > 5) angleHistoryRef.current.shift();
    return angleHistoryRef.current.reduce((a, b) => a + b, 0) / angleHistoryRef.current.length;
  };

  // ── MediaPipe Callback ──────────────────────────────────
  const onResults = (results) => {
    if (!canvasRef.current || !videoRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, 0, 0, w, h);
    ctx.restore();

    if (!results.poseLandmarks) return;
    const lms = results.poseLandmarks;
    drawSkeleton(ctx, lms, w, h);

    const config = EXERCISE_CONFIGS[exerciseRef.current];
    if (!config) return;

    const [i1, i2, i3] = config.points;
    const p1 = lms[i1], p2 = lms[i2], p3 = lms[i3];
    if (p1.visibility < 0.4 || p2.visibility < 0.4 || p3.visibility < 0.4) return;

    const angle = smoothAngle(calculateAngle(p1, p2, p3));
    drawAngleText(ctx, angle, p2, w, h);

    const addRep = () => {
      repCountRef.current += 1;
      setRepCount(repCountRef.current);
      onRepUpdateRef.current?.(repCountRef.current);
    };

    if (config.direction === 'decreasing') {
      if (angle > config.startAngle) { stageRef.current = 'down'; setFeedback(config.startMsg); }
      if (angle < config.endAngle && stageRef.current === 'down') { stageRef.current = 'up'; addRep(); setFeedback(config.endMsg); }
    } else {
      if (angle > config.endAngle) { stageRef.current = 'up'; setFeedback(config.startMsg); }
      if (angle < config.startAngle && stageRef.current === 'up') { stageRef.current = 'down'; addRep(); setFeedback(config.endMsg); }
    }
  };

  // ── Drawing Helpers ─────────────────────────────────────
  const drawAngleText = (ctx, angle, lm, w, h) => {
    ctx.save();
    ctx.fillStyle = '#D4F034';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText(`${Math.round(angle)}°`, w - lm.x * w + 12, lm.y * h);
    ctx.restore();
  };

  const drawSkeleton = (ctx, lms, w, h) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#FFFFFF';

    const connections = [
      [11,12],[11,13],[13,15],[12,14],[14,16],
      [11,23],[12,24],[23,24],
      [23,25],[25,27],[24,26],[26,28],
    ];
    connections.forEach(([a, b]) => {
      if (lms[a].visibility > 0.5 && lms[b].visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(w - lms[a].x * w, lms[a].y * h);
        ctx.lineTo(w - lms[b].x * w, lms[b].y * h);
        ctx.stroke();
      }
    });
    lms.forEach((lm, idx) => {
      if (idx > 10 && lm.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(w - lm.x * w, lm.y * h, 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    ctx.restore();
  };

  const resetCount = () => {
    repCountRef.current = 0;
    setRepCount(0);
    stageRef.current = null;
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <>
      {!exerciseLocked && (
        <div className="card-dark-body">
          <select value={exercise} onChange={(e) => setExercise(e.target.value)}>
            {Object.entries(EXERCISE_CONFIGS).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Camera view */}
      <div className="camera-frame">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} width={400} height={300} />

        {!isCameraActive && (
          <div className="camera-scrim">
            <Camera size={32} strokeWidth={1.5} />
            <span className="micro">Camera off</span>
          </div>
        )}
      </div>

      <div className="card-dark-body">
        <p className="micro text-center">{feedback}</p>

        <div className="btn-row">
          {!isCameraActive ? (
            <button className="btn btn-sm btn-secondary" onClick={startCamera}>
              <Play size={16} strokeWidth={1.5} />
              Start
            </button>
          ) : (
            <button className="btn btn-sm btn-secondary" onClick={stopCamera}>
              <Square size={16} strokeWidth={1.5} />
              Stop
            </button>
          )}
          <button className="btn btn-sm btn-secondary" onClick={resetCount}>
            <RotateCcw size={16} strokeWidth={1.5} />
            Reset
          </button>
        </div>
      </div>
    </>
  );
}

export default AICameraCounter;