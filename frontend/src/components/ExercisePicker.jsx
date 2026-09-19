import { useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { EXERCISE_CONFIGS } from '../AICameraCounter';
import ExerciseFigure from './ExerciseFigure';

const HEADING_ID = 'exercise-picker-heading';

// Full-screen exercise picker. Replaces a bare <select> so users can see the
// movement (via ExerciseFigure) instead of just reading a label.
//
// Props:
//  value      — currently selected exercise key
//  onSelect(key) — called when a card is tapped
//  onClose()  — called on close (Escape, backdrop close button, or after a
//               selection); the caller is responsible for returning focus to
//               whatever triggered the picker.
function ExercisePicker({ value, onSelect, onClose }) {
  const closeBtnRef = useRef(null);
  const selectedCardRef = useRef(null);

  useEffect(() => {
    // Move focus into the dialog: prefer the selected card so the picker
    // opens with focus already on the current choice, falling back to the
    // close button if nothing is selected.
    const initialTarget = selectedCardRef.current || closeBtnRef.current;
    initialTarget?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSelect = (key) => {
    onSelect(key);
    onClose();
  };

  return (
    <div className="picker-overlay" role="dialog" aria-modal="true" aria-labelledby={HEADING_ID}>
      <div className="picker-header">
        <h2 id={HEADING_ID} className="picker-title">Choose Exercise</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" ref={closeBtnRef}>
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="picker-grid">
        {Object.entries(EXERCISE_CONFIGS).map(([key, cfg]) => {
          const selected = key === value;
          return (
            <button
              type="button"
              key={key}
              className={`exercise-card${selected ? ' selected' : ''}`}
              onClick={() => handleSelect(key)}
              aria-current={selected ? 'true' : undefined}
              ref={selected ? selectedCardRef : undefined}
            >
              {selected && <Check className="exercise-card-check" size={14} strokeWidth={2.5} />}
              <ExerciseFigure exercise={key} label={cfg.label} size={56} />
              <span className="exercise-card-label">{cfg.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ExercisePicker;
