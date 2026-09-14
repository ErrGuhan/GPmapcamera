import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Attempt to resolve from babel-plugin-dotenv (@env) if available
let envUrl = '';
let envKey = '';
try {
  // eslint-disable-next-line
  const env = require('@env');
  envUrl = env?.SUPABASE_URL || '';
  envKey = env?.SUPABASE_ANON_KEY || '';
} catch (e) {
  // @env not available in standard web / Vercel runtime
}

// Default Supabase project credentials.
// The anon/publishable key is explicitly safe for public client-side use under Row Level Security (RLS).
const DEFAULT_SUPABASE_URL = 'https://euyiaveqzvdmiveqenij.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_wyVEQfXPxqVC1jtOVZrcew_r-b9pNad';

// Support Vercel Dashboard env vars, EXPO_PUBLIC_* standard, @env, and fallback to default project
const resolvedUrl =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  envUrl ||
  DEFAULT_SUPABASE_URL;

const resolvedKey =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
  envKey ||
  DEFAULT_SUPABASE_ANON_KEY;

const effectiveUrl = resolvedUrl || DEFAULT_SUPABASE_URL;
const effectiveKey = resolvedKey || DEFAULT_SUPABASE_ANON_KEY;

/**
 * Singleton Supabase client.
 *
 * - auth.storage: AsyncStorage persists the session across app restarts so
 *   users stay logged in without re-authenticating every launch.
 * - auth.autoRefreshToken: Supabase JS will silently refresh the JWT before
 *   it expires (default 1-hour expiry).
 * - auth.detectSessionInUrl: false prevents unhandled hash parsing issues.
 */
export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

