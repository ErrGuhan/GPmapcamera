import 'react-native-url-polyfill/auto';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { useUploadQueue } from './src/hooks/useUploadQueue';

import AuthScreen from './src/screens/AuthScreen';
import CameraScreen from './src/screens/CameraScreen';
import GalleryScreen from './src/screens/GalleryScreen';

const Stack = createNativeStackNavigator();

/**
 * Inner navigator — rendered only after AuthContext has hydrated.
 * Conditionally shows Auth stack vs. App stack based on session.
 *
 * useUploadQueue is called here (inside AuthProvider) so it has access to
 * the logged-in user and can retry queued uploads on launch / reconnect.
 */
function RootNavigator() {
  const { user, loading } = useAuth();
  useUploadQueue();

  if (loading) {
    // Show a minimal loading screen while the session is being read from
    // AsyncStorage. Prevents a flash of the Auth screen for returning users.
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#FFD400" size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        // Authenticated stack
        <>
          <Stack.Screen name="Camera" component={CameraScreen} />
          <Stack.Screen name="Gallery" component={GalleryScreen} />
        </>
      ) : (
        // Unauthenticated stack
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" hidden />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
