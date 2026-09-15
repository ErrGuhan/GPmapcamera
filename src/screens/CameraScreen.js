import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
  Modal,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';

import OverlayCapture from '../components/OverlayCapture';
import WatermarkBadge, { BADGE_WIDTH, BADGE_HEIGHT } from '../components/WatermarkBadge';
import { getLocationData, getStaticMapUrl } from '../utils/location';
import { getFormattedDateTime } from '../utils/dateTime';
import { cleanupTempFile } from '../utils/overlay';
import { saveLocalCapture, getLocalCaptures } from '../utils/localGallery';
import { uploadCapture, enqueuePendingUpload } from '../utils/upload';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GOOGLE_STATIC_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

export default function CameraScreen({ navigation }) {
  const cameraRef = useRef(null);
  const overlayRef = useRef(null);
  const cameraSwitchTimerRef = useRef(null);
  const cameraSwitchStartTimeRef = useRef(0);

  // Authentication session & actions
  const { user, signOut } = useAuth();

  // Background queue worker: automatically retries pending uploads when online
  useUploadQueue();

  // Device orientation sensor with smooth animated value
  const {
    orientation,
    rotationDegrees,
    animatedRotation,
    rotationStyle,
    isLandscape,
  } = useDeviceOrientation();

  // Permissions
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, setMediaPermission] = useState({ granted: true });

  // Camera Settings
  const [facing, setFacing] = useState(Platform.OS === 'web' ? 'front' : 'back');
  const [flash, setFlash] = useState('off'); // 'off' | 'auto' | 'on'
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(0); // 0 = 1x, 0.25 = 2x
  const [activeZoomLabel, setActiveZoomLabel] = useState('1x');
  const [exposure, setExposure] = useState(0); // -2 to +2
  const [cameraVersion, setCameraVersion] = useState(0);
  const [isCameraSwitching, setIsCameraSwitching] = useState(false);

  // Location & State
  const [isCapturing, setIsCapturing] = useState(false);
  const [locationData, setLocationData] = useState(null);
  const [dateTime, setDateTime] = useState(getFormattedDateTime());
  const [toastMessage, setToastMessage] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null); // 'uploading' | 'saved' | 'pending' | null
  const [savedCount, setSavedCount] = useState(0);

  // Modals & In-UI Alerts
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [showLocationPromptBanner, setShowLocationPromptBanner] = useState(false);
  const [showNoGpsConfirmModal, setShowNoGpsConfirmModal] = useState(false);

  // Load initial permissions and saved count
  useEffect(() => {
    (async () => {
      try {
        if (!cameraPermission?.granted) await requestCameraPermission();
      } catch (e) {
        console.warn('Camera permission request error:', e);
      }
      if (Platform.OS !== 'web') {
        try {
          const perm = await MediaLibrary.getPermissionsAsync(true);
          setMediaPermission(perm);
        } catch {
          setMediaPermission({ granted: true });
        }
      }
      try {
        const captures = await getLocalCaptures();
        setSavedCount(captures.length);
      } catch {
        // silent
      }
    })();
  }, []);

  // Live Location & Time polling with immediate coords resolution callback
  const fetchLocation = useCallback(async () => {
    try {
      const data = await getLocationData((interim) => {
        // Immediately update coordinates on screen as soon as GPS resolves!
        setLocationData((prev) => ({
          coords: interim.coords,
          address: interim.address || prev?.address || { city: 'Pinpointing...' },
        }));
      });
      setLocationData(data);
      setShowLocationPromptBanner(false);
    } catch (e) {
      console.warn('Location fetch error:', e);
    }
  }, []);

  // User-gesture location request handler to satisfy mobile browser restrictions
  const handleRequestLocation = useCallback(async () => {
    console.log('[OurGpsCam] User gesture triggered location request');
    setToastMessage('Acquiring GPS location...');
    try {
      await fetchLocation();
      setShowLocationPromptBanner(false);
      setTimeout(() => setToastMessage(null), 1500);
    } catch (e) {
      console.warn('[OurGpsCam] Location request error:', e);
      setToastMessage('Could not acquire GPS');
      setTimeout(() => setToastMessage(null), 2000);
    }
  }, [fetchLocation]);

  // Check location permission state on mount (especially on web to respect user gesture requirement)
  useEffect(() => {
    let isMounted = true;

    async function checkInitialLocationPermission() {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.permissions?.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' });
          console.log(`[OurGpsCam] Geolocation permission state on mount: ${perm.state}`);
          if (!isMounted) return;

          if (perm.state === 'granted') {
            // Already granted: safe to fetch immediately
            fetchLocation();
            setShowLocationPromptBanner(false);
          } else if (perm.state === 'prompt') {
            // Unprompted: DO NOT auto-fire silent request. Show clear in-UI prompt banner!
            setShowLocationPromptBanner(true);
          } else if (perm.state === 'denied') {
            setShowLocationPromptBanner(false);
          }

          // React to permission changes dynamically (e.g. granted via browser dialog)
          perm.onchange = () => {
            if (!isMounted) return;
            console.log(`[OurGpsCam] Geolocation permission state changed to: ${perm.state}`);
            if (perm.state === 'granted') {
              setShowLocationPromptBanner(false);
              fetchLocation();
            }
          };
        } catch (err) {
          console.warn('[OurGpsCam] Geolocation permissions query error:', err);
          fetchLocation();
        }
      } else {
        // Native platforms (iOS/Android): standard fetchLocation
        fetchLocation();
      }
    }

    checkInitialLocationPermission();

    const locInterval = setInterval(() => {
      // Periodic background refresh if granted or location exists
      fetchLocation();
    }, 12000);

    const timeInterval = setInterval(() => {
      setDateTime(getFormattedDateTime());
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(locInterval);
      clearInterval(timeInterval);
    };
  }, [fetchLocation]);

  // Flash Toggle
  const toggleFlash = useCallback(() => {
    setFlash((prev) => {
      const next = prev === 'off' ? 'auto' : prev === 'auto' ? 'on' : 'off';
      setToastMessage(`Flash: ${next.toUpperCase()}`);
      setTimeout(() => setToastMessage(null), 1200);
      return next;
    });
  }, []);

  // Helper to stop all active video tracks on web before switching camera
  const stopAllWebCameraTracks = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach((v) => {
          if (v.srcObject && typeof v.srcObject.getTracks === 'function') {
            v.srcObject.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch (e) {}
            });
            v.srcObject = null;
          }
        });
      } catch (err) {
        console.warn('[OurGpsCam] Error stopping video tracks:', err);
      }
    }
  }, []);

  // Camera Facing Toggle with web track release, remount delay, and state sync
  const toggleFacing = useCallback(() => {
    if (Platform.OS === 'web') {
      if (isCameraSwitching) return;
      setIsCameraSwitching(true);
      cameraSwitchStartTimeRef.current = Date.now();

      const next = facing === 'back' ? 'front' : 'back';
      console.log(`[OurGpsCam Camera] Switch to ${next} started at ${cameraSwitchStartTimeRef.current}`);
      setToastMessage(`Camera: ${next === 'back' ? 'Rear' : 'Front'}`);

      // 1. Explicitly stop running tracks on existing stream
      stopAllWebCameraTracks();

      // Set fallback safety timeout (4000ms) to ensure HUD dismisses even if onCameraReady doesn't fire
      if (cameraSwitchTimerRef.current) clearTimeout(cameraSwitchTimerRef.current);
      cameraSwitchTimerRef.current = setTimeout(() => {
        setIsCameraSwitching(false);
        setToastMessage(null);
      }, 4000);

      // 2. Allow browser & Android camera HAL 80ms to release hardware handle before mounting next facing
      setTimeout(() => {
        setFacing(next);
        setCameraVersion((v) => v + 1);
        setTimeout(() => setToastMessage(null), 1200);
      }, 80);
    } else {
      setFacing((prev) => {
        const next = prev === 'back' ? 'front' : 'back';
        setToastMessage(`Camera: ${next === 'back' ? 'Rear' : 'Front'}`);
        setTimeout(() => setToastMessage(null), 1200);
        return next;
      });
    }
  }, [facing, isCameraSwitching, stopAllWebCameraTracks]);

  // Callback when camera stream is acquired and ready to render
  const handleCameraReady = useCallback(() => {
    const elapsed = Date.now() - cameraSwitchStartTimeRef.current;
    console.log(`[OurGpsCam Camera] Camera ready for ${facing} (hardware stream acquired in ${elapsed}ms)`);
    if (cameraSwitchTimerRef.current) {
      clearTimeout(cameraSwitchTimerRef.current);
      cameraSwitchTimerRef.current = null;
    }
    setIsCameraSwitching(false);
  }, [facing]);

  // Gracefully handle rear camera mount errors on web
  const handleCameraMountError = useCallback((error) => {
    console.warn('[OurGpsCam] Camera mount error:', error?.nativeEvent || error);
    if (cameraSwitchTimerRef.current) {
      clearTimeout(cameraSwitchTimerRef.current);
      cameraSwitchTimerRef.current = null;
    }
    if (Platform.OS === 'web' && facing === 'back') {
      console.warn('[OurGpsCam] Rear camera unavailable or errored out, reverting to front camera');
      setToastMessage('Rear camera unavailable, switched back to front');
      setTimeout(() => setToastMessage(null), 3000);
      stopAllWebCameraTracks();
      setIsCameraSwitching(true);
      setTimeout(() => {
        setFacing('front');
        setCameraVersion((v) => v + 1);
      }, 80);
    } else {
      setIsCameraSwitching(false);
    }
  }, [facing, stopAllWebCameraTracks]);


  // Compute hardware-calibrated 2x zoom fraction
  const get2xZoomFraction = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const videoElements = document.querySelectorAll('video');
        for (const v of videoElements) {
          const track = v.srcObject?.getVideoTracks?.()[0];
          const capabilities = track?.getCapabilities?.();
          if (capabilities?.zoom) {
            const { min = 1, max = 1 } = capabilities.zoom;
            if (max > min && min <= 2 && 2 <= max) {
              // Normalized fraction in expo-camera: (target - min) / (max - min)
              const fraction = (2 - min) / (max - min);
              return Math.min(1, Math.max(0, fraction));
            }
          }
        }
      } catch (e) {
        console.warn('[OurGpsCam] Could not query video track zoom capabilities:', e);
      }
    }
    // Empirically tested modest 2x default fraction (0.08 produces natural 2x magnification)
    return 0.08;
  }, []);

  // Zoom Handler
  const handleZoomChange = useCallback((label) => {
    setActiveZoomLabel(label);
    if (label === '1x') {
      setZoom(0);
    } else if (label === '2x') {
      const target2x = get2xZoomFraction();
      setZoom(target2x);
    }
  }, [get2xZoomFraction]);

  // ─── Web Zoom Bypass ────────────────────────────────────────────────────────
  // expo-camera's web stack has a bug in convertNormalizedSetting(): it checks
  // `if (!value) return;` which evaluates to true when value === 0, causing
  // zoom=0 (1x) to pass undefined to applyConstraints — a silent no-op.
  // Additionally, useWebCameraStream's capability diff-check means a second
  // tap of 1x is completely skipped (0 !== 0 is false). The physical camera
  // track stays locked at 2x until some unrelated re-render triggers a full
  // capability sync.
  //
  // Fix: on every zoom state change (web only), directly find the live
  // MediaStreamTrack, read its hardware zoom range, convert our normalized
  // expo-camera fraction [0..1] → hardware [min..max], then call
  // applyConstraints directly. This completely bypasses expo-camera's path.
  // iOS/Android are unaffected (Platform guard).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // Use requestAnimationFrame so the MediaStream is guaranteed live
    // before we attempt to read capabilities from it.
    const frameId = requestAnimationFrame(() => {
      try {
        const videoEls = document.querySelectorAll('video');
        for (const v of videoEls) {
          const track = v.srcObject?.getVideoTracks?.()[0];
          if (!track) continue;

          const caps = track.getCapabilities?.();
          if (!caps?.zoom) continue;

          const { min = 1, max = 1 } = caps.zoom;

          // Convert expo-camera's normalized fraction [0..1] → hardware [min..max].
          // zoom=0 correctly maps to `min` (true 1x), not undefined.
          const hwZoom = min + zoom * (max - min);
          const clamped = Math.min(max, Math.max(min, hwZoom));

          console.log(
            `[OurGpsCam] Web zoom bypass: normalized=${zoom}, hw=${clamped.toFixed(3)} (range ${min}-${max})`
          );

          track
            .applyConstraints({ advanced: [{ zoom: clamped }] })
            .catch((e) => {
              console.warn('[OurGpsCam] Direct zoom applyConstraints failed:', e?.message || e);
            });

          // Only the first live track matters — stop after the first hit.
          break;
        }
      } catch (e) {
        console.warn('[OurGpsCam] Web zoom bypass error:', e?.message || e);
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [zoom]); // Re-runs on every zoom state change (1x↔2x transitions)
  // ────────────────────────────────────────────────────────────────────────────

  // Vertical Exposure Slider PanResponder with render-throttling
  const exposureRef = useRef(exposure);
  exposureRef.current = exposure;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        const delta = -gestureState.dy / 40;
        const clamped = Math.max(-2, Math.min(2, Math.round(delta * 2) / 2));
        if (clamped !== exposureRef.current) {
          exposureRef.current = clamped;
          setExposure(clamped);
        }
      },
    })
  ).current;

  // Execute Capture & Watermark Compositing
  const executeCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      const coords = locationData?.coords || { latitude: 0, longitude: 0 };
      const address = locationData?.address || { city: 'Unknown' };
      const currentDateTime = getFormattedDateTime();
      const mapUri = getStaticMapUrl(coords.latitude, coords.longitude, GOOGLE_STATIC_MAPS_API_KEY);

      // Orient photo for landscape captures:
      // Because Android app orientation is locked to portrait in app.json, the camera
      // sensor delivers a portrait-oriented buffer. If the user held the phone in landscape,
      // we rotate the photo so the saved image is a true landscape photo (width > height) and upright.
      let orientedPhotoUri = photo.uri;
      let rotatedTempUri = null;

      const isLandscapeCapture = rotationDegrees === 90 || rotationDegrees === 270;
      if (isLandscapeCapture) {
        try {
          const rotateAngle = rotationDegrees === 90 ? 270 : 90;
          const manipulated = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ rotate: rotateAngle }],
            { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
          );
          if (manipulated?.uri) {
            orientedPhotoUri = manipulated.uri;
            rotatedTempUri = manipulated.uri;
          }
        } catch (manipErr) {
          console.warn('Image rotation warning:', manipErr);
          orientedPhotoUri = photo.uri;
        }
      }

      let finalUri = orientedPhotoUri;
      if (overlayRef.current?.compositePhoto) {
        finalUri = await overlayRef.current.compositePhoto({
          photoUri: orientedPhotoUri,
          coords,
          address,
          dateTime: currentDateTime,
          mapUri,
          rotationDegrees,
        });
      }

      if (Platform.OS !== 'web') {
        try {
          await MediaLibrary.saveToLibraryAsync(finalUri);
        } catch (err) {
          console.warn('System gallery save notice:', err.message);
        }
      }

      await saveLocalCapture({
        uri: finalUri,
        address,
        coords,
        dateTime: currentDateTime,
      });

      if (finalUri !== photo.uri) {
        await cleanupTempFile(photo.uri);
      }
      if (rotatedTempUri && rotatedTempUri !== finalUri) {
        await cleanupTempFile(rotatedTempUri);
      }

      setSavedCount((c) => c + 1);
      setToastMessage('✓ Photo saved to gallery!');
      setTimeout(() => setToastMessage(null), 2500);

      // Fire-and-forget Supabase cloud upload pipeline
      if (user?.id) {
        const metadata = {
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          address: address || {},
          capturedAt: new Date().toISOString(),
        };

        setUploadStatus('uploading');
        uploadCapture(finalUri, user.id, metadata)
          .then(() => {
            setUploadStatus('saved');
            setTimeout(() => setUploadStatus(null), 2500);
          })
          .catch((uploadErr) => {
            console.warn('[CameraScreen] Cloud upload failed, queueing offline:', uploadErr?.message || uploadErr);
            enqueuePendingUpload({
              id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              localUri: finalUri,
              userId: user.id,
              metadata,
            });
            setUploadStatus('pending');
            setTimeout(() => setUploadStatus(null), 3000);
          });
      }
    } catch (error) {
      console.error(error);
      if (Platform.OS === 'web') {
        setToastMessage(`Capture Failed: ${error.message || 'Error'}`);
        setTimeout(() => setToastMessage(null), 3000);
      } else {
        Alert.alert('Capture Failed', error.message || 'Could not take photo.');
      }
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, locationData, rotationDegrees, user?.id]);

  // Main Shutter Trigger with Unresolved Location Check
  const handleCapture = useCallback(() => {
    if (isCapturing) return;

    // Check if location has resolved with valid coordinates
    const hasResolvedGps =
      locationData?.coords &&
      (locationData.coords.latitude !== 0 || locationData.coords.longitude !== 0) &&
      locationData.address?.city !== 'Unknown' &&
      locationData.address?.city !== 'Detecting...';

    if (!hasResolvedGps) {
      setShowNoGpsConfirmModal(true);
      return;
    }

    executeCapture();
  }, [executeCapture, isCapturing, locationData]);

  // Web keyboard shortcuts for easy desktop access
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleCapture();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFlash();
      } else if (e.key === 'g' || e.key === 'G') {
        setShowGrid((v) => !v);
      } else if (e.key === 'c' || e.key === 'C') {
        toggleFacing();
      } else if (e.key === 'Escape') {
        setShowLocationModal(false);
        setShowSettingsModal(false);
        setShowNoGpsConfirmModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCapture, toggleFlash, toggleFacing]);

  // Web PWA Install Prompt Listener
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    if (window.deferredInstallPrompt) {
      setCanInstallPwa(true);
    }

    const handleCanInstall = () => setCanInstallPwa(true);
    const handleInstalled = () => {
      setCanInstallPwa(false);
      setToastMessage('OurGpsCam installed!');
      setTimeout(() => setToastMessage(null), 2500);
    };

    window.addEventListener('ourgpscam-can-install', handleCanInstall);
    window.addEventListener('ourgpscam-installed', handleInstalled);

    return () => {
      window.removeEventListener('ourgpscam-can-install', handleCanInstall);
      window.removeEventListener('ourgpscam-installed', handleInstalled);
    };
  }, []);

  const handleInstallPwa = useCallback(async () => {
    if (typeof window !== 'undefined' && window.deferredInstallPrompt) {
      try {
        await window.deferredInstallPrompt.prompt();
        const choice = await window.deferredInstallPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          setToastMessage('Installing OurGpsCam...');
          setTimeout(() => setToastMessage(null), 2500);
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
      window.deferredInstallPrompt = null;
      setCanInstallPwa(false);
    }
  }, []);

  if (!cameraPermission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          Camera permission is required to use OurGpsCam.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestCameraPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const staticMapUri = locationData?.coords
    ? getStaticMapUrl(locationData.coords.latitude, locationData.coords.longitude, GOOGLE_STATIC_MAPS_API_KEY)
    : null;

  // Lockstep translation and rotation interpolation for the live watermark badge.
  // Both position (translateX, translateY) and angle (rotate) are driven by the exact
  // same animatedRotation Animated.Value, eliminating the diagonal skew and shutter overlap
  // that occurred when position jumped instantaneously while angle animated smoothly.
  //
  // Anchors:
  // - Portrait (0°): exactly at bottom: 148, centered horizontally.
  // - Landscape-left (90°): anchored near the photo's true bottom edge (SCREEN_HEIGHT - 250),
  //   clearing the shutter button and bottom controls, docked along the right edge.
  // - Landscape-right (270° / -90°): anchored near the photo's true bottom edge (250),
  //   docked along the left edge.
  const deltaX = SCREEN_WIDTH / 2 - BADGE_HEIGHT / 2 - 20;
  const deltaY90 = (SCREEN_HEIGHT - 250) - (SCREEN_HEIGHT - 148 - BADGE_HEIGHT / 2);
  const deltaY270 = 250 - (SCREEN_HEIGHT - 148 - BADGE_HEIGHT / 2);

  const badgeTranslateX = animatedRotation.interpolate({
    inputRange: [-90, 0, 90],
    outputRange: [-deltaX, 0, deltaX],
  });

  const badgeTranslateY = animatedRotation.interpolate({
    inputRange: [-90, 0, 90],
    outputRange: [deltaY270, 0, deltaY90],
  });

  const badgeRotate = animatedRotation.interpolate({
    inputRange: [-90, 0, 90],
    outputRange: ['-90deg', '0deg', '90deg'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.appShell}>
        {/* Live Camera Viewfinder */}
        <CameraView
          key={Platform.OS === 'web' ? `camera-${facing}-${cameraVersion}` : undefined}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          zoom={zoom}
          isPinchToZoomEnabled={true}
          onCameraReady={handleCameraReady}
          onMountError={handleCameraMountError}
        />

        {/* Camera Switching Loading HUD */}
        {isCameraSwitching && (
          <View style={styles.cameraSwitchingOverlay} pointerEvents="none">
            <View style={styles.cameraSwitchingCard}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.cameraSwitchingText}>
                Switching to {facing === 'back' ? 'Rear' : 'Front'} Camera...
              </Text>
            </View>
          </View>
        )}

        {/* Grid Lines Overlay (Proper Rule-of-Thirds 3x3) */}
        {showGrid && (
          <View style={styles.gridOverlay} pointerEvents="none">
            <View style={styles.gridCol} />
            <View style={styles.gridCol} />
            <View style={[styles.gridRow, styles.gridRowTop]} />
            <View style={[styles.gridRow, styles.gridRowBottom]} />
          </View>
        )}

        {/* Off-screen/On-screen Compositing View */}
        <OverlayCapture ref={overlayRef} />

        {/* ================================================================= */}
        {/* Top Controls Bar (Flash, Flip, Location, Grid, Settings) */}
        {/* ================================================================= */}
        <View style={styles.topBar}>
          {/* 1. Flash Mode */}
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={toggleFlash}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View style={rotationStyle}>
              <Ionicons
                name={
                  flash === 'on'
                    ? 'flash'
                    : flash === 'auto'
                    ? 'flash-outline'
                    : 'flash-off'
                }
                size={22}
                color={flash === 'on' ? COLORS.accent : '#fff'}
              />
            </Animated.View>
          </TouchableOpacity>

          {/* 2. Flip Camera */}
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={toggleFacing}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View style={rotationStyle}>
              <Ionicons name="camera-reverse-outline" size={23} color="#fff" />
            </Animated.View>
          </TouchableOpacity>

          {/* 3. Location Info */}
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => {
              if (showLocationPromptBanner) {
                handleRequestLocation();
              } else {
                setShowLocationModal(true);
              }
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View style={rotationStyle}>
              <Ionicons
                name={locationData?.coords ? 'location' : 'location-outline'}
                size={23}
                color={locationData?.coords ? COLORS.accent : '#fff'}
              />
            </Animated.View>
          </TouchableOpacity>

          {/* 4. Grid Toggle */}
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => setShowGrid(!showGrid)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View style={rotationStyle}>
              <Ionicons
                name={showGrid ? 'grid' : 'grid-outline'}
                size={22}
                color={showGrid ? COLORS.accent : '#fff'}
              />
            </Animated.View>
          </TouchableOpacity>

          {/* 5. Settings */}
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => setShowSettingsModal(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View style={rotationStyle}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* PWA Install Banner for Web */}
        {canInstallPwa && (
          <TouchableOpacity
            style={styles.pwaInstallBanner}
            onPress={handleInstallPwa}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={15} color="#000" style={{ marginRight: 6 }} />
            <Text style={styles.pwaInstallText}>Install OurGpsCam App</Text>
            <Ionicons name="chevron-forward" size={14} color="#000" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}

        {/* Location Permission In-UI Banner (Requires User Gesture on Web) */}
        {showLocationPromptBanner && (
          <TouchableOpacity
            style={styles.locationPromptBanner}
            onPress={handleRequestLocation}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate-circle" size={20} color="#000" style={{ marginRight: 8 }} />
            <Text style={styles.locationPromptBannerText}>
              Tap to enable location for GPS watermark
            </Text>
            <View style={styles.locationPromptPill}>
              <Text style={styles.locationPromptPillText}>Enable</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ================================================================= */}
        {/* Right-Side Exposure / Brightness Slider */}
        {/* ================================================================= */}
        <View style={styles.exposureContainer} {...panResponder.panHandlers}>
          <View style={styles.exposureTrack}>
            <View
              style={[
                styles.exposureFill,
                {
                  height: `${Math.min(100, Math.max(10, 50 + exposure * 25))}%`,
                },
              ]}
            />
            <View style={styles.exposureSunThumb}>
              <Ionicons name="sunny" size={16} color={COLORS.accent} />
            </View>
          </View>
          <Text style={styles.exposureValue}>
            {exposure > 0 ? `+${exposure}` : `${exposure}`}
          </Text>
        </View>

        {/* ================================================================= */}
        {/* Live Rotating Watermark Badge (Lockstep Animated Position & Angle) */}
        {/* ================================================================= */}
        <Animated.View
          style={[
            styles.liveBadgeContainer,
            {
              transform: [
                { translateX: badgeTranslateX },
                { translateY: badgeTranslateY },
                { rotate: badgeRotate },
              ],
            },
          ]}
          pointerEvents="box-none"
        >
          <WatermarkBadge
            address={locationData?.address}
            coords={locationData?.coords}
            dateTime={dateTime}
            mapUri={staticMapUri}
          />
        </Animated.View>

        {/* ================================================================= */}
        {/* Zoom Selector (1x / 2x) */}
        {/* ================================================================= */}
        <View style={styles.zoomContainer}>
          <View style={styles.zoomPill}>
            <TouchableOpacity
              style={[
                styles.zoomBtn,
                activeZoomLabel === '1x' && styles.zoomBtnActive,
              ]}
              onPress={() => handleZoomChange('1x')}
            >
              <Animated.Text
                style={[
                  styles.zoomText,
                  activeZoomLabel === '1x' && styles.zoomTextActive,
                  rotationStyle,
                ]}
              >
                1x
              </Animated.Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.zoomBtn,
                activeZoomLabel === '2x' && styles.zoomBtnActive,
              ]}
              onPress={() => handleZoomChange('2x')}
            >
              <Animated.Text
                style={[
                  styles.zoomText,
                  activeZoomLabel === '2x' && styles.zoomTextActive,
                  rotationStyle,
                ]}
              >
                2x
              </Animated.Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ================================================================= */}
        {/* Bottom Navigation & Shutter Controls (Preview, Centered Shutter, Storage) */}
        {/* ================================================================= */}
        <View style={styles.bottomBar}>
          {/* Left Column: Preview */}
          <View style={styles.bottomSideCol}>
            <TouchableOpacity
              style={styles.bottomIconBtn}
              onPress={() => navigation.navigate('Gallery')}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <Animated.View style={[styles.bottomIconCircle, rotationStyle]}>
                <Ionicons name="images-outline" size={24} color="#fff" />
              </Animated.View>
              <Text style={styles.bottomLabel}>Preview</Text>
            </TouchableOpacity>
          </View>

          {/* Center Column: Shutter Button */}
          <TouchableOpacity
            style={styles.shutterOuter}
            onPress={handleCapture}
            disabled={isCapturing}
            activeOpacity={0.8}
          >
            {isCapturing ? (
              <ActivityIndicator color="#000" size="large" />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </TouchableOpacity>

          {/* Right Column: Storage */}
          <View style={styles.bottomSideCol}>
            <TouchableOpacity
              style={styles.bottomIconBtn}
              onPress={() => navigation.navigate('Gallery')}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <Animated.View style={[styles.bottomIconCircle, rotationStyle]}>
                <Ionicons name="folder-outline" size={24} color="#fff" />
              </Animated.View>
              <Text style={styles.bottomLabel}>Storage</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Toast Notification */}
        {toastMessage && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        )}

        {/* Non-blocking Cloud Upload Status Badge */}
        {uploadStatus && (
          <View style={styles.uploadStatusBadge} pointerEvents="none">
            {uploadStatus === 'uploading' && (
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 6 }} />
            )}
            {uploadStatus === 'saved' && (
              <Ionicons name="cloud-done" size={16} color="#4ade80" style={{ marginRight: 6 }} />
            )}
            {uploadStatus === 'pending' && (
              <Ionicons name="cloud-offline" size={16} color="#fbbf24" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.uploadStatusText}>
              {uploadStatus === 'uploading'
                ? 'Uploading…'
                : uploadStatus === 'saved'
                ? 'Saved to cloud'
                : 'Upload pending (offline)'}
            </Text>
          </View>
        )}

        {/* Location Details Modal */}
        <Modal
          visible={showLocationModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowLocationModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Location Info</Text>
                <TouchableOpacity
                  onPress={() => setShowLocationModal(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalItemTitle}>Current City & Area:</Text>
              <Text style={styles.modalItemValue}>
                {locationData?.address?.city || 'Detecting...'},{' '}
                {locationData?.address?.region} {locationData?.address?.country}{' '}
                {locationData?.address?.flag}
              </Text>

              <Text style={styles.modalItemTitle}>Street / Plus Code:</Text>
              <Text style={styles.modalItemValue}>
                {locationData?.address?.street || 'GPS Pinpointed Address'}
              </Text>

              <Text style={styles.modalItemTitle}>GPS Coordinates:</Text>
              <Text style={styles.modalItemValue}>
                Lat: {locationData?.coords?.latitude?.toFixed(6) || '0.000000'}°{'\n'}
                Long: {locationData?.coords?.longitude?.toFixed(6) || '0.000000'}°
              </Text>

              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={() => {
                  fetchLocation();
                  setShowLocationModal(false);
                  setToastMessage('Refreshed GPS Location');
                  setTimeout(() => setToastMessage(null), 1500);
                }}
              >
                <Text style={styles.modalActionBtnText}>Refresh GPS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Settings Modal */}
        <Modal
          visible={showSettingsModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowSettingsModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Camera Settings</Text>
                <TouchableOpacity
                  onPress={() => setShowSettingsModal(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Grid Lines</Text>
                <TouchableOpacity
                  style={[styles.toggleBtn, showGrid && styles.toggleBtnActive]}
                  onPress={() => setShowGrid(!showGrid)}
                >
                  <Text style={styles.toggleBtnText}>{showGrid ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Watermark Orientation</Text>
                <Text style={styles.settingValue}>{orientation.toUpperCase()}</Text>
              </View>

              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Photos Saved</Text>
                <Text style={styles.settingValue}>{savedCount}</Text>
              </View>

              {user?.email && (
                <View style={styles.settingRow}>
                  <Text style={styles.settingText}>Account</Text>
                  <Text style={[styles.settingValue, { fontSize: 13, maxWidth: 190 }]} numberOfLines={1}>
                    {user.email}
                  </Text>
                </View>
              )}

              {canInstallPwa && (
                <View style={styles.settingRow}>
                  <Text style={styles.settingText}>Install App (PWA)</Text>
                  <TouchableOpacity
                    style={[styles.toggleBtn, styles.toggleBtnActive, { paddingHorizontal: 12 }]}
                    onPress={() => {
                      setShowSettingsModal(false);
                      handleInstallPwa();
                    }}
                  >
                    <Text style={styles.toggleBtnText}>INSTALL</Text>
                  </TouchableOpacity>
                </View>
              )}

              {user && (
                <TouchableOpacity
                  style={styles.signOutBtn}
                  onPress={async () => {
                    try {
                      setShowSettingsModal(false);
                      setToastMessage('Signing out...');
                      await signOut();
                    } catch (err) {
                      setToastMessage(err?.message || 'Could not sign out.');
                      setTimeout(() => setToastMessage(null), 2500);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="log-out-outline" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={styles.signOutBtnText}>Sign Out</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.modalActionBtn, { marginTop: 14 }]}
                onPress={() => setShowSettingsModal(false)}
              >
                <Text style={styles.modalActionBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Confirmation Modal when Location is Unresolved */}
        <Modal
          visible={showNoGpsConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNoGpsConfirmModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.confirmModalCard}>
              <View style={styles.confirmModalIcon}>
                <Ionicons name="location-outline" size={32} color="#f59e0b" />
              </View>
              <Text style={styles.confirmModalTitle}>Location Not Found</Text>
              <Text style={styles.confirmModalDesc}>
                Location hasn't been found yet — this photo will be saved without GPS data.{'\n\n'}Capture anyway?
              </Text>
              <View style={styles.confirmModalBtnRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setShowNoGpsConfirmModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmProceedBtn}
                  onPress={() => {
                    setShowNoGpsConfirmModal(false);
                    executeCapture();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmProceedBtnText}>Capture Anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appShell: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },

  // Grid
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  gridCol: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridRowTop: {
    top: '33.33%',
  },
  gridRowBottom: {
    top: '66.66%',
  },



  // Top Bar
  topBar: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 20,
  },
  topBarBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Exposure Slider
  exposureContainer: {
    position: 'absolute',
    right: 14,
    top: '32%',
    height: 190,
    alignItems: 'center',
    zIndex: 20,
  },
  exposureTrack: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  exposureFill: {
    width: 3,
    backgroundColor: COLORS.accent,
    borderRadius: 1.5,
  },
  exposureSunThumb: {
    position: 'absolute',
    top: '44%',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  exposureValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 6,
  },

  // Zoom Selector (1x / 2x)
  zoomContainer: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    zIndex: 20,
  },
  zoomPill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 22,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  zoomBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomBtnActive: {
    backgroundColor: COLORS.accent,
  },
  zoomText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  zoomTextActive: {
    color: '#000000',
  },

  // Bottom Controls Bar
  bottomBar: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 20,
  },
  bottomSideCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomIconBtn: {
    alignItems: 'center',
    width: 64,
  },
  bottomIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bottomLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },

  // Shutter
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ffffff',
  },

  // Toast
  toast: {
    position: 'absolute',
    top: 105,
    alignSelf: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.92)',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4ade80',
    zIndex: 30,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  uploadStatusBadge: {
    position: 'absolute',
    bottom: 116,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 212, 0, 0.35)',
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  uploadStatusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#161922',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalItemTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
    textTransform: 'uppercase',
  },
  modalItemValue: {
    color: '#fff',
    fontSize: 14,
    marginTop: 2,
    lineHeight: 20,
  },
  modalActionBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  modalActionBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#232936',
  },
  settingText: {
    color: '#fff',
    fontSize: 14,
  },
  settingValue: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: 'bold',
  },
  toggleBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#22c55e',
  },
  toggleBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  pwaInstallBanner: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  pwaInstallText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  liveBadgeContainer: {
    position: 'absolute',
    left: (SCREEN_WIDTH - BADGE_WIDTH) / 2,
    bottom: 148,
    width: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    zIndex: 15,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#271216',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
  },
  signOutBtnText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Location Gesture Prompt Banner
  locationPromptBanner: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 62 : 94,
    left: 16,
    right: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  locationPromptBannerText: {
    flex: 1,
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  locationPromptPill: {
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  locationPromptPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // No GPS Confirmation Modal
  confirmModalCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  confirmModalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmModalDesc: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmModalBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  confirmCancelBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmProceedBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  confirmProceedBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Camera Switching HUD
  cameraSwitchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  cameraSwitchingCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cameraSwitchingText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    letterSpacing: 0.3,
  },
});
