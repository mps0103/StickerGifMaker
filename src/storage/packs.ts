import {Stickers} from '../native';
import {readJson, writeJson} from '../lib/safeStorage';
import {reportError} from '../lib/errors';
import {getSettings} from './settings';
import {DEFAULT_EMOJI} from '../lib/emojis';
import {PLAY_URL, PRIVACY_URL} from '../lib/links';
import type {Sticker, StickerPack} from '../types';

const KEY = 'mps.packs.v1';

function isSticker(v: any): v is Sticker {
  return v && typeof v.id === 'string' && typeof v.fileName === 'string' && Array.isArray(v.emojis);
}

function isPack(v: any): v is StickerPack {
  return (
    v &&
    typeof v.identifier === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.stickers) &&
    v.stickers.every(isSticker)
  );
}

function isPackList(v: unknown): v is StickerPack[] {
  return Array.isArray(v) && v.every(isPack);
}

export function loadPacks(): Promise<StickerPack[]> {
  return readJson<StickerPack[]>(KEY, [], isPackList);
}

/**
 * Persisting and publishing are separate failures. The list is saved first, so a
 * provider hiccup can never lose a user's pack; the publish error is recorded and
 * re-raised only where it matters, at the WhatsApp handoff.
 */
export async function savePacks(packs: StickerPack[]): Promise<void> {
  await writeJson(KEY, packs);
  try {
    await publishPacks(packs);
  } catch (e) {
    reportError(e, 'packs.publish');
  }
}

/** Mirrors the pack list into the shape WhatsApp's provider expects. */
export async function publishPacks(packs: StickerPack[]): Promise<void> {
  const payload = {
    android_play_store_link: PLAY_URL,
    sticker_packs: packs.map(p => ({
      identifier: p.identifier,
      name: p.name,
      publisher: p.publisher,
      tray_image_file: p.trayImageFile,
      publisher_email: p.publisherEmail,
      privacy_policy_website: p.privacyPolicyWebsite,
      image_data_version: p.imageDataVersion,
      avoid_cache: false,
      animated_sticker_pack: p.animatedStickerPack,
      stickers: p.stickers.map(s => ({
        image_file: s.fileName,
        emojis: s.emojis.length ? s.emojis.slice(0, 3) : [DEFAULT_EMOJI],
        accessibility_text: s.accessibilityText ?? '',
      })),
    })),
  };
  await Stickers.publishPackIndex(JSON.stringify(payload));
}

export function newPack(name: string): StickerPack {
  return {
    identifier: `pack_${Date.now()}`,
    name,
    publisher: getSettings().publisher.trim() || 'MPS',
    trayImageFile: 'tray.webp',
    publisherEmail: 'info@dealtrix.com',
    privacyPolicyWebsite: PRIVACY_URL,
    imageDataVersion: '1',
    animatedStickerPack: false,
    stickers: [],
    createdAt: Date.now(),
  };
}

/** Bumping this is what makes WhatsApp re-read an already-added pack. */
export function bumpVersion(pack: StickerPack): StickerPack {
  return {...pack, imageDataVersion: String(Number(pack.imageDataVersion) + 1)};
}

/** Why a pack cannot go to WhatsApp yet, or null when it can. */
export function packProblem(pack: StickerPack, min = 3): string | null {
  if (pack.stickers.length < min) {
    const need = min - pack.stickers.length;
    return `Add ${need} more sticker${need === 1 ? '' : 's'}. WhatsApp needs at least ${min}.`;
  }
  const animated = pack.stickers.filter(s => s.animated).length;
  if (animated > 0 && animated < pack.stickers.length) {
    return 'A pack can hold animated or still stickers, not both. Remove one kind.';
  }
  return null;
}

/**
 * Where a new sticker should go when the user did not choose a pack: the first one
 * that can still take a still sticker, or a fresh one if none can. Animated packs
 * and full packs are skipped, because adding to them would fail or be rejected.
 */
export async function ensureTargetPack(): Promise<StickerPack> {
  const packs = await loadPacks();
  const usable = packs.find(
    p => !p.stickers.some(s => s.animated) && p.stickers.length < 30,
  );
  if (usable) return usable;
  const created = newPack(packs.length === 0 ? 'My stickers' : `Stickers ${packs.length + 1}`);
  await savePacks([created, ...packs]);
  return created;
}
