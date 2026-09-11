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

// Support Vercel Dashboard env vars, EXPO_PUBLIC_* standard, and @env
const resolvedUrl =
  envUrl ||
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  '';

const resolvedKey =
  envKey ||
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
  '';

if (!resolvedUrl || !resolvedKey) {
  console.warn(
    '⚠️ Missing Supabase environment variables! Please configure SUPABASE_URL and SUPABASE_ANON_KEY in your Vercel Dashboard or .env file.'
  );
}

// Fallback dummy credentials to prevent createClient from crashing if env vars are pending in Vercel
const effectiveUrl = resolvedUrl || 'https://placeholder-project.supabase.co';
const effectiveKey = resolvedKey || 'placeholder-anon-key';

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

