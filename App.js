import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import CameraScreen from './src/screens/CameraScreen';
import GalleryScreen from './src/screens/GalleryScreen';
import AuthScreen from './src/screens/AuthScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { clearLegacyUploadQueue } from './src/utils/localGallery';
import { COLORS } from './src/constants/theme';

const Stack = createNativeStackNavigator();

function AppContent() {
  const { session, loading } = useAuth();

  useEffect(() => {
    // Clear any previous queued background retries to keep local logs clean
    clearLegacyUploadQueue();
  }, []);

  // Show splash / loading spinner during initial session hydration from AsyncStorage
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" hidden />
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Not signed in: show domain-restricted AuthScreen (Login / Sign Up)
  if (!session) {
    return (
      <View style={styles.authContainer}>
        <StatusBar style="light" />
        <AuthScreen />
      </View>
    );
  }

  // Authenticated user: mount main camera stack
  return (
    <NavigationContainer>
      <StatusBar style="light" hidden />
      <Stack.Navigator
        initialRouteName="Camera"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Camera" component={CameraScreen} />
        <Stack.Screen name="Gallery" component={GalleryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
});
