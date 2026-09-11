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
 * On-screen compositing component.
 *
 * Ensures:
 * - Portrait captures: Tall canvas, watermark at bottom center, horizontal (0°).
 * - Landscape captures: Wide canvas, watermark at bottom center, horizontal (0°).
 * The watermark is NEVER tilted or rotated sideways on the photo!
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
      // Small pause to guarantee native paint
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
  const isLandscape = deg === 90 || deg === 270;

  // Responsive canvas dimensions:
  // In portrait: tall canvas (e.g. 390x844)
  // In landscape: wide canvas (e.g. 844x390)
  const canvasWidth = isLandscape
    ? Math.max(SCREEN_WIDTH, SCREEN_HEIGHT)
    : Math.min(SCREEN_WIDTH, SCREEN_HEIGHT);
  const canvasHeight = isLandscape
    ? Math.min(SCREEN_WIDTH, SCREEN_HEIGHT)
    : Math.max(SCREEN_WIDTH, SCREEN_HEIGHT);

  // In BOTH Portrait and Landscape, the watermark is ALWAYS horizontal (0°),
  // anchored right at the BOTTOM CENTER of the photo!
  const badgeStyle = {
    position: 'absolute',
    bottom: 24,
    left: (canvasWidth - BADGE_WIDTH) / 2,
    width: BADGE_WIDTH,
    transform: [{ rotate: '0deg' }], // Never tilted!
  };

  return (
    <View style={styles.fullscreenModal} pointerEvents="none" collapsable={false}>
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'jpg', quality: 0.95, result: 'tmpfile' }}
        collapsable={false}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor: '#000',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Image
          source={{ uri: data.photoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => {
            triggerCapture();
          }}
        />

        {/* Watermark Badge always at Bottom Center, never tilted */}
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
    overflow: 'visible',
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
