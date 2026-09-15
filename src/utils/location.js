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

let cachedLocation = null; // { coords: { latitude, longitude }, address, timestamp }

/**
 * Calculates distance in meters between two lat/lon coordinates using Haversine formula.
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a clean interim fallback address while reverse geocoding is in progress or unavailable.
 * Keeps coordinates in coords, avoiding duplicated/garbled text in the address lines.
 */
function buildCoordinateFallbackAddress(coords) {
  return {
    city: 'GPS Pinpointed',
    region: '',
    country: '',
    postalCode: '',
    street: '',
    district: '',
    subregion: '',
    isoCountryCode: '',
    flag: '📍',
    fullAddress: 'Resolving address...',
    isInterim: true,
  };
}

/**
 * Web-only: reverse-geocode via OpenStreetMap Nominatim with a strict 5-second timeout.
 * Returns standard address shape or null on failure.
 */
async function reverseGeocodeWeb(latitude, longitude) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s strict timeout

  const startTime = Date.now();
  console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Nominatim reverse geocoding started for (${latitude}, ${longitude})`);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OurGpsCam/1.0 (https://ourgpscam.vercel.app)',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      console.warn(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Nominatim HTTP error: ${response.status} (${Date.now() - startTime}ms)`);
      return null;
    }

    const data = await response.json();
    if (!data || data.error) {
      console.warn(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Nominatim returned error: ${data?.error} (${Date.now() - startTime}ms)`);
      return null;
    }

    const addr = data.address || {};
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

    console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Nominatim reverse geocode succeeded in ${Date.now() - startTime}ms:`, city);

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
      console.warn(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Nominatim request timed out after 5s`);
    } else {
      console.warn(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Nominatim reverse geocode failed (${Date.now() - startTime}ms):`, e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Gets position with a hard timeout and fallback.
 */
async function getPositionWithTimeout() {
  const gpsStartTime = Date.now();
  console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Requesting GPS coordinates...`);

  const runWithTimeout = (promise, ms, desc) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Position request timed out after ${ms}ms (${desc})`)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  };

  try {
    // 1. Primary: High Accuracy with 8s hard timeout
    const pos = await runWithTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 8000,
      }),
      8000,
      'High Accuracy'
    );
    console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] High accuracy GPS resolved in ${Date.now() - gpsStartTime}ms:`, pos.coords.latitude, pos.coords.longitude);
    return pos;
  } catch (err) {
    console.warn(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] High accuracy failed or timed out: ${err.message}. Trying fallback...`);
    
    // 2. Fallback: Balanced accuracy with 4s hard timeout
    try {
      const pos = await runWithTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 4000,
        }),
        4000,
        'Balanced Accuracy'
      );
      console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Balanced GPS resolved in ${Date.now() - gpsStartTime}ms:`, pos.coords.latitude, pos.coords.longitude);
      return pos;
    } catch (fallbackErr) {
      console.warn(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Balanced accuracy failed: ${fallbackErr.message}`);
    }

    // 3. Fallback: Last known position
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Using last known position:`, lastKnown.coords.latitude, lastKnown.coords.longitude);
        return lastKnown;
      }
    } catch (lastErr) {
      console.warn(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Last known position unavailable:`, lastErr);
    }

    throw err;
  }
}

/**
 * Requests permission and returns current coordinates + reverse-geocoded address.
 * 
 * @param {Function} [onCoordsResolved] - Callback invoked immediately when GPS coordinates
 *                                        resolve (prior to reverse geocoding completion)
 */
export async function getLocationData(onCoordsResolved) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission not granted');
  }

  const position = await getPositionWithTimeout();
  const { coords } = position;

  // Check cache: if within ~30 meters of last reverse-geocoded position, reuse cached address
  let address = null;
  if (
    cachedLocation?.coords &&
    cachedLocation?.address &&
    getDistanceMeters(
      coords.latitude,
      coords.longitude,
      cachedLocation.coords.latitude,
      cachedLocation.coords.longitude
    ) <= 30
  ) {
    console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Within 30m of cached address, reusing cached: "${cachedLocation.address.city}"`);
    address = { ...cachedLocation.address };
  }

  // Immediately notify caller that coordinates are available!
  if (typeof onCoordsResolved === 'function') {
    onCoordsResolved({
      coords,
      address: address || buildCoordinateFallbackAddress(coords),
    });
  }

  // If address was already resolved from 30m cache, return immediately!
  if (address) {
    return { coords, address };
  }

  // Default coordinate fallback in case reverse geocoding fails or times out
  let resolvedAddress = buildCoordinateFallbackAddress(coords);

  if (Platform.OS === 'web') {
    try {
      const webAddress = await reverseGeocodeWeb(coords.latitude, coords.longitude);
      if (webAddress) {
        resolvedAddress = webAddress;
      }
    } catch (e) {
      console.warn('[OurGpsCam] Web reverse geocode error:', e);
    }
  } else {
    // Native: iOS / Android
    const nativeGeoStart = Date.now();
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

        console.log(`[OurGpsCam Location ${new Date().toLocaleTimeString()}] Native reverse geocoding resolved in ${Date.now() - nativeGeoStart}ms:`, city);

        resolvedAddress = {
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
      console.warn('Native reverse geocode failed:', e);
    }
  }

  // Store in cache for future 30-meter proximity reuse
  cachedLocation = {
    coords,
    address: resolvedAddress,
    timestamp: Date.now(),
  };

  return { coords, address: resolvedAddress };
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
