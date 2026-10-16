import React, {useState} from 'react';
import {View, Text, StyleSheet, Alert, Image, ScrollView, Pressable} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {BannerAdSlot} from '../ads/BannerAdSlot';
import {Gifs} from '../native';
import {theme} from '../theme';
import {remainingExports, spendExport} from '../storage/quota';
import {watchAdForOneExport} from '../ads/rewarded';

/**
 * Presets do the thinking for the common cases. Someone making a status GIF should
 * not have to know that 320px at 10fps is what keeps the file small enough to send.
 */
const PRESETS = [
  {key: 'status', label: 'WhatsApp status', endMs: 6000, fps: 12, width: 320, boomerang: false},
  {key: 'reel', label: 'Reel loop', endMs: 4000, fps: 15, width: 480, boomerang: true},
  {key: 'reaction', label: 'Reaction GIF', endMs: 2000, fps: 12, width: 240, boomerang: false},
  {key: 'meme', label: 'Tiny meme', endMs: 3000, fps: 8, width: 200, boomerang: false},
];

const FPS_STEPS = [8, 10, 15, 20];
const WIDTH_STEPS = [200, 240, 320, 480];

export function GifMakerScreen() {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(3000);
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(320);
  const [speed, setSpeed] = useState(1);
  const [boomerang, setBoomerang] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [result, setResult] = useState<{uri: string; path: string; bytes: number} | null>(null);
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
      setEndMs(Math.min(3000, info.durationMs));
      setResult(null);
    } catch (e: any) {
      Alert.alert('Video not readable', e?.message ?? 'Try a different file.');
    }
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setEndMs(Math.min(startMs + p.endMs, durationMs || p.endMs));
    setFps(p.fps);
    setWidth(p.width);
    setBoomerang(p.boomerang);
  };

  const runExport = async () => {
    if (!videoUri) return;
    setBusy(true);
    try {
      const out = await Gifs.videoToGif({
        uri: videoUri,
        startMs,
        endMs,
        fps,
        width,
        speed,
        loopCount: 0,
        boomerang,
        reverse,
      });
      setResult(out);
      await spendExport();
    } catch (e: any) {
      Alert.alert('GIF not created', e?.message ?? 'Frame extraction failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportGif = async () => {
    if (!videoUri) return;
    if ((await remainingExports()) <= 0) {
      Alert.alert('Free exports used up', 'Watch a short ad for one more, or unlock unlimited exports in Settings.', [
        {text: 'Not now', style: 'cancel'},
        {
          text: 'Watch an ad',
          onPress: async () => {
            if (await watchAdForOneExport()) {
              runExport();
            } else {
              Alert.alert('No ad available', 'Try again in a moment.');
            }
          },
        },
      ]);
      return;
    }
    runExport();
  };

  const saveToGallery = async () => {
    if (!result) return;
    try {
      await Gifs.saveGifToGallery(result.path);
      Alert.alert('Saved to gallery', 'Find it in Pictures/DieCut.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not write to the gallery.');
    }
  };

  const lengthMs = Math.max(0, endMs - startMs);

  return (
    <Screen title="Video to GIF" subtitle="Runs on your phone, nothing is uploaded" footer={<BannerAdSlot />}>
      <ScrollView contentContainerStyle={styles.body}>
        {result ? (
          <Image source={{uri: result.uri}} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {videoUri ? `Clip loaded: ${(durationMs / 1000).toFixed(1)}s` : 'Pick a video to start'}
            </Text>
          </View>
        )}

        <Text style={styles.label}>Start with a preset</Text>
        <View style={styles.wrapRow}>
          {PRESETS.map(p => (
            <Text key={p.key} onPress={() => applyPreset(p)} style={styles.chip}>
              {p.label}
            </Text>
          ))}
        </View>

        <Text style={styles.label}>Start at {(startMs / 1000).toFixed(1)}s</Text>
        <Row
          options={[0, 2000, 5000, 10000].filter(v => v < Math.max(durationMs, 1))}
          value={startMs}
          format={v => `${v / 1000}s`}
          onSelect={v => {
            setStartMs(v);
            setEndMs(Math.min(v + lengthMs, durationMs));
          }}
        />

        <Text style={styles.label}>Length {(lengthMs / 1000).toFixed(1)}s</Text>
        <Row
          options={[1000, 3000, 5000, 10000].filter(v => startMs + v <= Math.max(durationMs, 1000))}
          value={lengthMs}
          format={v => `${v / 1000}s`}
          onSelect={v => setEndMs(startMs + v)}
        />

        <Text style={styles.label}>Frames per second</Text>
        <Row options={FPS_STEPS} value={fps} format={v => `${v}`} onSelect={setFps} />

        <Text style={styles.label}>Width</Text>
        <Row options={WIDTH_STEPS} value={width} format={v => `${v}px`} onSelect={setWidth} />

        <Text style={styles.label}>Speed</Text>
        <Row options={[0.5, 1, 2, 4]} value={speed} format={v => `${v}x`} onSelect={setSpeed} />

        <View style={styles.toggles}>
          <Pressable onPress={() => setBoomerang(b => !b)} style={[styles.toggle, boomerang && styles.toggleOn]}>
            <Text style={[styles.toggleText, boomerang && styles.toggleTextOn]}>Boomerang</Text>
          </Pressable>
          <Pressable onPress={() => setReverse(r => !r)} style={[styles.toggle, reverse && styles.toggleOn]}>
            <Text style={[styles.toggleText, reverse && styles.toggleTextOn]}>Reverse</Text>
          </Pressable>
        </View>

        {result ? <Text style={styles.size}>{(result.bytes / 1024).toFixed(0)} KB</Text> : null}
      </ScrollView>

      <View style={styles.actions}>
        {result ? <Button label="Save to gallery" onPress={saveToGallery} /> : null}
        <Button label={videoUri ? 'Choose another video' : 'Choose a video'} onPress={pick} />
        <Button label="Export GIF" variant="marker" busy={busy} disabled={!videoUri} onPress={exportGif} />
      </View>
    </Screen>
  );
}

function Row({options, value, format, onSelect}: {
  options: number[];
  value: number;
  format: (v: number) => string;
  onSelect: (v: number) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map(opt => (
        <Text key={opt} onPress={() => onSelect(opt)} style={[styles.chip, value === opt && styles.chipOn]}>
          {format(opt)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {paddingHorizontal: theme.space(5), paddingBottom: theme.space(4), gap: theme.space(2)},
  placeholder: {
    height: 170,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {...theme.type.body, color: theme.color.textMuted},
  preview: {height: 170, borderRadius: theme.radius.lg, resizeMode: 'contain', backgroundColor: theme.color.surface},
  label: {...theme.type.label, color: theme.color.textMuted, marginTop: theme.space(3)},
  row: {flexDirection: 'row', gap: theme.space(2)},
  wrapRow: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2)},
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
  toggles: {flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(4)},
  toggle: {
    flex: 1,
    paddingVertical: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.hairline,
    alignItems: 'center',
  },
  toggleOn: {backgroundColor: theme.color.marker, borderColor: theme.color.marker},
  toggleText: {...theme.type.label, color: theme.color.text},
  toggleTextOn: {color: theme.color.markerInk},
  size: {...theme.type.meta, color: theme.color.highlight, marginTop: theme.space(3)},
  actions: {padding: theme.space(5), gap: theme.space(2)},
});
