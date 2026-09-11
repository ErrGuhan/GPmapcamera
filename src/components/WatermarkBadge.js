import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

/**
 * Reusable GPS Map Camera watermark badge.
 * Matches the reference layout with Google map thumbnail, red pin,
 * location header with country flag, detailed street/plus-code,
 * coordinates, date & time, and the top-right "GPS Map Camera" badge.
 */
export default function WatermarkBadge({
  address,
  coords,
  dateTime,
  mapUri,
  style,
}) {
  const city = address?.city || 'Current Location';
  const region = address?.region || '';
  const country = address?.country || '';
  const flag = address?.flag || '';

  // Build the title line, e.g. "Pangur, Puducherry, India 🇮🇳"
  const titleParts = [city, region, country].filter(Boolean);
  const titleString = titleParts.length > 0 ? titleParts.join(', ') : 'Current Location';

  // Sub-location / street line
  const street = address?.street || '';
  const postalCode = address?.postalCode ? ` ${address.postalCode}` : '';
  const subAddress = street
    ? `${street}, ${city}${postalCode}, ${country}`
    : address?.fullAddress || titleString;

  const latStr = coords?.latitude ? coords.latitude.toFixed(6) : '0.000000';
  const lngStr = coords?.longitude ? coords.longitude.toFixed(6) : '0.000000';

  return (
    <View style={[styles.container, style]}>
      {/* Top right GPS Map Camera tag */}
      <View style={styles.topRightTag}>
        <Text style={styles.cameraIcon}>📷</Text>
        <Text style={styles.tagText}>GPS Map Camera</Text>
      </View>

      <View style={styles.contentRow}>
        {/* Left Map Thumbnail */}
        <View style={styles.mapContainer}>
          {mapUri ? (
            <Image
              source={{ uri: mapUri }}
              style={styles.mapImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.mapImage, styles.mapFallback]} />
          )}

          {/* Red Location Pin in center */}
          <View style={styles.pinWrapper} pointerEvents="none">
            <Text style={styles.pinEmoji}>📍</Text>
          </View>

          {/* Google branding watermark */}
          <View style={styles.googleWatermark} pointerEvents="none">
            <Text style={styles.googleText}>Google</Text>
          </View>
        </View>

        {/* Right Details Block */}
        <View style={styles.detailsBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {titleString} {flag}
          </Text>

          <Text style={styles.subAddress} numberOfLines={2}>
            {subAddress}
          </Text>

          <Text style={styles.coords}>
            Lat {latStr}° Long {lngStr}°
          </Text>

          <Text style={styles.dateTime} numberOfLines={1}>
            {dateTime}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 8,
    position: 'relative',
    maxWidth: 380,
  },
  topRightTag: {
    position: 'absolute',
    top: 4,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraIcon: {
    fontSize: 9,
    marginRight: 3,
  },
  tagText: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapContainer: {
    width: 72,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1e293b',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    backgroundColor: '#0f172a',
  },
  pinWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinEmoji: {
    fontSize: 22,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  googleWatermark: {
    position: 'absolute',
    bottom: 2,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  googleText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.2,
  },
  detailsBlock: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  subAddress: {
    color: '#f1f5f9',
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
  },
  coords: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  dateTime: {
    color: '#cbd5e1',
    fontSize: 9.5,
    marginTop: 2,
  },
});
