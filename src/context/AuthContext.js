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

    // Safety timeout: generous 5-second upper bound as a true last-resort
    // fallback for hung network requests, preventing login flash on slow connections.
    const timer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    // Hydrate session from storage on mount
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          console.log('[OurGpsCam Auth] Hydrated session:', session ? `User ${session?.user?.email}` : 'None');
          setSession(session);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[OurGpsCam Auth] Session hydration warning:', err);
        if (mounted) setLoading(false);
      })
      .finally(() => {
        clearTimeout(timer);
      });

    // Keep session in sync with Supabase auth state changes
    // (token refresh, sign-out from another tab, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          console.log('[OurGpsCam Auth] onAuthStateChange event:', event, 'user:', session?.user?.email ?? 'null');
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
