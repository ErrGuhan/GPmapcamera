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
import WatermarkBadge, { BADGE_WIDTH, BADGE_HEIGHT } from './WatermarkBadge';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * On-screen compositing component with precise Portrait vs Landscape placement.
 * Ensures:
 * - In Portrait: Watermark is in the bottom center of the image.
 * - In Landscape: Watermark sits in the bottom center of the landscape view.
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

        // Safety timeout
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
      // Small pause to ensure native paint
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

  // Compute exact positioning so the watermark is strictly at the BOTTOM CENTER
  // of either the portrait or landscape image.
  let badgeStyle = {
    position: 'absolute',
    left: (SCREEN_WIDTH - BADGE_WIDTH) / 2,
    bottom: 24,
    transform: [{ rotate: '0deg' }],
  };

  if (deg === 90) {
    // Landscape Left (top of phone tilted left):
    // In portrait coordinates, the landscape bottom center is the right edge, vertically centered.
    const centerX = SCREEN_WIDTH - BADGE_HEIGHT / 2 - 20;
    const centerY = SCREEN_HEIGHT / 2;
    badgeStyle = {
      position: 'absolute',
      left: centerX - BADGE_WIDTH / 2,
      top: centerY - BADGE_HEIGHT / 2,
      transform: [{ rotate: '90deg' }],
    };
  } else if (deg === 270) {
    // Landscape Right (top of phone tilted right):
    // In portrait coordinates, the landscape bottom center is the left edge, vertically centered.
    const centerX = BADGE_HEIGHT / 2 + 20;
    const centerY = SCREEN_HEIGHT / 2;
    badgeStyle = {
      position: 'absolute',
      left: centerX - BADGE_WIDTH / 2,
      top: centerY - BADGE_HEIGHT / 2,
      transform: [{ rotate: '-90deg' }],
    };
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

        {/* Rotated Watermark Badge at Bottom Center */}
        <View style={badgeStyle}>
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
