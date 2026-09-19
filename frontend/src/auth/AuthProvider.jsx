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

  const value = { session, user: session?.user ?? null, loading, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
