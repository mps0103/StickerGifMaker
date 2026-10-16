import React, {useEffect, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {BannerAd, BannerAdSize, TestIds} from 'react-native-google-mobile-ads';
import {theme} from '../theme';
import {Billing} from '../native';

/**
 * Banners live on list and result screens only. The editing canvas stays clean -
 * an ad next to a cut-out tool is what makes people uninstall.
 */
const UNIT_ID = __DEV__ ? TestIds.ADAPTIVE_BANNER : 'ca-app-pub-2904788540387890/0000000000';

export function BannerAdSlot() {
  const [adFree, setAdFree] = useState(true); // assume paid until proven otherwise, so no flash

  useEffect(() => {
    Billing.isAdFree()
      .then(setAdFree)
      .catch(() => setAdFree(false));
  }, []);

  if (adFree) return null;

  return (
    <View style={styles.slot}>
      <BannerAd unitId={UNIT_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.hairline,
    backgroundColor: theme.color.board,
  },
});
