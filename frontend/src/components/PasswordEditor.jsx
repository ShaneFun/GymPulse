import { useEffect, useId, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, validatePassword } from '../lib/validation';

// Change-password overlay. Three fields rather than one, so it is its own
// component instead of a FieldEditor: the rules are cross-field (new must
// match confirm, and differ from current) and the requirements are worth
// showing as a live checklist rather than one error at a time.
//
// Props:
//  onSave({ currentPassword, newPassword }) — may reject/throw; the editor
//                stays open and shows the message inline
//  onClose()   — caller returns focus to whatever opened this
//  saving      — true while a save is in flight
function PasswordEditor({ onSave, onClose, saving }) {
  const uid = useId();
  const headingId = `${uid}-heading`;

  const firstInputRef = useRef(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    firstInputRef.current?.focus();

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

  // A live checklist beats one error at a time: you can see every rule you
  // still have to satisfy instead of discovering them one submit apart.
  const rules = [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: next.length >= MIN_PASSWORD_LENGTH },
    { label: 'Contains a letter', ok: /[A-Za-z]/.test(next) },
    { label: 'Contains a number', ok: /[0-9]/.test(next) },
    { label: 'Different from your current password', ok: next.length > 0 && next !== current },
    { label: 'Both new password fields match', ok: next.length > 0 && next === confirm },
  ];

  const canSave = !saving && current.length > 0
    && !validatePassword(next) && rules.every((r) => r.ok);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setError('');
    try {
      await onSave({ currentPassword: current, newPassword: next });
    } catch (err) {
      setError(err?.message || 'Could not change your password. Please try again.');
    }
  };

  return (
    <div className="picker-overlay" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div className="picker-header">
        <h2 id={headingId} className="picker-title">Change password</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="picker-body">
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="label" htmlFor={`${uid}-current`}>Current password</label>
            <input
              id={`${uid}-current`}
              ref={firstInputRef}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label className="label" htmlFor={`${uid}-new`}>New password</label>
            <input
              id={`${uid}-new`}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label className="label" htmlFor={`${uid}-confirm`}>Confirm new password</label>
            <input
              id={`${uid}-confirm`}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={saving}
            />
          </div>

          <ul className="rule-list">
            {rules.map((rule) => (
              <li key={rule.label} className={rule.ok ? 'rule-ok' : 'rule-pending'}>
                {rule.ok
                  ? <Check size={14} strokeWidth={2.5} />
                  : <span className="rule-dot" aria-hidden="true" />}
                {rule.label}
              </li>
            ))}
          </ul>

          {error && <p className="field-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-accent btn-block" disabled={!canSave}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default PasswordEditor;
