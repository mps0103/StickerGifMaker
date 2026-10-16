import {useEffect} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';
import {ShareIntent} from '../native';

export type SharedMedia = {kind: 'image' | 'video'; uris: string[]};

/**
 * Handles both entry paths: a cold start where the intent is already on the
 * activity, and a warm start where the OS delivers onNewIntent.
 */
export function useSharedMedia(onShare: (media: SharedMedia) => void) {
  useEffect(() => {
    let alive = true;

    ShareIntent.getInitialShare()
      .then(media => {
        if (alive && media && media.uris.length) {
          onShare(media);
          ShareIntent.clearInitialShare();
        }
      })
      .catch(() => {});

    const emitter = new NativeEventEmitter(NativeModules.ShareIntentModule);
    const sub = emitter.addListener('mps.share', (payload: Object) => {
      const media = payload as SharedMedia;
      if (media?.uris?.length) {
        onShare(media);
      }
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, [onShare]);
}
