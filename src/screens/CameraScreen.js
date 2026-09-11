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
import { burnOverlayOntoPhoto, cleanupTempFile } from '../utils/overlay';
import { uploadCapture, enqueuePendingUpload } from '../utils/upload';
import { useAuth } from '../context/AuthContext';

// Replace with your own key from Google Cloud Console (Static Maps API).
const GOOGLE_STATIC_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

// Upload status badge values
const UPLOAD_STATUS = {
  IDLE: null,
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  PENDING: 'pending',
  ERROR: 'error',
};

export default function CameraScreen({ navigation }) {
  const cameraRef = useRef(null);
  const overlayRef = useRef(null);

  const { user } = useAuth();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, setMediaPermission] = useState({ granted: true });

  const [isCapturing, setIsCapturing] = useState(false);
  const [locationPreview, setLocationPreview] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(UPLOAD_STATUS.IDLE);

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
        // In Expo Go on Android, MediaLibrary permission requests are restricted
        // by Google Play policy. Default to granted so UI doesn't block.
        setMediaPermission({ granted: true });
      }
    })();
  }, []);

  // Fetch a live location preview so the on-screen overlay looks accurate
  // before the user even taps the shutter.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getLocationData();
        if (mounted) setLocationPreview(data);
      } catch (e) {
        console.warn(e);
      }
    })();
    const interval = setInterval(async () => {
      try {
        const data = await getLocationData();
        if (mounted) setLocationPreview(data);
      } catch (e) {
        // silent — keep last known location
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
      // 1. Capture the raw photo.
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      // 2. Get fresh location + address at the moment of capture.
      const { coords, address } = await getLocationData();
      const dateTime = getFormattedDateTime();
      const mapUri = getStaticMapUrl(
        coords.latitude,
        coords.longitude,
        GOOGLE_STATIC_MAPS_API_KEY
      );

      // 3. Update the off-screen overlay with final data, then snapshot it.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const overlayUri = await overlayRef.current.capture(photo.uri);

      // 4. Burn overlay onto the photo.
      const finalUri = await burnOverlayOntoPhoto(
        photo.uri,
        overlayUri,
        photo.width,
        photo.height
      );

      // 5. Save to device gallery.
      try {
        await MediaLibrary.saveToLibraryAsync(finalUri);
      } catch (err) {
        console.warn('Could not save to local device gallery (Expo Go limitation):', err.message);
      }

      // 6. Clean up temp files.
      if (finalUri !== photo.uri) {
        await cleanupTempFile(photo.uri);
      }
      if (overlayUri && overlayUri !== finalUri && overlayUri !== photo.uri) {
        await cleanupTempFile(overlayUri);
      }

      Alert.alert('Saved', 'Photo saved with location watermark.');

      // -----------------------------------------------------------------------
      // 7. Upload to Supabase (non-blocking — does not delay the next capture).
      // -----------------------------------------------------------------------
      if (user?.id) {
        setUploadStatus(UPLOAD_STATUS.UPLOADING);
        const capturedAt = new Date().toISOString();
        const metadata = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          address,
          capturedAt,
        };

        try {
          await uploadCapture(finalUri, user.id, metadata);
          setUploadStatus(UPLOAD_STATUS.SUCCESS);
          // Auto-clear the success badge after 3 seconds
          setTimeout(() => setUploadStatus(UPLOAD_STATUS.IDLE), 3000);
        } catch (uploadError) {
          console.warn('[CameraScreen] Upload failed, queuing:', uploadError.message);
          // Persist to the offline queue so useUploadQueue can retry later
          await enqueuePendingUpload({
            id: `${user.id}_${Date.now()}`,
            localUri: finalUri,
            userId: user.id,
            metadata,
          });
          setUploadStatus(UPLOAD_STATUS.PENDING);
          // Keep the "pending" badge visible until next successful retry
        }
      }
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
            requestMediaPermission();
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

      {/* Off-screen overlay used for the actual burned watermark */}
      {locationPreview && (
        <OverlayCapture
          ref={overlayRef}
          address={locationPreview.address}
          coords={locationPreview.coords}
          dateTime={getFormattedDateTime()}
          mapUri={getStaticMapUrl(
            locationPreview.coords.latitude,
            locationPreview.coords.longitude,
            GOOGLE_STATIC_MAPS_API_KEY
          )}
        />
      )}

      {/* On-screen live preview of what the overlay will look like */}
      {locationPreview && (
        <View style={styles.livePreviewOverlay} pointerEvents="none">
          <Text style={styles.previewTitle}>
            {locationPreview.address.city}, {locationPreview.address.region}
          </Text>
          <Text style={styles.previewBody}>
            Lat {locationPreview.coords.latitude.toFixed(6)}°, Long{' '}
            {locationPreview.coords.longitude.toFixed(6)}°
          </Text>
          <Text style={styles.previewBody}>{getFormattedDateTime()}</Text>
        </View>
      )}

      {/* Non-blocking upload status badge */}
      {uploadStatus && <UploadStatusBadge status={uploadStatus} />}

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

// ---------------------------------------------------------------------------
// Upload status badge (small, non-intrusive)
// ---------------------------------------------------------------------------
function UploadStatusBadge({ status }) {
  const config = {
    [UPLOAD_STATUS.UPLOADING]: { label: 'Uploading…', color: '#FFD400', textColor: '#000' },
    [UPLOAD_STATUS.SUCCESS]:   { label: 'Saved to cloud ✓', color: '#22c55e', textColor: '#fff' },
    [UPLOAD_STATUS.PENDING]:   { label: 'Pending upload ☁', color: '#3b82f6', textColor: '#fff' },
    [UPLOAD_STATUS.ERROR]:     { label: 'Upload failed', color: '#ef4444', textColor: '#fff' },
  };
  const cfg = config[status];
  if (!cfg) return null;

  return (
    <View style={[styles.uploadBadge, { backgroundColor: cfg.color }]}>
      <Text style={[styles.uploadBadgeText, { color: cfg.textColor }]}>{cfg.label}</Text>
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
    backgroundColor: '#FFD400',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: { fontWeight: 'bold' },
  livePreviewOverlay: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 12,
    borderRadius: 8,
  },
  previewTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  previewBody: { color: '#fff', fontSize: 13, marginTop: 2 },
  // Upload badge: sits above the live preview, non-blocking
  uploadBadge: {
    position: 'absolute',
    bottom: 200,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  uploadBadgeText: { fontSize: 13, fontWeight: '600' },
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryButtonText: { color: '#fff' },
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
