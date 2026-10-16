import {Alert} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {reportError} from './errors';

/** Most photos one batch will take; keeps a run short enough to sit through. */
export const BATCH_LIMIT = 20;

/**
 * Opens the photo picker and returns the chosen URIs, or an empty list when the
 * user backed out or something failed. Failures are surfaced here so each caller
 * does not have to remember to.
 */
export async function pickPhotos(limit: number): Promise<string[]> {
  const res = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: Math.max(1, limit),
  });
  if (res.errorCode) {
    reportError(res.errorMessage ?? res.errorCode, 'pickPhotos');
    Alert.alert(
      'Could not open your photos',
      res.errorMessage ?? 'Check that Photos access is allowed for this app.',
    );
    return [];
  }
  return (res.assets ?? []).map(a => a.uri).filter((u): u is string => !!u);
}

/** One photo goes to the full editor, several go through the automatic batch. */
export function openForPhotos(navigation: any, packId: string, uris: string[]): void {
  if (uris.length === 0) return;
  if (uris.length === 1) {
    navigation.navigate('StickerEditor', {packId, sourceUri: uris[0]});
  } else {
    navigation.navigate('BulkAdd', {packId, uris});
  }
}
