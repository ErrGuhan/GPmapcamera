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
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * On-screen compositing component.
 *
 * When `compositePhoto` is called:
 * 1. Renders the captured raw photo in a full-screen view with the watermark
 *    banner anchored at the bottom.
 * 2. Waits for Image paint.
 * 3. Uses ViewShot to snapshot the rendered view into a new watermarked JPEG.
 * 4. Resolves with the watermarked file URI.
 */
const OverlayCapture = forwardRef((props, ref) => {
  const viewShotRef = useRef(null);
  const [data, setData] = useState(null);
  const promiseResolverRef = useRef(null);
  const capturedFlagRef = useRef(false);

  useImperativeHandle(ref, () => ({
    compositePhoto: ({ photoUri, coords, address, dateTime, mapUri }) => {
      return new Promise((resolve) => {
        capturedFlagRef.current = false;
        promiseResolverRef.current = resolve;
        setData({ photoUri, coords, address, dateTime, mapUri });

        // Safety fallback: if onLoad does not fire within 1200ms, force capture
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

  const isDummyMap = !data.mapUri || data.mapUri.includes('YOUR_GOOGLE_MAPS_API_KEY');

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

        {/* Watermark Banner */}
        <View style={styles.watermarkBanner}>
          <View style={styles.accentBar} />
          <View style={styles.overlayContent}>
            {/* Map thumbnail or pin badge */}
            {!isDummyMap ? (
              <Image source={{ uri: data.mapUri }} style={styles.mapThumb} />
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mapPin}>📍</Text>
                <Text style={styles.mapLabel}>GPS</Text>
              </View>
            )}

            {/* Address & GPS metadata */}
            <View style={styles.textBlock}>
              <View style={styles.brandRow}>
                <Text style={styles.brandTag}>GPS MAP CAMERA</Text>
              </View>

              <Text style={styles.title} numberOfLines={2}>
                {data.address?.city || 'Current Location'}
                {data.address?.region ? `, ${data.address.region}` : ''}
                {data.address?.country ? `, ${data.address.country}` : ''}
              </Text>

              {data.coords && (
                <Text style={styles.coordsText}>
                  Lat {data.coords.latitude?.toFixed(6)}°  Long {data.coords.longitude?.toFixed(6)}°
                </Text>
              )}

              {data.address?.street ? (
                <Text style={styles.streetText} numberOfLines={1}>
                  {data.address.street}
                  {data.address.postalCode ? ` - ${data.address.postalCode}` : ''}
                </Text>
              ) : null}

              <Text style={styles.dateText}>{data.dateTime}</Text>
            </View>
          </View>
        </View>
      </ViewShot>

      {/* Saving indicator overlay */}
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
  watermarkBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  accentBar: {
    height: 3,
    backgroundColor: COLORS.accent,
    width: '100%',
  },
  overlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  mapThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  mapPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPin: {
    fontSize: 32,
  },
  mapLabel: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
    letterSpacing: 1,
  },
  textBlock: {
    marginLeft: 14,
    flex: 1,
    justifyContent: 'center',
  },
  brandRow: {
    marginBottom: 2,
  },
  brandTag: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    lineHeight: 19,
  },
  coordsText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  streetText: {
    color: '#e2e8f0',
    fontSize: 11,
    marginTop: 2,
  },
  dateText: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
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
