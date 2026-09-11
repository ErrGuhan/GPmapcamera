import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const LOCAL_CAPTURES_KEY = '@gmc_local_captures';
const PENDING_QUEUE_KEY = '@gmc_pending_uploads';
const CAPTURES_DIR = `${FileSystem.documentDirectory}GPS_Captures/`;

/**
 * Ensures the persistent directory exists in the app's document storage.
 */
async function ensureDirectoryExists() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CAPTURES_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CAPTURES_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn('Failed to ensure captures directory exists:', e);
  }
}

/**
 * Clears any legacy pending upload queue from AsyncStorage so no background retry errors occur.
 */
export async function clearLegacyUploadQueue() {
  try {
    await AsyncStorage.removeItem(PENDING_QUEUE_KEY);
  } catch (e) {
    // silent
  }
}

/**
 * Saves a watermarked photo to persistent local memory and registers it in AsyncStorage.
 *
 * @param {object} params
 * @param {string} params.uri - Local file URI of the watermarked image
 * @param {object} params.address - Reverse-geocoded address { city, region, country, street }
 * @param {object} params.coords - Coordinates { latitude, longitude }
 * @param {string} params.dateTime - Formatted timestamp
 * @returns {Promise<object>} The stored capture record
 */
export async function saveLocalCapture({ uri, address, coords, dateTime }) {
  try {
    await ensureDirectoryExists();
    const filename = `GMC_${Date.now()}.jpg`;
    const destinationUri = `${CAPTURES_DIR}${filename}`;

    // Copy the watermarked image into persistent document storage
    await FileSystem.copyAsync({
      from: uri,
      to: destinationUri,
    });

    const item = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      uri: destinationUri,
      address: address || {},
      coords: coords || {},
      dateTime: dateTime || new Date().toLocaleString(),
      createdAt: new Date().toISOString(),
    };

    const existing = await getLocalCaptures();
    const updated = [item, ...existing];
    await AsyncStorage.setItem(LOCAL_CAPTURES_KEY, JSON.stringify(updated));

    return item;
  } catch (err) {
    console.warn('Failed to save local capture:', err);
    return null;
  }
}

/**
 * Gets all locally saved captures, newest first.
 *
 * @returns {Promise<Array>} List of captures
 */
export async function getLocalCaptures() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_CAPTURES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to get local captures:', err);
    return [];
  }
}

/**
 * Deletes a local capture from local storage and AsyncStorage.
 *
 * @param {string} id - The capture ID to delete
 * @returns {Promise<Array>} Updated captures list
 */
export async function deleteLocalCapture(id) {
  try {
    const existing = await getLocalCaptures();
    const target = existing.find((item) => item.id === id);
    if (target?.uri) {
      try {
        await FileSystem.deleteAsync(target.uri, { idempotent: true });
      } catch (delErr) {
        console.warn('Failed to delete file from disk:', target.uri, delErr);
      }
    }
    const updated = existing.filter((item) => item.id !== id);
    await AsyncStorage.setItem(LOCAL_CAPTURES_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to delete local capture:', err);
    return [];
  }
}
