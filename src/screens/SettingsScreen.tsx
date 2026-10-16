import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Alert,
  ScrollView,
  Switch,
  TextInput,
  Pressable,
  Share,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {theme} from '../theme';
import {remainingExports, FREE_EXPORTS_PER_MONTH} from '../storage/quota';
import {useSettings, updateSettings} from '../storage/settings';
import {Billing, Stickers} from '../native';
import {APP_VERSION, SUPPORT_EMAIL, sendFeedback} from '../lib/diagnostics';
import {reportError} from '../lib/errors';
import {haptics} from '../lib/haptics';
import {PLAY_URL, MARKET_URL, PRIVACY_URL, TERMS_URL} from '../lib/links';

const BORDERS = [
  {value: 0, label: 'None'},
  {value: 8, label: 'Thin'},
  {value: 14, label: 'Classic'},
  {value: 22, label: 'Bold'},
];
const COLORS = ['#FFFFFF', '#141119', '#FF3D87', '#FFC94D'];
const SHADOWS = [
  {value: 0, label: 'Flat'},
  {value: 6, label: 'Soft'},
  {value: 14, label: 'Lifted'},
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsScreen({navigation}: any) {
  const settings = useSettings();
  const [left, setLeft] = useState(FREE_EXPORTS_PER_MONTH);
  const [adFree, setAdFree] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cache, setCache] = useState<number | null>(null);
  const [publisher, setPublisher] = useState(settings.publisher);

  useEffect(() => setPublisher(settings.publisher), [settings.publisher]);

  useFocusEffect(
    useCallback(() => {
      remainingExports()
        .then(setLeft)
        .catch(e => reportError(e, 'settings.quota'));
      // Play is the source of truth on every visit, so a refund or a new device
      // lands correctly without any state of our own.
      Billing.isAdFree().then(setAdFree).catch(() => setAdFree(false));
      Billing.getPrice().then(setPrice).catch(() => setPrice(null));
      Stickers.cacheSize()
        .then(setCache)
        .catch(() => setCache(null));
    }, []),
  );

  const buy = async () => {
    setBusy(true);
    try {
      const ok = await Billing.purchaseAdFree();
      if (ok) {
        haptics.success();
        setAdFree(true);
        Alert.alert('Unlocked', 'Ads are off and exports are unlimited. Thank you.');
      }
    } catch (e: any) {
      reportError(e, 'settings.purchase');
      Alert.alert('Purchase failed', e?.message ?? 'Google Play could not complete the purchase.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    const owned = await Billing.isAdFree().catch(() => false);
    setAdFree(owned);
    Alert.alert(
      owned ? 'Purchase restored' : 'Nothing to restore',
      owned
        ? 'Ads are off on this device.'
        : 'No previous purchase was found on this Google account.',
    );
  };

  const savePublisher = () => {
    const clean = publisher.trim().slice(0, 40) || 'MPS';
    setPublisher(clean);
    updateSettings({publisher: clean}).catch(e => reportError(e, 'settings.publisher'));
  };

  const clearCache = async () => {
    try {
      const freed = await Stickers.purgeCache(0);
      setCache(await Stickers.cacheSize());
      haptics.tap();
      Alert.alert('Cleared', `Freed ${formatBytes(freed)} of temporary files. Your stickers are untouched.`);
    } catch (e: any) {
      reportError(e, 'settings.cache');
      Alert.alert('Could not clear', e?.message ?? 'Try again.');
    }
  };

  const shareApp = () =>
    Share.share({
      message: `Make your own WhatsApp stickers in seconds. Photos cut out automatically, nothing uploaded: ${PLAY_URL}`,
    }).catch(e => reportError(e, 'settings.share'));

  const open = (url: string) =>
    Linking.openURL(url).catch(e => {
      reportError(e, 'settings.link');
      Alert.alert('Could not open the link', url);
    });

  return (
    <Screen title="Settings">
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {adFree ? 'Unlimited exports, no ads' : `${left} of ${FREE_EXPORTS_PER_MONTH} free exports left`}
          </Text>
          <Text style={styles.muted}>
            Everything runs on your phone. No account, no upload, no internet needed except for ads.
          </Text>
          {adFree ? null : (
            <Button
              label={price ? `Remove ads and unlock exports — ${price}` : 'Remove ads and unlock exports'}
              variant="marker"
              busy={busy}
              onPress={buy}
            />
          )}
          <Button label="Restore purchase" variant="ghost" onPress={restore} />
        </View>

        <Text style={styles.section}>New stickers</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Publisher name</Text>
          <TextInput
            value={publisher}
            onChangeText={setPublisher}
            onEndEditing={savePublisher}
            maxLength={40}
            placeholder="Your name"
            placeholderTextColor={theme.color.textMuted}
            style={styles.input}
            accessibilityLabel="Publisher name"
          />
          <Text style={styles.muted}>Shown under your packs in WhatsApp. Applies to packs you create from now on.</Text>

          <Text style={styles.label}>Default border</Text>
          <View style={styles.row}>
            {BORDERS.map(b => (
              <Chip
                key={b.value}
                label={b.label}
                on={settings.outline === b.value}
                onPress={() => updateSettings({outline: b.value})}
              />
            ))}
          </View>
          {settings.outline > 0 ? (
            <View style={styles.row}>
              {COLORS.map(c => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`Border colour ${c}`}
                  onPress={() => updateSettings({outlineColor: c})}
                  style={[styles.swatch, {backgroundColor: c}, settings.outlineColor === c && styles.swatchOn]}
                />
              ))}
            </View>
          ) : null}

          <Text style={styles.label}>Default shadow</Text>
          <View style={styles.row}>
            {SHADOWS.map(s => (
              <Chip
                key={s.value}
                label={s.label}
                on={settings.shadow === s.value}
                onPress={() => updateSettings({shadow: s.value})}
              />
            ))}
          </View>
          <Text style={styles.muted}>Used when you add several photos at once.</Text>
        </View>

        <Text style={styles.section}>App</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>Haptic feedback</Text>
              <Text style={styles.muted}>A small buzz on taps and when something finishes.</Text>
            </View>
            <Switch
              value={settings.haptics}
              onValueChange={v => {
                updateSettings({haptics: v}).catch(e => reportError(e, 'settings.haptics'));
              }}
              trackColor={{false: theme.color.raised, true: theme.color.marker}}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>Temporary files</Text>
              <Text style={styles.muted}>{cache == null ? '…' : formatBytes(cache)} of previews you no longer need.</Text>
            </View>
            <Button label="Clear" variant="ghost" onPress={clearCache} />
          </View>
        </View>

        <Text style={styles.section}>Help</Text>
        <View style={styles.card}>
          <Button label="How it works" variant="ghost" onPress={() => navigation.navigate('Onboarding', {replay: true})} />
          <Button label="Rate on Google Play" variant="ghost" onPress={() => open(MARKET_URL)} />
          <Button label="Share this app" variant="ghost" onPress={shareApp} />
          <Button
            label="Send feedback"
            variant="ghost"
            onPress={() =>
              sendFeedback('DieCut feedback', 'Tell us what to improve:').catch(() =>
                Alert.alert('No email app found', `Write to us at ${SUPPORT_EMAIL}`),
              )
            }
          />
          <Button label="Privacy policy" variant="ghost" onPress={() => open(PRIVACY_URL)} />
          <Button label="Terms of use" variant="ghost" onPress={() => open(TERMS_URL)} />
        </View>

        <Text style={styles.version}>Version {APP_VERSION}</Text>
      </ScrollView>
    </Screen>
  );
}

