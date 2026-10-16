export type Sticker = {
  id: string;
  /** File name inside the pack folder. This is what WhatsApp's provider asks for. */
  fileName: string;
  /** Absolute path, used only for previews inside this app. */
  localPath: string;
  emojis: string[];
  accessibilityText?: string;
  bytes?: number;
  animated?: boolean;
};

export type StickerPack = {
  identifier: string;
  name: string;
  publisher: string;
  trayImageFile: string;
  publisherEmail: string;
  privacyPolicyWebsite: string;
  imageDataVersion: string;
  animatedStickerPack: boolean;
  stickers: Sticker[];
  createdAt: number;
};

export type StickerEffects = {
  outlineWidth: number;
  outlineColor: string;
  shadowRadius: number;
};

export type GifJob = {
  uri: string;
  startMs: number;
  endMs: number;
  fps: number;
  width: number;
  speed: number;
  loopCount: number;
  boomerang?: boolean;
  reverse?: boolean;
};

export type GifResult = {uri: string; path: string; bytes: number};

export type Point = {x: number; y: number};

export type Stroke = {
  /** Normalised 0..1 so a stroke means the same at any canvas size. */
  points: Point[];
  radius: number;
  erase: boolean;
};

export type TextOptions = {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  outlineColor: string;
  bold: boolean;
};

export type AnimatedStickerJob = {
  uri: string;
  startMs: number;
  endMs: number;
  removeBackground?: boolean;
};
