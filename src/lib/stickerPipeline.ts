import {Stickers} from '../native';
import {loadPacks, savePacks, bumpVersion} from '../storage/packs';
import {reportError} from './errors';
import {DEFAULT_EMOJI} from './emojis';
import type {Settings} from '../storage/settings';
import type {Sticker} from '../types';

export type PipelineResult = {
  sticker: Sticker;
  /** False when the original photo was kept instead of a cut-out. */
  cutOut: boolean;
  /** Why the cut-out was skipped, so the UI can tell a bad photo from a bad run. */
  reason: 'no-subject' | 'failed' | null;
};

/**
 * A cut-out can fail for reasons that have nothing to do with the photo: the first
 * inference after the segmenter loads, or the on-device model still being fetched
 * by Google Play services. Those clear up on their own, so they are retried. A
 * photo that cannot be decoded is not.
 */
async function cutOutWithRetry(uri: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await Stickers.removeBackground(uri);
    } catch (e: any) {
      const retries = e?.code === 'E_DECODE' ? 0 : e?.code === 'E_NO_SUBJECT' ? 1 : 2;
      if (attempt >= retries) throw e;
      await new Promise<void>(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
}

type Style = Pick<Settings, 'outline' | 'outlineColor' | 'shadow'>;

/**
 * Photo in, saved sticker out, using the user's default border and shadow. This is
 * the hands-off path used for batches; the single-photo editor does the same steps
 * with the user steering each one.
 *
 * Each stage degrades instead of failing the whole sticker: a photo with no clear
 * subject is kept as-is rather than dropped, and a failed effect falls back to the
 * plain cut-out. Only a failed save, which means nothing exists to show, throws.
 */
export async function buildSticker(
  packId: string,
  sourceUri: string,
  style: Style,
): Promise<PipelineResult> {
  let working = sourceUri;
  let reason: PipelineResult['reason'] = null;
  try {
    working = await cutOutWithRetry(sourceUri);
  } catch (e: any) {
    reason = e?.code === 'E_NO_SUBJECT' ? 'no-subject' : 'failed';
    reportError(e, `pipeline.cutout:${e?.code ?? 'unknown'}`);
  }

  // Always rendered, even with no border or shadow: this pass is also what crops
  // the transparent margin away, and an uncropped sticker is a tiny subject in a
  // large empty frame.
  try {
    working = await Stickers.applyEffects(working, {
      outlineWidth: style.outline,
      outlineColor: style.outlineColor,
      shadowRadius: style.shadow,
    });
  } catch (e) {
    reportError(e, 'pipeline.effects');
  }

  const id = `s_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const saved = await Stickers.saveSticker(packId, id, working);

  // The first sticker in a pack doubles as its tray icon.
  const existing = (await loadPacks()).find(p => p.identifier === packId);
  if (existing && existing.stickers.length === 0) {
    await Stickers.saveTrayIcon(packId, working).catch(e => reportError(e, 'pipeline.tray'));
  }

  return {
    cutOut: reason === null,
    reason,
    sticker: {
      id,
      fileName: saved.fileName,
      localPath: saved.path,
      emojis: [DEFAULT_EMOJI],
      accessibilityText: 'Sticker',
      bytes: saved.bytes,
      animated: false,
    },
  };
}

/** Appends a saved sticker to its pack and persists, so a crash loses nothing. */
export async function appendSticker(packId: string, sticker: Sticker): Promise<void> {
  const all = await loadPacks();
  const next = all.map(p =>
    p.identifier === packId ? bumpVersion({...p, stickers: [...p.stickers, sticker]}) : p,
  );
  await savePacks(next);
}
