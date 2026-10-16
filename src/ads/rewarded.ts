import {RewardedAd, RewardedAdEventType, TestIds} from 'react-native-google-mobile-ads';
import {grantBonusExport} from '../storage/quota';

const UNIT_ID = __DEV__ ? TestIds.REWARDED : 'ca-app-pub-2904788540387890/1111111111';

/**
 * A rewarded ad beats a hard paywall here: someone who has just finished a cut-out
 * will watch 20 seconds to save it, and would have uninstalled at a dead stop.
 */
export function watchAdForOneExport(): Promise<boolean> {
  return new Promise(resolve => {
    const ad = RewardedAd.createForAdRequest(UNIT_ID);
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };

    const loaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show());
    const earned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, async () => {
      await grantBonusExport();
      finish(true);
    });

    setTimeout(() => finish(false), 15000);
    ad.load();

    return () => {
      loaded();
      earned();
    };
  });
}
