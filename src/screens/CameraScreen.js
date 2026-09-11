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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';

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
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState('off'); // 'off' | 'auto' | 'on'
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(0); // 0 = 1x, 0.25 = 2x
  const [activeZoomLabel, setActiveZoomLabel] = useState('1x');
  const [exposure, setExposure] = useState(0); // -2 to +2
  const [activeMode, setActiveMode] = useState('PHOTO'); // 'SHARE PHOTO' | 'PHOTO' | 'VIDEO' | 'REPORTS'

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
      try {
        const perm = await MediaLibrary.getPermissionsAsync(true);
        setMediaPermission(perm);
      } catch {
        setMediaPermission({ granted: true });
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
  const toggleFlash = () => {
    setFlash((prev) => {
      if (prev === 'off') return 'auto';
      if (prev === 'auto') return 'on';
      return 'off';
    });
  };

  // Camera Facing Toggle
  const toggleFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  // Zoom Handler
  const handleZoomChange = (label) => {
    setActiveZoomLabel(label);
    if (label === '1x') setZoom(0);
    else if (label === '2x') setZoom(0.25);
  };

  // Vertical Exposure Slider PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        // Slide range: -80px to +80px maps to +2 to -2 EV
        const delta = -gestureState.dy / 40;
        const clamped = Math.max(-2, Math.min(2, Math.round(delta * 2) / 2));
        setExposure(clamped);
      },
    })
  ).current;

  // Capture & Watermark Handler
  async function handleCapture() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      // 1. Take raw photo from camera sensor
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      // 2. Prepare location + timestamp
      const coords = locationData?.coords || { latitude: 0, longitude: 0 };
      const address = locationData?.address || { city: 'Unknown' };
      const currentDateTime = getFormattedDateTime();
      const mapUri = getStaticMapUrl(coords.latitude, coords.longitude, GOOGLE_STATIC_MAPS_API_KEY);

      // 3. Composite photo with rotated watermark via ViewShot
      let finalUri = photo.uri;
      if (overlayRef.current?.compositePhoto) {
        finalUri = await overlayRef.current.compositePhoto({
          photoUri: photo.uri,
          coords,
          address,
          dateTime: currentDateTime,
          mapUri,
          rotationDegrees,
        });
      }

      // 4. Save to phone's public Media Gallery
      try {
        await MediaLibrary.saveToLibraryAsync(finalUri);
      } catch (err) {
        console.warn('System gallery save notice:', err.message);
      }

      // 5. Save to local app memory for in-app Gallery
      await saveLocalCapture({
        uri: finalUri,
        address,
        coords,
        dateTime: currentDateTime,
      });

      // 6. Clean up raw cache photo
      if (finalUri !== photo.uri) {
        await cleanupTempFile(photo.uri);
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
  }

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
    bottom: 145,
    zIndex: 15,
  };

  if (rotationDegrees === 90) {
    // Landscape Left: bottom center of landscape is right edge, vertically centered
    const centerX = SCREEN_WIDTH - BADGE_HEIGHT / 2 - 20;
    const centerY = SCREEN_HEIGHT / 2;
    liveBadgePositionStyle = {
      position: 'absolute',
      left: centerX - BADGE_WIDTH / 2,
      top: centerY - BADGE_HEIGHT / 2,
      zIndex: 15,
    };
  } else if (rotationDegrees === 270) {
    // Landscape Right: bottom center of landscape is left edge, vertically centered
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

      {/* Center Focus Reticle */}
      <View style={styles.focusContainer} pointerEvents="none">
        <View style={styles.focusRing} />
      </View>

      {/* Off-screen/On-screen Compositing View */}
      <OverlayCapture ref={overlayRef} />

      {/* ================================================================= */}
      {/* Top Controls Bar */}
      {/* ================================================================= */}
      <View style={styles.topBar}>
        {/* 1. Grid Toggle */}
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => setShowGrid(!showGrid)}
        >
          <Animated.Text style={[styles.topBarIcon, rotationStyle]}>
            {showGrid ? '⌗' : '🌐'}
          </Animated.Text>
        </TouchableOpacity>

        {/* 2. Flash Mode */}
        <TouchableOpacity style={styles.topBarBtn} onPress={toggleFlash}>
          <Animated.Text style={[styles.topBarIcon, rotationStyle]}>
            {flash === 'on' ? '⚡' : flash === 'auto' ? '⚡A' : '⚡̸'}
          </Animated.Text>
        </TouchableOpacity>

        {/* 3. Notes / Forms */}
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => setShowLocationModal(true)}
        >
          <Animated.Text style={[styles.topBarIcon, rotationStyle]}>
            📄⁺
          </Animated.Text>
        </TouchableOpacity>

        {/* 4. Aspect Ratio */}
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => {
            setToastMessage('Aspect ratio: 9:16 Full');
            setTimeout(() => setToastMessage(null), 1500);
          }}
        >
          <Animated.Text style={[styles.topBarIcon, rotationStyle]}>
            🖼️
          </Animated.Text>
        </TouchableOpacity>

        {/* 5. Flip Camera */}
        <TouchableOpacity style={styles.topBarBtn} onPress={toggleFacing}>
          <Animated.Text style={[styles.topBarIcon, rotationStyle]}>
            🔄
          </Animated.Text>
        </TouchableOpacity>

        {/* 6. Settings */}
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => setShowSettingsModal(true)}
        >
          <Animated.Text style={[styles.topBarIcon, rotationStyle]}>
            ⚙️
          </Animated.Text>
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
            <Text style={styles.sunIcon}>☀️</Text>
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
      {/* Camera Mode Bar (SHARE PHOTO, PHOTO, VIDEO, REPORTS) */}
      {/* ================================================================= */}
      <View style={styles.modeBar}>
        {['SHARE PHOTO', 'PHOTO', 'VIDEO', 'REPORTS'].map((mode) => {
          const isActive = activeMode === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.modeBtn, isActive && styles.modeBtnActive]}
              onPress={() => setActiveMode(mode)}
            >
              <Text style={[styles.modeText, isActive && styles.modeTextActive]}>
                {mode}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ================================================================= */}
      {/* Bottom Controls Bar (Preview, Locations, Shutter, Storage, Template) */}
      {/* ================================================================= */}
      <View style={styles.bottomBar}>
        {/* Preview */}
        <TouchableOpacity
          style={styles.bottomIconBtn}
          onPress={() => navigation.navigate('Gallery')}
        >
          <Animated.View style={[styles.bottomIconCircle, rotationStyle]}>
            <Text style={styles.bottomIconEmoji}>🖼️</Text>
          </Animated.View>
          <Text style={styles.bottomLabel}>Preview</Text>
        </TouchableOpacity>

        {/* Locations */}
        <TouchableOpacity
          style={styles.bottomIconBtn}
          onPress={() => setShowLocationModal(true)}
        >
          <Animated.View style={[styles.bottomIconCircle, rotationStyle]}>
            <Text style={styles.bottomIconEmoji}>📍</Text>
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
        >
          <Animated.View style={[styles.bottomIconCircle, rotationStyle]}>
            <Text style={styles.bottomIconEmoji}>📁</Text>
          </Animated.View>
          <Text style={styles.bottomLabel}>Storage</Text>
        </TouchableOpacity>

        {/* Template */}
        <TouchableOpacity
          style={styles.bottomIconBtn}
          onPress={() => {
            setToastMessage('Watermark Template 1 Active');
            setTimeout(() => setToastMessage(null), 1500);
          }}
        >
          <Animated.View style={[styles.bottomIconCircle, rotationStyle]}>
            <Text style={styles.bottomIconEmoji}>⊞</Text>
            {/* Red Badge '1' */}
            <View style={styles.redBadge}>
              <Text style={styles.redBadgeText}>1</Text>
            </View>
          </Animated.View>
          <Text style={styles.bottomLabel}>Template</Text>
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
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
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
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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

  // Focus Ring
  focusContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
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
    paddingHorizontal: 18,
    zIndex: 20,
  },
  topBarBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarIcon: {
    fontSize: 21,
    color: '#fff',
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
  sunIcon: {
    fontSize: 16,
  },
  exposureValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 6,
  },

  // Live Rotating Watermark Badge
  watermarkWrapper: {
    position: 'absolute',
    bottom: 185,
    left: 12,
    right: 12,
    zIndex: 15,
  },
  watermarkWrapperLandscape: {
    bottom: 230,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  watermarkAnimContainer: {
    alignSelf: 'flex-start',
  },

  // Zoom Selector (1x / 2x)
  zoomContainer: {
    position: 'absolute',
    bottom: 140,
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

  // Mode Bar
  modeBar: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 8,
    zIndex: 20,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modeBtnActive: {
    backgroundColor: COLORS.accent,
  },
  modeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modeTextActive: {
    color: '#000000',
  },

  // Bottom Controls Bar
  bottomBar: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 20,
  },
  bottomIconBtn: {
    alignItems: 'center',
    width: 60,
  },
  bottomIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bottomIconEmoji: {
    fontSize: 23,
  },
  bottomLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  redBadge: {
    position: 'absolute',
    top: 2,
    right: 4,
    backgroundColor: '#ef4444',
    width: 15,
    height: 15,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
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
  modalClose: {
    color: '#94a3b8',
    fontSize: 20,
    padding: 4,
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
