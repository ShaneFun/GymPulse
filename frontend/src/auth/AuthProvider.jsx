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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

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
    signIn,
    signOut,
    changePassword,
    changeEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
