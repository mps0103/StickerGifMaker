/**
 * The app's whole subject is cut-outs on transparency, so the interface borrows
 * from that: a dark paste-up board, a checkerboard for anything transparent, and
 * one marker-pen accent used only for the action that makes something.
 */
export const theme = {
  color: {
    board: '#141119',
    surface: '#1E1A26',
    raised: '#282235',
    hairline: '#3A3346',
    checkerA: '#2A2433',
    checkerB: '#221D2B',
    text: '#F2EEF7',
    textMuted: '#9A91A8',
    marker: '#FF3D87',
    markerInk: '#12060B',
    highlight: '#FFC94D',
    danger: '#FF6B5E',
  },
  radius: {sm: 8, md: 14, lg: 22, pill: 999},
  space: (n: number) => n * 4,
  type: {
    display: {fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6},
    title: {fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3},
    body: {fontSize: 15, fontWeight: '400' as const},
    label: {fontSize: 13, fontWeight: '600' as const},
    meta: {fontSize: 12, fontWeight: '400' as const},
  },
};

export const WHATSAPP_LIMITS = {
  stickerSize: 512,
  staticMaxBytes: 100 * 1024,
  animatedMaxBytes: 500 * 1024,
  trayMaxBytes: 50 * 1024,
  minStickers: 3,
  maxStickers: 30,
  maxAnimationMs: 10_000,
};
