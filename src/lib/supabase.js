import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
// babel-plugin-dotenv inlines these at build time from .env
// See babel.config.js for the tradeoff explanation vs expo-constants.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example → .env and fill in your project URL and anon key.'
  );
}

/**
 * Singleton Supabase client.
 *
 * - auth.storage: AsyncStorage persists the session across app restarts so
 *   users stay logged in without re-authenticating every launch.
 * - auth.autoRefreshToken: Supabase JS will silently refresh the JWT before
 *   it expires (default 1-hour expiry).
 * - auth.detectSessionInUrl: should be false in React Native — there's no
 *   browser URL bar to parse OAuth callbacks from.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
