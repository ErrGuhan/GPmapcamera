import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Cleans up temporary raw or intermediate image files after saving
 * the composited image, avoiding filling up device cache storage.
 * Safely no-ops on web.
 *
 * @param {string} uri - File URI to delete
 */
export async function cleanupTempFile(uri) {
  if (!uri || Platform.OS === 'web') return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    // Non-critical cleanup
  }
}
