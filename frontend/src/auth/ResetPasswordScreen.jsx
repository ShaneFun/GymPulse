import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { MIN_PASSWORD_LENGTH, validatePassword } from '../lib/validation';

// Shown when a password-reset link brings someone back to the app. Supabase
// signs them in to make the change possible, so this screen stands in front
// of the whole app: landing straight on the Workout tab would leave the
// reset half-finished with nothing saying so.
//
// No current password is asked for. Possession of the emailed link is the
// proof — asking for the password they have forgotten would be absurd.
function ResetPasswordScreen() {
  const { completePasswordReset, signOut } = useAuth();

  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rules = [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: next.length >= MIN_PASSWORD_LENGTH },
    { label: 'Contains a letter', ok: /[A-Za-z]/.test(next) },
    { label: 'Contains a number', ok: /[0-9]/.test(next) },
    { label: 'Both fields match', ok: next.length > 0 && next === confirm },
  ];
  const canSave = !saving && !validatePassword(next) && rules.every((r) => r.ok);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await completePasswordReset(next);
      // No navigation needed: clearing the recovery flag drops straight
      // into the app, already signed in.
    } catch (err) {
      setError(err.message || 'Could not set your password. The link may have expired.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="card login-card">
        <h1 className="screen-heading">Set a new password</h1>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="label" htmlFor="reset-new">New password</label>
            <input
              id="reset-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label className="label" htmlFor="reset-confirm">Confirm new password</label>
            <input
              id="reset-confirm"
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

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-accent btn-block" disabled={!canSave}>
            {saving ? 'Saving…' : 'Set password'}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={signOut} disabled={saving}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordScreen;
