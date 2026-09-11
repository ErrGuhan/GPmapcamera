import * as Location from 'expo-location';

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
    city: 'Unknown',
    region: '',
    country: '',
    postalCode: '',
    street: '',
  };

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    if (results && results.length > 0) {
      const r = results[0];
      address = {
        city: r.city || r.subregion || 'Unknown',
        region: r.region || '',
        country: r.country || '',
        postalCode: r.postalCode || '',
        street: r.street || r.name || '',
      };
    }
  } catch (e) {
    // Reverse geocoding can fail offline — fall back to raw coordinates only.
    console.warn('Reverse geocode failed:', e);
  }

  return { coords, address };
}

/**
 * Builds a Google Static Maps thumbnail URL for the overlay.
 * Requires a valid Google Maps Static API key with billing enabled.
 * Get one at: https://console.cloud.google.com/google/maps-apis
 */
export function getStaticMapUrl(latitude, longitude, apiKey) {
  const size = '300x300';
  const zoom = 16;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=${zoom}&size=${size}&markers=color:red|${latitude},${longitude}&key=${apiKey}`;
}
