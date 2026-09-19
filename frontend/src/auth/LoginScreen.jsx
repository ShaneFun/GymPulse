import { useState } from 'react';
import { useAuth } from './AuthProvider';

function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
    }
    // On success, AuthProvider's onAuthStateChange updates the session and
    // App re-renders past this screen — nothing left to do here.
  };

  return (
    <div className="login-screen">
      <div className="card login-card">
        <h1 className="screen-heading">GymPulse</h1>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

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

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-accent btn-block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginScreen;
