import React, {useState} from 'react';
import {View, Text, StyleSheet, Alert, Image, ScrollView} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {Checkerboard} from '../components/Checkerboard';
import {Stickers, Gifs} from '../native';
import {loadPacks, savePacks, bumpVersion} from '../storage/packs';
import {theme, WHATSAPP_LIMITS} from '../theme';
import {remainingExports, spendExport} from '../storage/quota';
import {watchAdForOneExport} from '../ads/rewarded';

const MAX_MS = WHATSAPP_LIMITS.maxAnimationMs;

export function AnimatedStickerScreen({route, navigation}: any) {
  const {packId} = route.params;
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(0);
  const [lengthMs, setLengthMs] = useState(3000);
  const [saved, setSaved] = useState<{path: string; bytes: number; fps: number} | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const res = await launchImageLibrary({mediaType: 'video', selectionLimit: 1});
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    try {
      const info = await Gifs.getVideoInfo(uri);
      setVideoUri(uri);
      setDurationMs(info.durationMs);
      setStartMs(0);
      setLengthMs(Math.min(3000, info.durationMs, MAX_MS));
      setSaved(null);
    } catch (e: any) {
      Alert.alert('Video not readable', e?.message ?? 'Try a different file.');
    }
  };

  const run = async () => {
    if (!videoUri) return;
    setBusy(true);
    try {
      const stickerId = `a_${Date.now()}`;
      const out = await Stickers.saveAnimatedSticker(packId, stickerId, {
        uri: videoUri,
        startMs,
        endMs: startMs + lengthMs,
      });

      const all = await loadPacks();
      const next = all.map(p =>
        p.identifier === packId
          ? bumpVersion({
              ...p,
              // A pack is all-static or all-animated. WhatsApp rejects a mix.
              animatedStickerPack: true,
              stickers: [
                ...p.stickers,
                {
                  id: stickerId,
                  fileName: out.fileName,
                  localPath: out.path,
                  emojis: [],
                  bytes: out.bytes,
                  animated: true,
                },
              ],
            })
          : p,
      );
      await savePacks(next);
      await spendExport();
      setSaved({path: out.path, bytes: out.bytes, fps: out.fps});
    } catch (e: any) {
      Alert.alert('Sticker not saved', e?.message ?? 'Encoding failed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if ((await remainingExports()) <= 0) {
      Alert.alert('Free exports used up', 'Watch a short ad for one more, or unlock unlimited exports in Settings.', [
        {text: 'Not now', style: 'cancel'},
        {text: 'Watch an ad', onPress: async () => ((await watchAdForOneExport()) ? run() : null)},
      ]);
      return;
    }
    run();
  };

  return (
    <Screen title="Animated sticker" subtitle="Up to 10 seconds, under 500 KB">
      <ScrollView contentContainerStyle={styles.body}>
        <Checkerboard size={12} style={styles.canvas}>
          {saved ? <Image source={{uri: `file://${saved.path}`}} style={styles.preview} /> : null}
          {!saved ? (
            <Text style={styles.placeholder}>
              {videoUri ? `Clip loaded: ${(durationMs / 1000).toFixed(1)}s` : 'Pick a video to start'}
            </Text>
          ) : null}
        </Checkerboard>

        <Text style={styles.label}>Start at {(startMs / 1000).toFixed(1)}s</Text>
        <View style={styles.row}>
          {[0, 2000, 5000, 10000]
            .filter(v => v < Math.max(durationMs, 1))
            .map(v => (
              <Text key={v} onPress={() => setStartMs(v)} style={[styles.chip, startMs === v && styles.chipOn]}>
                {v / 1000}s
              </Text>
            ))}
        </View>

        <Text style={styles.label}>Length {(lengthMs / 1000).toFixed(1)}s</Text>
        <View style={styles.row}>
          {[1000, 2000, 3000, 5000]
            .filter(v => startMs + v <= Math.max(durationMs, 1000) && v <= MAX_MS)
            .map(v => (
              <Text key={v} onPress={() => setLengthMs(v)} style={[styles.chip, lengthMs === v && styles.chipOn]}>
                {v / 1000}s
              </Text>
            ))}
        </View>

        {saved ? (
          <Text style={styles.note}>
            {(saved.bytes / 1024).toFixed(0)} KB at {saved.fps} fps. Added to this pack.
          </Text>
        ) : (
          <Text style={styles.note}>
            Frame rate drops automatically until the clip fits WhatsApp's 500 KB limit.
          </Text>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button label={videoUri ? 'Choose another video' : 'Choose a video'} onPress={pick} />
        <Button
          label={saved ? 'Back to the pack' : 'Save animated sticker'}
          variant="marker"
          busy={busy}
          disabled={!videoUri}
          onPress={saved ? () => navigation.goBack() : save}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {paddingHorizontal: theme.space(5), gap: theme.space(2)},
  canvas: {height: 220, alignItems: 'center', justifyContent: 'center'},
  preview: {width: '100%', height: '100%', resizeMode: 'contain'},
  placeholder: {...theme.type.body, color: theme.color.textMuted},
  label: {...theme.type.label, color: theme.color.textMuted, marginTop: theme.space(3)},
  row: {flexDirection: 'row', gap: theme.space(2)},
  chip: {
    ...theme.type.label,
    color: theme.color.text,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  chipOn: {backgroundColor: theme.color.marker, color: theme.color.markerInk},
  note: {...theme.type.meta, color: theme.color.textMuted, marginTop: theme.space(4)},
  actions: {padding: theme.space(5), gap: theme.space(2)},
});
