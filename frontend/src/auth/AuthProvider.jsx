import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components -- context hook and provider are intentionally colocated
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // True between clicking a password-reset link and choosing a new password.
  // Supabase signs the user in to do this, so without a flag they would land
  // in the app with no idea the reset never completed.
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch((err) => {
        // A corrupt/unreadable stored session would otherwise leave
        // `loading` true forever, stuck on the loading screen.
        console.error('getSession:', err);
        setSession(null);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  // Returns needsConfirmation: with "Confirm email" on, Supabase creates the
  // user but no session, and the caller has to say "check your inbox"
  // instead of dropping the user on a screen that looks like a failure.
  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  };

  // Supabase reports success even for an address that has no account, so
  // that this cannot be used to discover who is registered. The UI has to
  // be worded to match ("if that address has an account...").
  const requestPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
  };

  // Finishes the flow the recovery link started. No current password is
  // asked for here -- possession of the emailed link is the proof.
  const completePasswordReset = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    setRecovery(false);
  };

  const signOut = () => {
    setRecovery(false);
    return supabase.auth.signOut();
  };

  // Supabase lets a signed-in user set a new password without proving they
  // know the old one. That is a real hazard on a phone left unlocked, so
  // re-authenticate first and refuse if the current password is wrong.
  const changePassword = async (currentPassword, newPassword) => {
    const email = session?.user?.email;
    if (!email) throw new Error('You are not signed in.');

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email, password: currentPassword,
    });
    if (reauthError) throw new Error('Your current password is not correct.');

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  };

  // Does not take effect immediately: Supabase emails a confirmation link to
  // the new address, and the old one keeps working until it is clicked.
  const changeEmail = async (newEmail) => {
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) throw new Error(error.message);
  };

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    recovery,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    completePasswordReset,
    changePassword,
    changeEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
