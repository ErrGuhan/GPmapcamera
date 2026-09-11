import { useState, useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Accelerometer } from 'expo-sensors';

/**
 * Hook to track real-time physical device orientation via accelerometer.
 * Smooths sensor noise and outputs orientation angles (0, 90, 180, 270 degrees)
 * with an Animated.Value for silky smooth rotation transitions.
 */
export function useDeviceOrientation() {
  const [orientation, setOrientation] = useState('portrait');
  const [rotationDegrees, setRotationDegrees] = useState(0); // 0, 90, 180, 270
  const [rotationAngle, setRotationAngle] = useState(0); // 0, 90, 180, -90 for transforms

  const animatedRotation = useRef(new Animated.Value(0)).current;
  const lastTargetAngle = useRef(0);

  useEffect(() => {
    // Set accelerometer update interval to 150ms for responsive yet power-efficient tracking
    Accelerometer.setUpdateInterval(150);

    let lastX = 0;
    let lastY = -1;

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      // Exponential moving average filter
      const alpha = 0.25;
      const smoothX = alpha * x + (1 - alpha) * lastX;
      const smoothY = alpha * y + (1 - alpha) * lastY;
      lastX = smoothX;
      lastY = smoothY;

      // Ignore if phone is lying almost flat on a table (|z| > 0.85)
      if (Math.abs(z) > 0.85) return;

      let newOrientation = 'portrait';
      let deg = 0;
      let angle = 0;

      if (Math.abs(smoothX) > Math.abs(smoothY)) {
        if (smoothX < -0.4) {
          // Tilted left (top points to the left) -> Landscape Left
          newOrientation = 'landscape-left';
          deg = 90;
          angle = 90;
        } else if (smoothX > 0.4) {
          // Tilted right (top points to the right) -> Landscape Right
          newOrientation = 'landscape-right';
          deg = 270;
          angle = -90;
        }
      } else {
        if (smoothY > 0.45) {
          // Upside down
          newOrientation = 'portrait-upside-down';
          deg = 180;
          angle = 180;
        } else {
          // Portrait standard upright
          newOrientation = 'portrait';
          deg = 0;
          angle = 0;
        }
      }

      setOrientation((prev) => {
        if (prev !== newOrientation) {
          setRotationDegrees(deg);
          setRotationAngle(angle);

          // Animate the rotation value smoothly
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
    inputRange: [-90, 0, 90, 180],
    outputRange: ['-90deg', '0deg', '90deg', '180deg'],
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
