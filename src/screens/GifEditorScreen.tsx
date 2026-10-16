import React, {useState} from 'react';
import {View, Text, Image, FlatList, StyleSheet, Alert, Pressable} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {BannerAdSlot} from '../ads/BannerAdSlot';
import {Gifs} from '../native';
import {theme} from '../theme';
import {remainingExports, spendExport} from '../storage/quota';

type Frame = {uri: string; index: number; durationMs: number};

export function GifEditorScreen() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [reversed, setReversed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{uri: string; bytes: number} | null>(null);

  const open = async () => {
    const res = await launchImageLibrary({mediaType: 'photo', selectionLimit: 1});
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    setBusy(true);
    try {
      setFrames(await Gifs.extractGifFrames(uri));
      setDropped(new Set());
      setResult(null);
    } catch (e: any) {
      Alert.alert('Could not read that file', e?.message ?? 'Pick a GIF.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (index: number) =>
    setDropped(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });

  const rebuild = async () => {
    const kept = frames.filter(f => !dropped.has(f.index));
    if (kept.length < 2) {
      Alert.alert('Too few frames', 'Keep at least two frames.');
      return;
    }
    if ((await remainingExports()) <= 0) {
      Alert.alert('Free exports used up', 'Unlock unlimited exports in Settings.');
      return;
    }
    const ordered = reversed ? [...kept].reverse() : kept;
    setBusy(true);
    try {
      const out = await Gifs.imagesToGif(ordered.map(f => f.uri), ordered[0].durationMs || 100, 320, 0);
      setResult(out);
      await spendExport();
    } catch (e: any) {
      Alert.alert('Rebuild failed', e?.message ?? 'Encoding failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Edit a GIF"
      subtitle={frames.length ? `${frames.length - dropped.size} of ${frames.length} frames kept` : 'Open a GIF to see its frames'}
      footer={<BannerAdSlot />}>
      {result ? <Image source={{uri: result.uri}} style={styles.preview} /> : null}
      <FlatList
        data={frames}
        numColumns={4}
        keyExtractor={f => String(f.index)}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({item}) => (
          <Pressable onPress={() => toggle(item.index)} style={styles.cell}>
            <Image source={{uri: item.uri}} style={[styles.cellImage, dropped.has(item.index) && styles.off]} />
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.hint}>Tap a frame to drop it from the loop.</Text>}
      />
      <View style={styles.actions}>
        <Button label={reversed ? 'Playing backwards' : 'Play forwards'} variant="ghost" onPress={() => setReversed(r => !r)} />
        <Button label="Open a GIF" onPress={open} />
        <Button label="Rebuild GIF" variant="marker" busy={busy} disabled={!frames.length} onPress={rebuild} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {height: 160, marginHorizontal: theme.space(5), borderRadius: theme.radius.lg, resizeMode: 'contain'},
  grid: {padding: theme.space(5), gap: theme.space(2)},
  gridRow: {gap: theme.space(2)},
  cell: {flex: 1, aspectRatio: 1},
  cellImage: {width: '100%', height: '100%', borderRadius: theme.radius.sm, backgroundColor: theme.color.surface},
  off: {opacity: 0.22},
  hint: {...theme.type.body, color: theme.color.textMuted, padding: theme.space(6)},
  actions: {padding: theme.space(5), gap: theme.space(2)},
});
