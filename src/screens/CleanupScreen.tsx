import React, {useRef, useState} from 'react';
import {View, Text, Image, StyleSheet, Alert, PanResponder, LayoutChangeEvent} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {Checkerboard} from '../components/Checkerboard';
import {Stickers} from '../native';
import {theme} from '../theme';
import type {Point, Stroke} from '../types';
import {returnToEditor} from '../lib/handoff';

const BRUSH_SIZES = [0.03, 0.06, 0.12];

/**
 * Segmentation always misses hair, glass and anything held in front of the subject.
 * This is where a user fixes that, so the canvas gets the whole screen and the
 * committed strokes are re-applied natively rather than composited in JS.
 */
export function CleanupScreen({route, navigation}: any) {
  const {cutUri, originalUri} = route.params;

  const [baseUri, setBaseUri] = useState<string>(cutUri);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Point[]>([]);
  const [erase, setErase] = useState(true);
  const [radius, setRadius] = useState(0.06);
  const [busy, setBusy] = useState(false);

  const box = useRef({width: 1, height: 1});
  const livePoints = useRef<Point[]>([]);
  const mode = useRef({erase: true, radius: 0.06});
  mode.current = {erase, radius};

  const onLayout = (e: LayoutChangeEvent) => {
    box.current = e.nativeEvent.layout;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        livePoints.current = [normalise(e.nativeEvent.locationX, e.nativeEvent.locationY, box.current)];
        setLive(livePoints.current);
      },
      onPanResponderMove: e => {
        livePoints.current = [
          ...livePoints.current,
          normalise(e.nativeEvent.locationX, e.nativeEvent.locationY, box.current),
        ];
        setLive(livePoints.current);
      },
      onPanResponderRelease: () => {
        // Copied out before the reset below. The functional update runs later, during
        // render, and by then livePoints.current is already empty, so reading the ref
        // inside it saved every stroke with no points and nothing was ever erased.
        const points = livePoints.current;
        const {radius: r, erase: e} = mode.current;
        if (points.length) {
          setStrokes(prev => [...prev, {points, radius: r, erase: e}]);
        }
        livePoints.current = [];
        setLive([]);
      },
    }),
  ).current;

  const commit = async () => {
    if (!strokes.length) {
      finish(baseUri);
      return;
    }
    setBusy(true);
    try {
      const next = await Stickers.applyStrokes(baseUri, originalUri, strokes);
      setBaseUri(next);
      setStrokes([]);
      return next;
    } catch (e: any) {
      Alert.alert('Could not apply the edit', e?.message ?? 'Try a shorter stroke.');
    } finally {
      setBusy(false);
    }
  };

  const finish = (uri: string) => returnToEditor(navigation, {edited: uri});

  const done = async () => {
    const applied = strokes.length ? await commit() : baseUri;
    if (applied) finish(applied);
  };

  return (
    <Screen title="Clean up" subtitle={erase ? 'Rub out what the cut-out missed' : 'Paint the photo back in'}>
      <View style={styles.canvasWrap} onLayout={onLayout} {...pan.panHandlers}>
        <Checkerboard size={14} style={StyleSheet.absoluteFill as any} />
        <Image source={{uri: baseUri}} style={styles.image} />
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {[...strokes, ...(live.length ? [{points: live, radius, erase}] : [])].map((s, i) => (
            <Path
              key={i}
              d={toPathData(s.points, box.current)}
              stroke={s.erase ? theme.color.danger : theme.color.highlight}
              strokeOpacity={0.55}
              strokeWidth={s.radius * 2 * box.current.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>

      <View style={styles.controls}>
        <View style={styles.row}>
          <Text onPress={() => setErase(true)} style={[styles.chip, erase && styles.chipOn]}>
            Erase
          </Text>
          <Text onPress={() => setErase(false)} style={[styles.chip, !erase && styles.chipOn]}>
            Restore
          </Text>
        </View>
        <View style={styles.row}>
          {BRUSH_SIZES.map((r, i) => (
            <Text key={r} onPress={() => setRadius(r)} style={[styles.chip, radius === r && styles.chipOn]}>
              {['Small', 'Medium', 'Large'][i]}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label="Undo last stroke"
          variant="ghost"
          disabled={!strokes.length}
          onPress={() => setStrokes(prev => prev.slice(0, -1))}
        />
        <Button label="Done" variant="marker" busy={busy} onPress={done} />
      </View>
    </Screen>
  );
}

function normalise(x: number, y: number, box: {width: number; height: number}): Point {
  return {x: x / box.width, y: y / box.height};
}

function toPathData(points: Point[], box: {width: number; height: number}): string {
  if (!points.length) return '';
  const head = points[0];
  const rest = points.slice(1).map(p => `L ${p.x * box.width} ${p.y * box.height}`);
  return `M ${head.x * box.width} ${head.y * box.height} ${rest.join(' ')}`;
}

const styles = StyleSheet.create({
  canvasWrap: {flex: 1, margin: theme.space(5), borderRadius: theme.radius.md, overflow: 'hidden'},
  image: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, resizeMode: 'contain'},
  controls: {paddingHorizontal: theme.space(5), gap: theme.space(2)},
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
  actions: {padding: theme.space(5), gap: theme.space(2)},
});
