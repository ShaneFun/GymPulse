import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { validateEmail } from '../lib/validation';

// Sign in, or ask for a password-reset link. There is no "create account"
// path on purpose: signups are closed in Supabase, so the only account is
// the owner's, and a link leading to "Signups not allowed for this
// instance" would be worse than no link.
function LoginScreen() {
  const { signIn, requestPasswordReset } = useAuth();

  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Set once the reset email is on its way; the form is replaced by a
  // confirmation rather than sitting there looking like nothing happened.
  const [sentTo, setSentTo] = useState(null);

  // Deliberately not validated on sign-in: an existing password predates
  // the current rules, and enforcing them at the door would lock someone
  // out of an account they still own.
  const emailError = email ? validateEmail(email) : '';
  const canSubmit = !submitting && email && !emailError && (forgot || password);

  const showSignIn = () => {
    setForgot(false);
    setSentTo(null);
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      if (forgot) {
        await requestPasswordReset(email);
        setSentTo(email);
        return;
      }
      const { error: signInError } = await signIn(email, password);
      if (signInError) throw new Error(signInError.message);
      // On success AuthProvider's listener updates the session and App
      // renders past this screen — nothing left to do here.
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="login-screen">
        <div className="card login-card login-sent">
          <MailCheck size={32} strokeWidth={1.5} />
          <h1 className="screen-heading">Check your email</h1>
          {/* Worded so it reveals nothing: Supabase reports success even for
              an address with no account, so that this cannot be used to
              discover who is registered. */}
          <p className="dim">
            If <strong>{sentTo}</strong> has an account, a reset link is on its way.
          </p>
          <button type="button" className="btn btn-secondary btn-block" onClick={showSignIn}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="card login-card">
        <h1 className="screen-heading">{forgot ? 'Reset password' : 'GymPulse'}</h1>

        {forgot && (
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

          {!forgot && (
            <div className="input-group">
              <label className="label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-accent btn-block" disabled={!canSubmit}>
            {submitting
              ? (forgot ? 'Sending…' : 'Signing in…')
              : (forgot ? 'Email me a link' : 'Sign in')}
          </button>
        </form>

        <div className="login-links">
          {forgot ? (
            <button type="button" className="link-btn" onClick={showSignIn}>
              Back to sign in
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={() => { setForgot(true); setError(''); }}>
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;
