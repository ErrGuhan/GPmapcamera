import { useState, useEffect, useRef } from 'react';
import { Animated, Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

/**
 * Hook to track real-time physical device orientation via accelerometer.
 * Strictly separates Portrait (upright and downward tilt) from Landscape.
 * Eliminates upside-down 180° tilt so the watermark stays firmly at the
 * bottom center in portrait mode.
 */
export function useDeviceOrientation() {
  const [orientation, setOrientation] = useState('portrait');
  const [rotationDegrees, setRotationDegrees] = useState(0); // 0, 90, 270
  const [rotationAngle, setRotationAngle] = useState(0); // 0, 90, -90 for transforms

  const animatedRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let subscription = null;
    let isMounted = true;

    (async () => {
      try {
        const available = await Accelerometer.isAvailableAsync();
        if (!available || !isMounted) return;

        Accelerometer.setUpdateInterval(120);

        let lastX = 0;
        let lastY = -1;

        let currentOrientation = 'portrait';

        subscription = Accelerometer.addListener(({ x, y, z }) => {
          if (!isMounted) return;

          // Smooth out sensor jitter with low-pass filter
          const alpha = 0.25;
          const smoothX = alpha * x + (1 - alpha) * lastX;
          const smoothY = alpha * y + (1 - alpha) * lastY;
          lastX = smoothX;
          lastY = smoothY;

          const absX = Math.abs(smoothX);
          const absY = Math.abs(smoothY);

          // Robust hysteresis:
          // In portrait: require strong intentional tilt (absX > 0.70 and horizontal dominance) to enter landscape.
          // Once in landscape: stay in landscape until tilt drops significantly (absX < 0.45).
          let newOrientation = currentOrientation;

          if (currentOrientation === 'portrait') {
            if (absX > 0.70 && absX > absY * 1.8) {
              newOrientation = smoothX < 0 ? 'landscape-left' : 'landscape-right';
            }
          } else {
            // Currently in landscape
            if (absX < 0.45 || absY > absX * 1.2) {
              newOrientation = 'portrait';
            } else {
              // Maintain or switch landscape side if direction reversed
              newOrientation = smoothX < 0 ? 'landscape-left' : 'landscape-right';
            }
          }

          let deg = 0;
          let angle = 0;
          if (newOrientation === 'landscape-left') {
            deg = 90;
            angle = 90;
          } else if (newOrientation === 'landscape-right') {
            deg = 270;
            angle = -90;
          }

          if (newOrientation !== currentOrientation) {
            currentOrientation = newOrientation;
            setOrientation(newOrientation);
            setRotationDegrees(deg);
            setRotationAngle(angle);

            Animated.spring(animatedRotation, {
              toValue: angle,
              // useNativeDriver: true causes a GPU compositor conflict on web:
              // the promoted compositing layer stacked over the CameraView <video>
              // element causes Chrome/WebView to blank the video feed after ~5-8s.
              // On native (iOS/Android) native driver is still used for 60fps perf.
              useNativeDriver: Platform.OS !== 'web',
              friction: 8,
              tension: 45,
            }).start();
          }
        });
      } catch (e) {
        // Accelerometer not available in current web browser
      }
    })();

    return () => {
      isMounted = false;
      try {
        subscription?.remove();
      } catch (e) {}
    };
  }, [animatedRotation]);

  const rotationInterpolate = animatedRotation.interpolate({
    inputRange: [-90, 0, 90],
    outputRange: ['-90deg', '0deg', '90deg'],
  });

  return {
    orientation,
    rotationDegrees,
    rotationAngle,
    animatedRotation,
    rotationStyle: {
      transform: [{ rotate: rotationInterpolate }],
    },
    isLandscape: orientation === 'landscape-left' || orientation === 'landscape-right',
  };
}
