import React, {useState} from 'react';
import {View, Text, Image, FlatList, StyleSheet, Alert} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {BannerAdSlot} from '../ads/BannerAdSlot';
import {Gifs} from '../native';
import {theme} from '../theme';
import {remainingExports, spendExport} from '../storage/quota';

export function ImagesToGifScreen() {
  const [uris, setUris] = useState<string[]>([]);
  const [delayMs, setDelayMs] = useState(150);
  const [result, setResult] = useState<{uri: string; bytes: number} | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const res = await launchImageLibrary({mediaType: 'photo', selectionLimit: 30});
    const picked = res.assets?.map(a => a.uri!).filter(Boolean) ?? [];
    if (picked.length) {
      setUris(picked);
      setResult(null);
    }
  };

  const exportGif = async () => {
    if (uris.length < 2) {
      Alert.alert('Add more photos', 'A loop needs at least two frames.');
      return;
    }
    if ((await remainingExports()) <= 0) {
      Alert.alert('Free exports used up', 'Unlock unlimited exports in Settings.');
      return;
    }
    setBusy(true);
    try {
      const out = await Gifs.imagesToGif(uris, delayMs, 320, 0);
      setResult(out);
      await spendExport();
    } catch (e: any) {
      Alert.alert('GIF not created', e?.message ?? 'Encoding failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Photos to GIF" subtitle={`${uris.length} frames selected`} footer={<BannerAdSlot />}>
      {result ? (
        <Image source={{uri: result.uri}} style={styles.preview} />
      ) : (
        <FlatList
          horizontal
          data={uris}
          keyExtractor={(u, i) => `${u}-${i}`}
          contentContainerStyle={styles.strip}
          renderItem={({item}) => <Image source={{uri: item}} style={styles.frame} />}
          ListEmptyComponent={<Text style={styles.hint}>Pick photos in the order you want them to play.</Text>}
        />
      )}
      <View style={styles.body}>
        <Text style={styles.label}>Frame delay: {delayMs} ms</Text>
        <View style={styles.row}>
          {[80, 150, 300, 600].map(v => (
            <Text key={v} onPress={() => setDelayMs(v)} style={[styles.chip, delayMs === v && styles.chipOn]}>
              {v}ms
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Button label="Choose photos" onPress={pick} />
        <Button label="Export GIF" variant="marker" busy={busy} onPress={exportGif} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: {paddingHorizontal: theme.space(5), gap: theme.space(2), alignItems: 'center'},
  frame: {width: 96, height: 96, borderRadius: theme.radius.sm, backgroundColor: theme.color.surface},
  preview: {height: 200, marginHorizontal: theme.space(5), borderRadius: theme.radius.lg, resizeMode: 'contain'},
  hint: {...theme.type.body, color: theme.color.textMuted, padding: theme.space(6)},
  body: {paddingHorizontal: theme.space(5), gap: theme.space(2), marginTop: theme.space(4)},
  label: {...theme.type.label, color: theme.color.textMuted},
  row: {flexDirection: 'row', gap: theme.space(2)},
  chip: {
    ...theme.type.label, color: theme.color.text, backgroundColor: theme.color.surface,
    paddingHorizontal: theme.space(4), paddingVertical: theme.space(2),
    borderRadius: theme.radius.pill, overflow: 'hidden',
  },
  chipOn: {backgroundColor: theme.color.marker, color: theme.color.markerInk},
  actions: {padding: theme.space(5), gap: theme.space(2)},
});
