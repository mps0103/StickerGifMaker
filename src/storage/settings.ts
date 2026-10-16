import {useEffect, useState} from 'react';
import {readJson, writeJson} from '../lib/safeStorage';

/**
 * User preferences. Everything has a default, and unknown or missing fields are
 * filled in on read, so adding a setting later never breaks an older install.
 */
const KEY = 'mps.settings.v1';

export type Settings = {
  publisher: string;
  outline: number;
  outlineColor: string;
  shadow: number;
  haptics: boolean;
  onboarded: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  publisher: 'MPS',
  outline: 14,
  outlineColor: '#FFFFFF',
  shadow: 0,
  haptics: true,
  onboarded: false,
};

let current: Settings = DEFAULT_SETTINGS;
let ready: Promise<Settings> | null = null;
const listeners = new Set<(s: Settings) => void>();

function isObject(v: unknown): v is Partial<Settings> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function loadSettings(): Promise<Settings> {
  if (!ready) {
    ready = readJson<Partial<Settings>>(KEY, {}, isObject).then(stored => {
      current = {...DEFAULT_SETTINGS, ...stored};
      return current;
    });
  }
  return ready;
}

/** Synchronous read for code that cannot await, such as the haptics helper. */
export function getSettings(): Settings {
  return current;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  await loadSettings();
  current = {...current, ...patch};
  listeners.forEach(fn => fn(current));
  await writeJson(KEY, current);
  return current;
}

export function useSettings(): Settings {
  const [value, setValue] = useState(current);
  useEffect(() => {
    let alive = true;
    loadSettings().then(s => alive && setValue(s));
    listeners.add(setValue);
    return () => {
      alive = false;
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
