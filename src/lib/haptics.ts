import {Vibration} from 'react-native';
import {getSettings} from '../storage/settings';

/** Short ticks only. Anything longer reads as a notification, not as feedback. */
function pulse(pattern: number | number[]) {
  if (!getSettings().haptics) return;
  Vibration.vibrate(pattern);
}

export const haptics = {
  tap: () => pulse(8),
  select: () => pulse(12),
  success: () => pulse([0, 14, 40, 14]),
  warn: () => pulse([0, 30, 50, 30]),
};
