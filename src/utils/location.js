import * as Location from 'expo-location';

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
 * Requests permission and returns current coordinates + a
 * human-readable reverse-geocoded address.
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
