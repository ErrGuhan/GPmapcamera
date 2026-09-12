import React, { useState } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

/**
 * AuthScreen — handles both Sign In and Sign Up in a single screen with a
 * toggle. Uses Supabase email/password auth via AuthContext.
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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

    // Basic client-side validation
    if (!email.trim()) {
      setError('Please enter your email address.');
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
        await signUp(email.trim(), password);
        // Supabase may require email confirmation depending on project settings.
        // Show a message instead of assuming immediate sign-in.
        setSuccessMsg(
          'Account created! Check your email to confirm your address, then sign in.'
        );
        setMode('signin');
        setPassword('');
      } else {
        await signIn(email.trim(), password);
        // On success, App.js detects the new session and navigates automatically.
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
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

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#555"
            returnKeyType="next"
            editable={!loading}
          />

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

  // Submit button
  submitBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
