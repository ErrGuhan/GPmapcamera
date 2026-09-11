import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';

import OverlayCapture from '../components/OverlayCapture';
import { getLocationData, getStaticMapUrl } from '../utils/location';
import { getFormattedDateTime } from '../utils/dateTime';
import { cleanupTempFile } from '../utils/overlay';
import { saveLocalCapture } from '../utils/localGallery';
import { COLORS } from '../constants/theme';

// Optional: Replace with your Google Static Maps API key if desired.
const GOOGLE_STATIC_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

export default function CameraScreen({ navigation }) {
  const cameraRef = useRef(null);
  const overlayRef = useRef(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, setMediaPermission] = useState({ granted: true });

  const [isCapturing, setIsCapturing] = useState(false);
  const [locationPreview, setLocationPreview] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        if (!cameraPermission?.granted) await requestCameraPermission();
      } catch (e) {
        console.warn('Camera permission request error:', e);
      }
      try {
        const perm = await MediaLibrary.getPermissionsAsync(true);
        setMediaPermission(perm);
      } catch (e) {
        // In Expo Go on Android, default to true so viewfinder is not blocked
        setMediaPermission({ granted: true });
      }
    })();
  }, []);

  // Live location updates for the viewfinder banner
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getLocationData();
        if (mounted) setLocationPreview(data);
      } catch (e) {
        console.warn('Initial location fetch failed:', e);
      }
    })();

    const interval = setInterval(async () => {
      try {
        const data = await getLocationData();
        if (mounted) setLocationPreview(data);
      } catch (e) {
        // keep last known position
      }
    }, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleCapture() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      // 1. Capture raw photo from camera sensor
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      // 2. Refresh location and timestamp at capture moment
      let coords = locationPreview?.coords;
      let address = locationPreview?.address;
      try {
        const fresh = await getLocationData();
        coords = fresh.coords;
        address = fresh.address;
      } catch (locErr) {
        // Fall back to preview location
      }

      const dateTime = getFormattedDateTime();
      const mapUri = coords
        ? getStaticMapUrl(coords.latitude, coords.longitude, GOOGLE_STATIC_MAPS_API_KEY)
        : null;

      // 3. Composite photo with location & timestamp watermark banner
      let finalUri = photo.uri;
      if (overlayRef.current?.compositePhoto) {
        finalUri = await overlayRef.current.compositePhoto({
          photoUri: photo.uri,
          coords,
          address,
          dateTime,
          mapUri,
        });
      }

      // 4. Save to phone's public Media Gallery (DCIM / Photos)
      try {
        await MediaLibrary.saveToLibraryAsync(finalUri);
      } catch (err) {
        console.warn('Could not save to system gallery:', err.message);
      }

      // 5. Save to app persistent local memory for in-app Gallery
      await saveLocalCapture({
        uri: finalUri,
        address,
        coords,
        dateTime,
      });

      // 6. Clean up temporary un-watermarked camera cache photo
      if (finalUri !== photo.uri) {
        await cleanupTempFile(photo.uri);
      }

      // 7. Show success feedback
      setToastMessage('✓ Photo saved to gallery with watermark!');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to capture photo.');
    } finally {
      setIsCapturing(false);
    }
  }

  if (!cameraPermission || !mediaPermission) {
    return <View style={styles.center} />;
  }

  if (!cameraPermission.granted || !mediaPermission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          Camera and storage permissions are required to use this app.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={() => {
            requestCameraPermission();
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* On-screen ViewShot compositing layer (renders during capture) */}
      <OverlayCapture ref={overlayRef} />

      {/* On-screen live preview of current GPS & address */}
      {locationPreview && !isCapturing && (
        <View style={styles.livePreviewOverlay} pointerEvents="none">
          <View style={styles.livePreviewHeader}>
            <Text style={styles.previewTag}>GPS ACTIVE</Text>
          </View>
          <Text style={styles.previewTitle} numberOfLines={1}>
            {locationPreview.address.city || 'Location'}
            {locationPreview.address.region ? `, ${locationPreview.address.region}` : ''}
          </Text>
          <Text style={styles.previewBody}>
            Lat {locationPreview.coords.latitude.toFixed(6)}°, Long{' '}
            {locationPreview.coords.longitude.toFixed(6)}°
          </Text>
          <Text style={styles.previewBody}>{getFormattedDateTime()}</Text>
        </View>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Controls Bar */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={() => navigation.navigate('Gallery')}
        >
          <Text style={styles.galleryButtonText}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shutterButton}
          onPress={handleCapture}
          disabled={isCapturing}
        >
          {isCapturing ? (
            <ActivityIndicator color="#000" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </TouchableOpacity>

        <View style={{ width: 70 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  permissionText: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 16,
  },
  permissionButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: { fontWeight: 'bold', color: '#000' },
  livePreviewOverlay: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  livePreviewHeader: {
    marginBottom: 2,
  },
  previewTag: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  previewTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  previewBody: { color: '#e2e8f0', fontSize: 12, marginTop: 2 },
  toast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.9)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  controls: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  galleryButton: {
    width: 70,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#000',
  },
});
