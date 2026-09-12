import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Converts a 2-letter ISO country code (e.g. "IN", "US") to its unicode flag emoji.
 */
export function getCountryFlag(isoCode) {
  if (!isoCode || typeof isoCode !== 'string' || isoCode.length !== 2) return '';
  try {
    return String.fromCodePoint(
      ...[...isoCode.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))
    );
  } catch {
    return '';
  }
}

/**
 * Web-only: reverse-geocode via OpenStreetMap Nominatim.
 * Called when Platform.OS === 'web' because expo-location's
 * reverseGeocodeAsync() throws UnavailabilityError on web.
 *
 * Returns the same address shape as the native path, or null on failure.
 */
async function reverseGeocodeWeb(latitude, longitude) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Nominatim usage policy requires a User-Agent identifying the app.
        'User-Agent': 'OurGpsCam/1.0 (https://ourgpscam.vercel.app)',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      console.warn('[OurGpsCam] Nominatim HTTP error:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data || data.error) {
      console.warn('[OurGpsCam] Nominatim returned error:', data?.error);
      return null;
    }

    const addr = data.address || {};

    // Map Nominatim field names → our standard address shape
    const isoCode = addr.country_code?.toUpperCase() || '';
    const flag = getCountryFlag(isoCode);

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state_district ||
      'Location';

    const region = addr.state || addr.state_district || '';
    const country = addr.country || '';
    const street = addr.road || addr.pedestrian || addr.footway || addr.path || '';
    const postalCode = addr.postcode || '';
    const district = addr.suburb || addr.city_district || addr.quarter || '';
    const subregion = addr.county || addr.state_district || '';

    const parts = [street, city, region, postalCode, country].filter(Boolean);
    const fullAddress = parts.join(', ');

    return {
      city,
      region,
      country,
      postalCode,
      street,
      district,
      subregion,
      isoCountryCode: isoCode,
      flag,
      fullAddress,
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[OurGpsCam] Nominatim request timed out');
    } else {
      console.warn('[OurGpsCam] Nominatim reverse geocode failed:', e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Requests permission and returns current coordinates + a
 * human-readable reverse-geocoded address.
 *
 * On native (iOS/Android): uses expo-location's reverseGeocodeAsync().
 * On web: uses Nominatim HTTP API (expo-location throws UnavailabilityError on web).
 */
export async function getLocationData() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission not granted');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const { coords } = position;

  let address = {
    city: 'Current Location',
    region: '',
    country: '',
    postalCode: '',
    street: '',
    district: '',
    subregion: '',
    isoCountryCode: '',
    flag: '',
    fullAddress: '',
  };

  if (Platform.OS === 'web') {
    // Native expo-location reverseGeocodeAsync() is not available on web —
    // it throws UnavailabilityError. Use Nominatim HTTP API instead.
    try {
      const webAddress = await reverseGeocodeWeb(coords.latitude, coords.longitude);
      if (webAddress) {
        address = webAddress;
      }
    } catch (e) {
      // Offline or rate-limited — keep placeholder; don't crash
      console.warn('[OurGpsCam] Web reverse geocode failed, using placeholder:', e);
    }
  } else {
    // Native: iOS / Android
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });

      if (results && results.length > 0) {
        const r = results[0];
        const isoCode = r.isoCountryCode || '';
        const flag = getCountryFlag(isoCode);
        const city = r.city || r.subregion || r.district || 'Location';
        const region = r.region || '';
        const country = r.country || '';
        const street = r.street || r.name || '';
        const postalCode = r.postalCode || '';

        const parts = [street, city, region, postalCode, country].filter(Boolean);
        const fullAddress = parts.join(', ');

        address = {
          city,
          region,
          country,
          postalCode,
          street,
          district: r.district || '',
          subregion: r.subregion || '',
          isoCountryCode: isoCode,
          flag,
          fullAddress,
        };
      }
    } catch (e) {
      console.warn('Reverse geocode failed:', e);
    }
  }

  return { coords, address };
}

/**
 * Builds a Static Maps thumbnail URL for the overlay.
 * Uses Google Static Maps if API key is provided; otherwise uses a clean satellite/OSM tile.
 */
export function getStaticMapUrl(latitude, longitude, apiKey) {
  if (apiKey && !apiKey.includes('YOUR_GOOGLE_MAPS_API_KEY')) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=17&size=300x300&maptype=satellite&markers=color:red%7C${latitude},${longitude}&key=${apiKey}`;
  }
  // Free public satellite preview tile fallback
  return `https://static-maps.yandex.ru/1.x/?ll=${longitude},${latitude}&z=16&l=sat,skl&size=300,300&pt=${longitude},${latitude},pm2rdm`;
}
