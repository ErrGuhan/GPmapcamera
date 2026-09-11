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
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GOOGLE_STATIC_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

export default function CameraScreen({ navigation }) {
  const cameraRef = useRef(null);
  const overlayRef = useRef(null);

  // Device orientation sensor
  const { orientation, rotationDegrees, rotationStyle, isLandscape } = useDeviceOrientation();

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

  // Location & State
  const [isCapturing, setIsCapturing] = useState(false);
  const [locationData, setLocationData] = useState(null);
  const [dateTime, setDateTime] = useState(getFormattedDateTime());
  const [toastMessage, setToastMessage] = useState(null);
  const [savedCount, setSavedCount] = useState(0);

  // Modals
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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

  // Live Location & Time polling
  const fetchLocation = useCallback(async () => {
    try {
      const data = await getLocationData();
      setLocationData(data);
    } catch (e) {
      console.warn('Location fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
    const locInterval = setInterval(fetchLocation, 12000);
    const timeInterval = setInterval(() => {
      setDateTime(getFormattedDateTime());
    }, 1000);

    return () => {
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

  // Camera Facing Toggle
  const toggleFacing = useCallback(() => {
    setFacing((prev) => {
      const next = prev === 'back' ? 'front' : 'back';
      setToastMessage(`Camera: ${next === 'back' ? 'Rear' : 'Front'}`);
      setTimeout(() => setToastMessage(null), 1200);
      return next;
    });
  }, []);

  // Zoom Handler
  const handleZoomChange = (label) => {
    setActiveZoomLabel(label);
    if (label === '1x') setZoom(0);
    else if (label === '2x') setZoom(0.25);
  };

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

  // Capture & Watermark Handler
  const handleCapture = useCallback(async () => {
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
    } catch (error) {
      console.error(error);
      Alert.alert('Capture Failed', error.message || 'Could not take photo.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, locationData, rotationDegrees]);

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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCapture, toggleFlash, toggleFacing]);

  if (!cameraPermission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          Camera permission is required to use GPS Map Camera.
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

  // Exact bottom center positioning for the live watermark
  let liveBadgePositionStyle = {
    position: 'absolute',
    left: (SCREEN_WIDTH - BADGE_WIDTH) / 2,
    bottom: 148,
    zIndex: 15,
  };

  if (rotationDegrees === 90) {
    const centerX = SCREEN_WIDTH - BADGE_HEIGHT / 2 - 20;
    const centerY = SCREEN_HEIGHT / 2;
    liveBadgePositionStyle = {
      position: 'absolute',
      left: centerX - BADGE_WIDTH / 2,
      top: centerY - BADGE_HEIGHT / 2,
      zIndex: 15,
    };
  } else if (rotationDegrees === 270) {
    const centerX = BADGE_HEIGHT / 2 + 20;
    const centerY = SCREEN_HEIGHT / 2;
    liveBadgePositionStyle = {
      position: 'absolute',
      left: centerX - BADGE_WIDTH / 2,
      top: centerY - BADGE_HEIGHT / 2,
      zIndex: 15,
    };
  }

  return (
    <View style={styles.container}>
      <View style={styles.appShell}>
        {/* Live Camera Viewfinder */}
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          zoom={zoom}
        />

        {/* Grid Lines Overlay */}
        {showGrid && (
          <View style={styles.gridOverlay} pointerEvents="none">
            <View style={styles.gridCol} />
            <View style={styles.gridCol} />
            <View style={styles.gridRow} />
            <View style={styles.gridRow} />
          </View>
        )}

        {/* Off-screen/On-screen Compositing View */}
        <OverlayCapture ref={overlayRef} />

        {/* ================================================================= */}
        {/* Top Controls Bar (Streamlined to 4 Essential Controls) */}
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

          {/* 3. Grid Toggle */}
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

          {/* 4. Settings */}
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
        {/* Live Rotating Watermark Badge (Always Bottom Center) */}
        {/* ================================================================= */}
        <Animated.View
          style={[liveBadgePositionStyle, rotationStyle]}
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
        {/* Bottom Controls Bar (Preview, Locations, Shutter, Storage) */}
        {/* ================================================================= */}
        <View style={styles.bottomBar}>
          {/* Preview */}
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

          {/* Locations */}
          <TouchableOpacity
            style={styles.bottomIconBtn}
            onPress={() => setShowLocationModal(true)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Animated.View style={[styles.bottomIconCircle, rotationStyle]}>
              <Ionicons name="location-outline" size={24} color={COLORS.accent} />
            </Animated.View>
            <Text style={styles.bottomLabel}>Locations</Text>
          </TouchableOpacity>

          {/* Shutter Button */}
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

          {/* Storage */}
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

        {/* Toast Notification */}
        {toastMessage && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toastMessage}</Text>
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

              <TouchableOpacity
                style={[styles.modalActionBtn, { marginTop: 20 }]}
                onPress={() => setShowSettingsModal(false)}
              >
                <Text style={styles.modalActionBtnText}>Done</Text>
              </TouchableOpacity>
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
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 20,
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
});
