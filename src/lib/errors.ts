import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One place for "this failed and nobody is looking at the screen".
 *
 * Silent catches were hiding real faults in this app - a failed cut-out looked
 * exactly like a successful one - so anything that is swallowed on purpose goes
 * through here instead. The last few entries are kept on disk so Settings can
 * attach them to a feedback email, which is the only crash channel an app with
 * no backend and no account has.
 */
const KEY = 'mps.errors.v1';
const MAX_ENTRIES = 20;

export type ErrorEntry = {at: number; where: string; message: string};

let buffer: ErrorEntry[] = [];
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) buffer = parsed.slice(-MAX_ENTRIES);
  } catch {
    buffer = [];
  }
}

export function reportError(error: unknown, where: string): void {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'unknown');
  if (__DEV__) {
    console.warn(`[${where}]`, message);
  }
  load()
    .then(() => {
      buffer = [...buffer, {at: Date.now(), where, message: message.slice(0, 300)}].slice(-MAX_ENTRIES);
      return AsyncStorage.setItem(KEY, JSON.stringify(buffer));
    })
    .catch(() => {
      // Nothing left to fall back on; the in-memory copy still holds this session.
    });
}

export async function recentErrors(): Promise<ErrorEntry[]> {
  await load();
  return buffer;
}

export async function clearErrors(): Promise<void> {
  buffer = [];
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/** Chains the existing handler rather than replacing it, so fatals still behave. */
export function installGlobalErrorHandler(): void {
  const utils = (globalThis as any).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    reportError(error, isFatal ? 'fatal' : 'uncaught');
    previous?.(error, isFatal);
  });
}
