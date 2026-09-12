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

    // Helper to apply rotation transitions smoothly
    const applyRotation = (newDeg, newAngle, newOrient) => {
      setOrientation(newOrient);
      setRotationDegrees(newDeg);
      setRotationAngle(newAngle);

      Animated.spring(animatedRotation, {
        toValue: newAngle,
        useNativeDriver: Platform.OS !== 'web',
        friction: 8,
        tension: 45,
      }).start();
    };

    // -------------------------------------------------------------------------
    // Web-specific Orientation Fallback (Platform.OS === 'web')
    // Uses window.screen.orientation, orientationchange, and deviceorientation
    // -------------------------------------------------------------------------
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      let currentWebOrientation = 'portrait';

      const updateWebOrientation = (deg, angle, orient) => {
        if (!isMounted || orient === currentWebOrientation) return;
        currentWebOrientation = orient;
        console.log(`[OurGpsCam] Web orientation updated to "${orient}" (${deg}°)`);
        applyRotation(deg, angle, orient);
      };

      const handleScreenOrientationChange = () => {
        const screenAngle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
        const screenType = window.screen?.orientation?.type || '';
        console.log(`[OurGpsCam] Screen orientation change detected: angle=${screenAngle}, type=${screenType}`);

        if (screenAngle === 90 || screenType.includes('landscape-primary')) {
          updateWebOrientation(90, 90, 'landscape-left');
        } else if (screenAngle === 270 || screenAngle === -90 || screenType.includes('landscape-secondary')) {
          updateWebOrientation(270, -90, 'landscape-right');
        } else if (screenAngle === 0 || screenType.includes('portrait')) {
          updateWebOrientation(0, 0, 'portrait');
        } else if (window.innerWidth > window.innerHeight) {
          updateWebOrientation(90, 90, 'landscape-left');
        } else {
          updateWebOrientation(0, 0, 'portrait');
        }
      };

      // Direct IMU tilt listener: detects physical rotation even if Android user has system auto-rotate locked!
      const handleDeviceTilt = (evt) => {
        const { gamma, beta } = evt;
        if (gamma === null || beta === null) return;

        // If screen.orientation is already in landscape, let screen orientation rule
        const sAngle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
        if (sAngle === 90 || sAngle === 270 || sAngle === -90) return;

        const absGamma = Math.abs(gamma);
        const absBeta = Math.abs(beta);

        // Strong sideways tilt: user is physically holding phone in landscape
        if (absGamma > 45 && absGamma > absBeta * 1.3) {
          if (gamma < 0) {
            updateWebOrientation(90, 90, 'landscape-left');
          } else {
            updateWebOrientation(270, -90, 'landscape-right');
          }
        } else if (absBeta > 35 && absGamma < 28) {
          // Upright portrait
          updateWebOrientation(0, 0, 'portrait');
        }
      };

      // Check initial orientation immediately
      handleScreenOrientationChange();

      // Listen for screen orientation changes
      try {
        window.screen?.orientation?.addEventListener('change', handleScreenOrientationChange);
      } catch (e) {}
      window.addEventListener('orientationchange', handleScreenOrientationChange);
      window.addEventListener('resize', handleScreenOrientationChange);

      // Listen for physical device tilt
      if (typeof window.DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientation', handleDeviceTilt);
      }

      // Check Accelerometer.isAvailableAsync on web as requested
      (async () => {
        try {
          const available = await Accelerometer.isAvailableAsync();
          console.log('[OurGpsCam] Accelerometer.isAvailableAsync():', available);
        } catch (e) {
          console.log('[OurGpsCam] Accelerometer.isAvailableAsync() threw:', e?.message || e);
        }
      })();

      return () => {
        isMounted = false;
        try {
          window.screen?.orientation?.removeEventListener('change', handleScreenOrientationChange);
        } catch (e) {}
        window.removeEventListener('orientationchange', handleScreenOrientationChange);
        window.removeEventListener('resize', handleScreenOrientationChange);
        window.removeEventListener('deviceorientation', handleDeviceTilt);
      };
    }

    // -------------------------------------------------------------------------
    // Native iOS / Android Accelerometer Path
    // -------------------------------------------------------------------------
    (async () => {
      try {
        const available = await Accelerometer.isAvailableAsync();
        console.log('[OurGpsCam] Accelerometer.isAvailableAsync():', available);
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

          let newOrientation = currentOrientation;

          if (currentOrientation === 'portrait') {
            if (absX > 0.70 && absX > absY * 1.8) {
              newOrientation = smoothX < 0 ? 'landscape-left' : 'landscape-right';
            }
          } else {
            if (absX < 0.45 || absY > absX * 1.2) {
              newOrientation = 'portrait';
            } else {
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
            applyRotation(deg, angle, newOrientation);
          }
        });
      } catch (e) {
        // Sensor error
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
