import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext(null);

/**
 * Exposes { user, session, loading, signIn, signUp, signOut } to the tree.
 *
 * - `loading` is true during the initial session hydration from AsyncStorage.
 *   Show a splash/loading screen while this is true to avoid a flash of the
 *   Auth screen for users who are already logged in.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Safety timeout: if getSession is delayed by network, unblock after 1.5s
    const timer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 1500);

    // Hydrate session from AsyncStorage on mount
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          setSession(session);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Auth session hydration warning:', err);
        if (mounted) setLoading(false);
      })
      .finally(() => {
        clearTimeout(timer);
      });

    // Keep session in sync with Supabase auth state changes
    // (token refresh, sign-out from another tab, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setSession(session);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Auth actions
  // ---------------------------------------------------------------------------
  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Value
  // ---------------------------------------------------------------------------
  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Convenience hook. Must be used inside AuthProvider.
 *
 * @returns {{ user, session, loading, signIn, signUp, signOut }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
