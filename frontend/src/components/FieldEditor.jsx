import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Single-field editor overlay — the iOS Settings-style "tap a row, edit just
// that field" pattern. Mirrors ExercisePicker's overlay behaviour (Escape to
// close, focus moved in on open, body scroll lock) but for one labelled
// input instead of a grid of choices, so it can be reused for every editable
// profile field instead of writing one near-identical overlay per field.
//
// Props:
//  label       — field label; used as both the dialog title and the input's
//                <label>
//  value       — current value; the editor keeps its own draft copy so
//                Cancel discards cleanly and Save commits
//  inputType   — 'text' | 'tel' | 'number'
//  inputProps  — extra props spread onto the <input> (min/max/maxLength/
//                autoComplete/inputMode/placeholder/etc.)
//  onSave(nextValue) — called on submit; may reject/throw, in which case the
//                editor stays open and shows an inline error instead of
//                closing
//  onClose()   — called on close (Escape, close button, or Cancel); the
//                caller owns the trigger ref and is responsible for
//                returning focus to whatever opened the editor
//  saving      — true while a save is in flight; disables the form and
//                shows "Saving…"
function FieldEditor({ label, value, inputType, inputProps, onSave, onClose, saving }) {
  const uid = useId();
  const headingId = `${uid}-heading`;
  const inputId = `${uid}-input`;

  const closeBtnRef = useRef(null);
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');

  useEffect(() => {
    inputRef.current?.focus();

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

  const isUnchanged = draft === value;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || isUnchanged) return;
    setError('');
    try {
      await onSave(draft);
    } catch {
      setError('Could not save. Please try again.');
    }
  };

  return (
    <div className="picker-overlay" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div className="picker-header">
        <h2 id={headingId} className="picker-title">{label}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" ref={closeBtnRef}>
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="picker-body">
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="label" htmlFor={inputId}>{label}</label>
            <input
              id={inputId}
              ref={inputRef}
              type={inputType}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              {...inputProps}
            />
          </div>

          {error && <p className="dim field-note">{error}</p>}

          <button type="submit" className="btn btn-accent btn-block" disabled={saving || isUnchanged}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default FieldEditor;
