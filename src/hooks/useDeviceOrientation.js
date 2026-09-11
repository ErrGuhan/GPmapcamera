import { useState, useEffect, useRef } from 'react';
import { Animated } from 'react-native';
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
    // 120ms update interval for responsive tilt detection
    Accelerometer.setUpdateInterval(120);

    let lastX = 0;
    let lastY = -1;

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      // Smooth out sensor jitter
      const alpha = 0.3;
      const smoothX = alpha * x + (1 - alpha) * lastX;
      const smoothY = alpha * y + (1 - alpha) * lastY;
      lastX = smoothX;
      lastY = smoothY;

      // When the phone is held in Portrait (even if tilted forward at a desk/laptop),
      // we must stay strictly in Portrait (0°).
      // Only transition to Landscape if horizontal tilt is clearly dominant.
      let newOrientation = 'portrait';
      let deg = 0;
      let angle = 0;

      const absX = Math.abs(smoothX);
      const absY = Math.abs(smoothY);

      // Require strong horizontal tilt to engage landscape
      if (absX > 0.52 && absX > absY * 1.3) {
        if (smoothX < -0.45) {
          // Tilted counter-clockwise (top of phone points left)
          newOrientation = 'landscape-left';
          deg = 90;
          angle = 90;
        } else if (smoothX > 0.45) {
          // Tilted clockwise (top of phone points right)
          newOrientation = 'landscape-right';
          deg = 270;
          angle = -90;
        }
      } else {
        // Standard Portrait - always bottom center
        newOrientation = 'portrait';
        deg = 0;
        angle = 0;
      }

      setOrientation((prev) => {
        if (prev !== newOrientation) {
          setRotationDegrees(deg);
          setRotationAngle(angle);

          Animated.spring(animatedRotation, {
            toValue: angle,
            useNativeDriver: true,
            friction: 7,
            tension: 40,
          }).start();
        }
        return newOrientation;
      });
    });

    return () => {
      subscription?.remove();
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
