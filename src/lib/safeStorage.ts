import AsyncStorage from '@react-native-async-storage/async-storage';
import {reportError} from './errors';

/**
 * AsyncStorage hands back whatever string was last written, and a half-written or
 * hand-edited value used to throw straight out of JSON.parse during the first
 * render, which is a crash on every launch until the user clears app data.
 *
 * A value that fails to parse or validate is moved aside under "<key>.corrupt"
 * and the caller gets its fallback, so the app opens and the bad copy is still
 * around for diagnosis.
 */
export async function readJson<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): Promise<T> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch (e) {
    reportError(e, `storage.read:${key}`);
    return fallback;
  }
  if (raw == null) return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) throw new Error('unexpected shape');
    return parsed as T;
  } catch (e) {
    reportError(e, `storage.corrupt:${key}`);
    try {
      await AsyncStorage.setItem(`${key}.corrupt`, raw);
      await AsyncStorage.removeItem(key);
    } catch {
      // Quarantining is best effort; returning the fallback is what matters.
    }
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
