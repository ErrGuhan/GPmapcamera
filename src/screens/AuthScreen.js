import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

// ---------------------------------------------------------------------------
// College Domain Restriction & Storage Keys
// ---------------------------------------------------------------------------
const ALLOWED_EMAIL_DOMAIN = 'svcet.ac.in';
const REMEMBERED_EMAIL_KEY = '@ourgpscam_remembered_email';

/**
 * AuthScreen — handles both Sign In and Sign Up in a single screen with a
 * toggle. Uses Supabase email/password auth via AuthContext.
 *
 * Domain-restricted: Only accounts with an email ending in @svcet.ac.in
 * are permitted to sign up or sign in.
 *
 * Remember Me: Remembers the entered college email in AsyncStorage for easy
 * one-tap access on future sessions.
 *
 * Navigation: Once the user signs in/up, AuthContext updates `session`,
 * which causes App.js to swap to the Camera stack automatically — no
 * explicit navigation.navigate() call needed here.
 */
export default function AuthScreen() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Hydrate remembered college email on mount
  useEffect(() => {
    (async () => {
      try {
        const savedEmail = await AsyncStorage.getItem(REMEMBERED_EMAIL_KEY);
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      } catch (e) {
        console.warn('Failed to load remembered email:', e);
      }
    })();
  }, []);

  const isSignUp = mode === 'signup';

  function toggleMode() {
    setMode(isSignUp ? 'signin' : 'signup');
    setError('');
    setSuccessMsg('');
    setPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit() {
    setError('');
    setSuccessMsg('');

    const cleanEmail = email.trim();

    // Basic client-side validation
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    // Strict domain check for both sign-up and sign-in
    const expectedDomainSuffix = `@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`;
    if (!cleanEmail.toLowerCase().endsWith(expectedDomainSuffix)) {
      setError(`Only @${ALLOWED_EMAIL_DOMAIN} college email addresses can access this app.`);
      return;
    }

    if (!password) {
      setError('Please enter a password.');
      return;
    }
    if (isSignUp && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(cleanEmail, password);
        // Persist or remove remembered email
        if (rememberMe) {
          await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, cleanEmail);
        } else {
          await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }

        // Supabase may require email confirmation depending on project settings.
        // Show a message instead of assuming immediate sign-in.
        setSuccessMsg(
          'Account created! Check your college email to confirm your address, then sign in.'
        );
        setMode('signin');
        setPassword('');
      } else {
        await signIn(cleanEmail, password);
        // Persist or remove remembered email
        if (rememberMe) {
          await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, cleanEmail);
        } else {
          await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
        // On success, App.js detects the new session and navigates automatically.
      }
    } catch (e) {
      const msg = e?.message || '';
      // Remap raw Postgres trigger / database errors to user-friendly copy
      if (
        msg.includes('svcet.ac.in') ||
        msg.includes('P0001') ||
        msg.toLowerCase().includes('domain') ||
        msg.toLowerCase().includes('database error saving new user') ||
        msg.toLowerCase().includes('unexpected_failure')
      ) {
        setError(`Only @${ALLOWED_EMAIL_DOMAIN} college email addresses can access this app.`);
      } else if (
        msg.toLowerCase().includes('over_email_send_rate_limit') ||
        msg.toLowerCase().includes('rate limit exceeded')
      ) {
        setError('Signup rate limit exceeded. Please wait a few moments before trying again.');
      } else if (
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('load failed')
      ) {
        setError('Network connection error. Please check your internet connection and try again.');
      } else if (
        msg.includes('invalid_credentials') ||
        msg.toLowerCase().includes('invalid login credentials')
      ) {
        setError('Invalid email or password. If you recently created your account, please check your college email to confirm your account first.');
      } else if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already exists')
      ) {
        setError('An account with this college email already exists. Please switch to Sign In.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }


  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / wordmark */}
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>📍</Text>
          </View>
          <Text style={styles.appName}>OurGpsCam</Text>
          <Text style={styles.tagline}>Back up your geotagged photos to the cloud</Text>
        </View>

        {/* Mode toggle pill */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !isSignUp && styles.toggleBtnActive]}
            onPress={() => mode !== 'signin' && toggleMode()}
          >
            <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, isSignUp && styles.toggleBtnActive]}
            onPress={() => mode !== 'signup' && toggleMode()}
          >
            <Text style={[styles.toggleText, isSignUp && styles.toggleTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {successMsg ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>College Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={`yourname@${ALLOWED_EMAIL_DOMAIN}`}
            placeholderTextColor="#555"
            returnKeyType="next"
            editable={!loading}
          />
          <Text style={styles.domainHint}>
            Must be an official @{ALLOWED_EMAIL_DOMAIN} address
          </Text>


          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={isSignUp ? 'At least 6 characters' : '••••••••'}
            placeholderTextColor="#555"
            returnKeyType={isSignUp ? 'next' : 'done'}
            onSubmitEditing={isSignUp ? undefined : handleSubmit}
            editable={!loading}
          />

          {isSignUp && (
            <>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Repeat your password"
                placeholderTextColor="#555"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                editable={!loading}
              />
            </>
          )}

          {/* Remember Me Checkbox */}
          <TouchableOpacity
            style={styles.rememberMeRow}
            onPress={() => setRememberMe(!rememberMe)}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={rememberMe ? 'checkbox' : 'square-outline'}
              size={22}
              color={rememberMe ? COLORS.accent : '#777'}
              style={styles.rememberMeIcon}
            />
            <Text style={styles.rememberMeText}>Remember my college email</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
    backgroundColor: '#000',
  },

  // Hero / branding
  hero: { alignItems: 'center', marginBottom: 40 },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoIcon: { fontSize: 34 },
  appName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  tagline: {
    color: '#888',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },

  // Mode toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 4,
    marginBottom: 28,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: COLORS.accent },
  toggleText: { color: '#888', fontWeight: '600', fontSize: 14 },
  toggleTextActive: { color: '#000' },

  // Form
  form: {},
  label: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: '#111',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#222',
  },
  domainHint: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },

  // Feedback
  errorBox: {
    backgroundColor: '#3d0f0f',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  errorText: { color: '#ff6b6b', fontSize: 13, lineHeight: 18 },
  successBox: {
    backgroundColor: '#0f3d1c',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  successText: { color: '#4ade80', fontSize: 13, lineHeight: 18 },

  // Remember Me checkbox
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 4,
    paddingVertical: 4,
  },
  rememberMeIcon: {
    marginRight: 10,
  },
  rememberMeText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '500',
  },

  // Submit button
  submitBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
