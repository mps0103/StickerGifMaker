import {Linking, Platform} from 'react-native';
import {recentErrors} from './errors';
import {version} from '../../package.json';

export const SUPPORT_EMAIL = 'info@dealtrix.com';
export const APP_VERSION: string = version;

/** Plain-text block that goes at the bottom of a feedback email. */
export async function diagnosticsText(): Promise<string> {
  const c: any = Platform.constants ?? {};
  const errors = await recentErrors();
  const lines = [
    `App ${APP_VERSION}`,
    `Android ${c.Release ?? '?'} (API ${Platform.Version})`,
    `${c.Brand ?? ''} ${c.Model ?? ''}`.trim(),
  ];
  if (errors.length) {
    lines.push('', 'Recent errors:');
    errors.slice(-8).forEach(e => {
      lines.push(`${new Date(e.at).toISOString()} [${e.where}] ${e.message}`);
    });
  }
  return lines.join('\n');
}

export async function sendFeedback(subject: string, intro = ''): Promise<void> {
  const body = `${intro}\n\n--- diagnostics (safe to delete) ---\n${await diagnosticsText()}`;
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await Linking.openURL(url);
}
