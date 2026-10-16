import {NativeModules} from 'react-native';
import type {
  AnimatedStickerJob,
  GifJob,
  GifResult,
  StickerEffects,
  Stroke,
  TextOptions,
} from '../types';

type SavedSticker = {fileName: string; path: string; bytes: number};

type StickerNative = {
  removeBackground(uri: string): Promise<string>;
  applyEffects(uri: string, opts: StickerEffects): Promise<string>;
  applyStrokes(currentUri: string, originalUri: string, strokes: Stroke[]): Promise<string>;
  addText(uri: string, opts: TextOptions): Promise<string>;
  saveAnimatedSticker(
    packId: string,
    stickerId: string,
    opts: AnimatedStickerJob,
  ): Promise<SavedSticker & {fps: number; animated: true}>;
  saveSticker(packId: string, stickerId: string, uri: string): Promise<SavedSticker>;
  saveTrayIcon(packId: string, uri: string): Promise<string>;
  exportStickerToGallery(packId: string, fileName: string): Promise<string>;
  deleteSticker(packId: string, fileName: string): Promise<boolean>;
  shareSticker(packId: string, fileName: string): Promise<boolean>;
  transformSticker(uri: string, opts: {rotate?: number; flipH?: boolean}): Promise<string>;
  purgeCache(olderThanMs: number): Promise<number>;
  cacheSize(): Promise<number>;
  deletePack(packId: string): Promise<boolean>;
  publishPackIndex(json: string): Promise<boolean>;
  isWhatsAppInstalled(): Promise<{consumer: boolean; business: boolean}>;
  addPackToWhatsApp(packId: string, packName: string): Promise<boolean>;
};

type GifNative = {
  videoToGif(options: GifJob): Promise<GifResult>;
  imagesToGif(uris: string[], delayMs: number, width: number, loopCount: number): Promise<GifResult>;
  extractGifFrames(uri: string): Promise<{uri: string; index: number; durationMs: number}[]>;
  getVideoInfo(uri: string): Promise<{durationMs: number; width: number; height: number; rotation: number}>;
  saveGifToGallery(path: string): Promise<string>;
};

function required<T>(mod: T | undefined, name: string): T {
  if (!mod) {
    throw new Error(
      `${name} is missing. Rebuild the app with "npx react-native run-android" - a JS-only reload will not pick up native changes.`,
    );
  }
  return mod;
}

export const Stickers = required(NativeModules.StickerModule as StickerNative, 'StickerModule');
export const Gifs = required(NativeModules.GifModule as GifNative, 'GifModule');

type ShareNative = {
  getInitialShare(): Promise<{kind: 'image' | 'video'; uris: string[]} | null>;
  clearInitialShare(): Promise<boolean>;
};

type BillingNative = {
  isAdFree(): Promise<boolean>;
  getPrice(): Promise<string | null>;
  purchaseAdFree(): Promise<boolean>;
};

export const Billing = required(NativeModules.BillingModule as BillingNative, 'BillingModule');

export const ShareIntent = required(
  NativeModules.ShareIntentModule as ShareNative,
  'ShareIntentModule',
);
