import React, { forwardRef, useState, useImperativeHandle, useRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { COLORS, OVERLAY } from '../constants/theme';

/**
 * Renders the location/time watermark.
 *
 * If a `photoUri` is provided during `capture(photoUri)`, it composites the
 * captured photo in the background with the location banner at the bottom,
 * producing a complete watermarked photo without requiring native image markers.
 */
const OverlayCapture = forwardRef(
  ({ address, coords, dateTime, mapUri }, ref) => {
    const viewShotRef = useRef(null);
    const [currentPhoto, setCurrentPhoto] = useState(null);

    useImperativeHandle(ref, () => ({
      capture: async (photoUri) => {
        if (photoUri) {
          setCurrentPhoto(photoUri);
          // Wait for Image to mount and render
          await new Promise((resolve) => setTimeout(resolve, 200));
          const uri = await viewShotRef.current.capture();
          setCurrentPhoto(null);
          return uri;
        }
        return await viewShotRef.current.capture();
      },
    }));

    const isDummyMap = !mapUri || mapUri.includes('YOUR_GOOGLE_MAPS_API_KEY');

    return (
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'jpg', quality: 0.95, result: 'tmpfile' }}
        style={styles.offscreenContainer}
      >
        {currentPhoto ? (
          <Image
            source={{ uri: currentPhoto }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}

        <View style={styles.watermarkBanner}>
          <View style={styles.overlayRow}>
            {!isDummyMap ? (
              <Image source={{ uri: mapUri }} style={styles.mapThumb} />
            ) : (
              <View style={[styles.mapThumb, styles.mapPlaceholder]}>
                <Text style={styles.mapPin}>📍</Text>
              </View>
            )}

            <View style={styles.textBlock}>
              <Text style={styles.title} numberOfLines={2}>
                {address?.city || 'Location'}
                {address?.region ? `, ${address.region}` : ''}
                {address?.country ? `, ${address.country}` : ''}
              </Text>
              <Text style={styles.body}>
                Lat {coords?.latitude?.toFixed(6) ?? '0.000000'}°, Long{' '}
                {coords?.longitude?.toFixed(6) ?? '0.000000'}°
              </Text>
              {address?.street ? (
                <Text style={styles.body}>{address.street}</Text>
              ) : null}
              <Text style={styles.body}>{dateTime}</Text>
            </View>
          </View>
        </View>
      </ViewShot>
    );
  }
);

const styles = StyleSheet.create({
  // Positioned off-screen (not display:none — ViewShot needs it laid out).
  offscreenContainer: {
    position: 'absolute',
    top: -9999,
    left: 0,
    width: OVERLAY.designWidth,
    height: OVERLAY.designHeight,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  watermarkBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.overlayBg,
    padding: 28,
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapThumb: {
    width: OVERLAY.mapThumbSize,
    height: OVERLAY.mapThumbSize,
    borderRadius: 12,
  },
  mapPlaceholder: {
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPin: {
    fontSize: 70,
  },
  textBlock: {
    marginLeft: 20,
    flexShrink: 1,
    justifyContent: 'center',
  },
  title: {
    color: COLORS.white,
    fontSize: OVERLAY.titleFontSize,
    fontWeight: 'bold',
  },
  body: {
    color: COLORS.white,
    fontSize: OVERLAY.bodyFontSize,
    marginTop: 4,
  },
});

export default OverlayCapture;