function Chip({label, on, onPress}: {label: string; on?: boolean; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {padding: theme.space(5), gap: theme.space(3), paddingBottom: theme.space(10)},
  section: {...theme.type.label, color: theme.color.textMuted, marginTop: theme.space(3), marginLeft: theme.space(1)},
  card: {backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: theme.space(4), gap: theme.space(3)},
  cardTitle: {...theme.type.title, color: theme.color.text},
  label: {...theme.type.label, fontSize: 14, color: theme.color.text},
  muted: {...theme.type.meta, fontSize: 13, color: theme.color.textMuted},
  input: {
    backgroundColor: theme.color.raised,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    color: theme.color.text,
    ...theme.type.body,
  },
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), alignItems: 'center'},
  chip: {
    backgroundColor: theme.color.raised,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.pill,
  },
  chipOn: {backgroundColor: theme.color.marker},
  chipLabel: {...theme.type.label, color: theme.color.text},
  chipLabelOn: {color: theme.color.markerInk},
  swatch: {width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: theme.color.hairline},
  swatchOn: {borderColor: theme.color.highlight, borderWidth: 3},
  switchRow: {flexDirection: 'row', alignItems: 'center', gap: theme.space(3)},
  switchText: {flex: 1, gap: 2},
  version: {...theme.type.meta, color: theme.color.textMuted, textAlign: 'center', marginTop: theme.space(4)},
});
