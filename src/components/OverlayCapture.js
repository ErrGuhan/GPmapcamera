import React, { forwardRef, useState, useImperativeHandle, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import WatermarkBadge from './WatermarkBadge';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * On-screen compositing component with dynamic orientation rotation.
 */
const OverlayCapture = forwardRef((props, ref) => {
  const viewShotRef = useRef(null);
  const [data, setData] = useState(null);
  const promiseResolverRef = useRef(null);
  const capturedFlagRef = useRef(false);

  useImperativeHandle(ref, () => ({
    compositePhoto: ({
      photoUri,
      coords,
      address,
      dateTime,
      mapUri,
      rotationDegrees = 0,
    }) => {
      return new Promise((resolve) => {
        capturedFlagRef.current = false;
        promiseResolverRef.current = resolve;
        setData({
          photoUri,
          coords,
          address,
          dateTime,
          mapUri,
          rotationDegrees,
        });

        // Safety timeout in case onLoad does not fire
        setTimeout(() => {
          triggerCapture();
        }, 1200);
      });
    },
  }));

  const triggerCapture = async () => {
    if (capturedFlagRef.current || !promiseResolverRef.current) return;
    capturedFlagRef.current = true;

    try {
      // Small pause to guarantee native render paint
      await new Promise((r) => setTimeout(r, 180));

      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        const resolve = promiseResolverRef.current;
        setData(null);
        promiseResolverRef.current = null;
        resolve(uri);
      } else {
        const resolve = promiseResolverRef.current;
        const fallback = data?.photoUri;
        setData(null);
        promiseResolverRef.current = null;
        resolve(fallback);
      }
    } catch (err) {
      console.warn('ViewShot capture error:', err);
      const resolve = promiseResolverRef.current;
      const fallback = data?.photoUri;
      setData(null);
      promiseResolverRef.current = null;
      resolve(fallback);
    }
  };

  if (!data) return null;

  const deg = data.rotationDegrees || 0;

  // Calculate positioning style based on orientation
  let badgePositionStyle = styles.badgePortrait;
  let transformStyle = { transform: [{ rotate: '0deg' }] };

  if (deg === 90) {
    // Landscape Left (rotated 90deg counter-clockwise)
    badgePositionStyle = styles.badgeLandscapeLeft;
    transformStyle = { transform: [{ rotate: '90deg' }] };
  } else if (deg === 270) {
    // Landscape Right (rotated 90deg clockwise)
    badgePositionStyle = styles.badgeLandscapeRight;
    transformStyle = { transform: [{ rotate: '-90deg' }] };
  } else if (deg === 180) {
    badgePositionStyle = styles.badgeInverted;
    transformStyle = { transform: [{ rotate: '180deg' }] };
  }

  return (
    <View style={styles.fullscreenModal} pointerEvents="none">
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'jpg', quality: 0.95, result: 'tmpfile' }}
        style={styles.canvas}
      >
        <Image
          source={{ uri: data.photoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => {
            triggerCapture();
          }}
        />

        {/* Rotated Watermark Badge */}
        <View style={[badgePositionStyle, transformStyle]}>
          <WatermarkBadge
            address={data.address}
            coords={data.coords}
            dateTime={data.dateTime}
            mapUri={data.mapUri}
          />
        </View>
      </ViewShot>

      {/* Processing Feedback */}
      <View style={styles.savingBadge}>
        <ActivityIndicator color={COLORS.accent} size="small" />
        <Text style={styles.savingText}>Stamping watermark & saving...</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  fullscreenModal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  badgePortrait: {
    position: 'absolute',
    bottom: 30,
    left: 14,
    right: 14,
  },
  badgeInverted: {
    position: 'absolute',
    top: 30,
    left: 14,
    right: 14,
  },
  badgeLandscapeLeft: {
    position: 'absolute',
    left: -60,
    bottom: 220,
    width: 360,
  },
  badgeLandscapeRight: {
    position: 'absolute',
    right: -60,
    bottom: 220,
    width: 360,
  },
  savingBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 212, 0, 0.4)',
  },
  savingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
  },
});

export default OverlayCapture;
