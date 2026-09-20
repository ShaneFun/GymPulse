import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { MIN_PASSWORD_LENGTH, validateEmail, validatePassword } from '../lib/validation';

// One screen, three modes. They share the email field and most of the
// layout, and splitting them into separate components would mean three
// copies of the same form for the sake of one differing button.
const COPY = {
  signin: { title: 'GymPulse', action: 'Sign in', busy: 'Signing in…' },
  signup: { title: 'Create account', action: 'Create account', busy: 'Creating…' },
  forgot: { title: 'Reset password', action: 'Email me a link', busy: 'Sending…' },
};

function LoginScreen() {
  const { signIn, signUp, requestPasswordReset } = useAuth();

  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Set once an email is on its way; the form is replaced by a confirmation
  // rather than sitting there looking like nothing happened.
  const [sent, setSent] = useState(null);

  const needsPassword = mode !== 'forgot';
  // Only validate on sign-up: an existing password predates these rules, and
  // rejecting it at sign-in would lock people out of their own accounts.
  const passwordError = mode === 'signup' && password ? validatePassword(password) : '';
  const emailError = email ? validateEmail(email) : '';
  const canSubmit = !submitting && email && !emailError
    && (!needsPassword || (password && !passwordError));

  const switchTo = (next) => {
    setMode(next);
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      if (mode === 'signin') {
        const { error: signInError } = await signIn(email, password);
        if (signInError) throw new Error(signInError.message);
        // On success AuthProvider's listener updates the session and App
        // renders past this screen — nothing left to do here.
        return;
      }

      if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          setSent({ kind: 'confirm', email });
        }
        return;
      }

      await requestPasswordReset(email);
      setSent({ kind: 'reset', email });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="login-screen">
        <div className="card login-card login-sent">
          <MailCheck size={32} strokeWidth={1.5} />
          <h1 className="screen-heading">Check your email</h1>
          <p className="dim">
            {sent.kind === 'confirm'
              ? <>We sent a confirmation link to <strong>{sent.email}</strong>. Click it, then sign in.</>
              // Worded so it reveals nothing: Supabase reports success even
              // for an unregistered address, and so must we.
              : <>If <strong>{sent.email}</strong> has an account, a reset link is on its way.</>}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => { setSent(null); switchTo('signin'); }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const copy = COPY[mode];

  return (
    <div className="login-screen">
      <div className="card login-card">
        <h1 className="screen-heading">{copy.title}</h1>

        {mode === 'forgot' && (
          <p className="dim field-note">
            Enter your email and we&rsquo;ll send you a link to set a new password.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailError ? 'true' : undefined}
              required
            />
            {emailError && <p className="field-error">{emailError}</p>}
          </div>

          {needsPassword && (
            <div className="input-group">
              <label className="label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={passwordError ? 'true' : undefined}
                required
              />
              {passwordError
                ? <p className="field-error">{passwordError}</p>
                : mode === 'signup' && (
                  <p className="dim field-note">
                    At least {MIN_PASSWORD_LENGTH} characters, with a letter and a number.
                  </p>
                )}
            </div>
          )}

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-accent btn-block" disabled={!canSubmit}>
            {submitting ? copy.busy : copy.action}
          </button>
        </form>

        <div className="login-links">
          {mode === 'signin' && (
            <>
              <button type="button" className="link-btn" onClick={() => switchTo('forgot')}>
                Forgot password?
              </button>
              <button type="button" className="link-btn" onClick={() => switchTo('signup')}>
                Create an account
              </button>
            </>
          )}
          {mode !== 'signin' && (
            <button type="button" className="link-btn" onClick={() => switchTo('signin')}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;
