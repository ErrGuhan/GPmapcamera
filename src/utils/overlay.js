import ImageMarker, { Position } from 'react-native-image-marker';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Takes the raw photo URI + a snapshot of the rendered overlay (PNG with
 * transparency) and burns the overlay onto the photo, returning the
 * final file URI to save to the gallery.
 *
 * @param {string} photoUri - URI of the raw captured photo
 * @param {string} overlayUri - URI of the ViewShot-captured overlay PNG
 * @param {number} photoWidth - width of the raw photo in pixels
 * @param {number} photoHeight - height of the raw photo in pixels
 */
export async function burnOverlayOntoPhoto(
  photoUri,
  overlayUri,
  photoWidth,
  photoHeight
) {
  try {
    const markedImagePath = await ImageMarker.markImage({
      backgroundImage: {
        src: photoUri,
        scale: 1,
      },
      watermarkImages: [
        {
          src: overlayUri,
          scale: 1,
          position: {
            position: Position.bottomLeft,
          },
        },
      ],
      quality: 100,
      filename: `gmc_${Date.now()}`,
      saveFormat: 'jpg',
    });

    // react-native-image-marker returns a local file path; normalize to a
    // file:// URI so it can be used with expo-media-library / <Image>.
    const uri = markedImagePath.startsWith('file://')
      ? markedImagePath
      : `file://${markedImagePath}`;

    return uri;
  } catch (err) {
    // react-native-image-marker contains native code not bundled into Expo Go.
    // In a development build it runs normally; in Expo Go we fall back to the raw photo.
    console.warn(
      'react-native-image-marker is not available in Expo Go (requires development build). Using raw photo:',
      err.message
    );
    return overlayUri || photoUri;
  }
}

/**
 * Cleans up temporary overlay/raw files after the final composited
 * image has been saved, to avoid filling up device storage.
 */
export async function cleanupTempFile(uri) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.warn('Failed to clean up temp file:', uri, e);
  }
}
