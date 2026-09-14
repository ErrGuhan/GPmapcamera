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
    // Non-blocking deferred queue cleanup after initial paint
    const timer = setTimeout(() => {
      clearLegacyUploadQueue();
    }, 1200);
    return () => clearTimeout(timer);
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

  // Root NavigationContainer with conditional stack routes based on user session
  return (
    <NavigationContainer>
      <StatusBar style="light" hidden={!!session} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        {!session ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="Gallery" component={GalleryScreen} />
          </>
        )}
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
