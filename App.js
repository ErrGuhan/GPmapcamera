import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import CameraScreen from './src/screens/CameraScreen';
import GalleryScreen from './src/screens/GalleryScreen';
import { clearLegacyUploadQueue } from './src/utils/localGallery';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    // Clear any previous queued background retries to keep local logs clean
    clearLegacyUploadQueue();
  }, []);

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
