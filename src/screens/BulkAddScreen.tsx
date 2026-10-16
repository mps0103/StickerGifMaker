import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Image, StyleSheet, Animated, Easing, ScrollView} from 'react-native';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {Checkerboard} from '../components/Checkerboard';
import {FadeIn} from '../components/FadeIn';
import {theme} from '../theme';
import {buildSticker, appendSticker} from '../lib/stickerPipeline';
import {remainingExports, spendExport} from '../storage/quota';
import {getSettings} from '../storage/settings';
import {reportError} from '../lib/errors';
import {haptics} from '../lib/haptics';

type Phase = 'running' | 'done' | 'cancelled' | 'quota';

/**
 * Cuts out and saves a whole batch of photos with the user's default style.
 *
 * Every sticker is persisted the moment it is built, not at the end, so leaving
 * the screen, running out of free exports or the process dying mid-batch loses
 * nothing that was already finished.
 */
export function BulkAddScreen({route, navigation}: any) {
  const {packId, uris} = route.params as {packId: string; uris: string[]};

  const [index, setIndex] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [noSubject, setNoSubject] = useState(0);
  const [cutFailed, setCutFailed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [phase, setPhase] = useState<Phase>('running');

  const cancelled = useRef(false);
  const started = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const style = getSettings();
      for (let i = 0; i < uris.length; i++) {
        if (cancelled.current) {
          setPhase('cancelled');
          return;
        }
        if ((await remainingExports()) <= 0) {
          haptics.warn();
          setPhase('quota');
          return;
        }
        setIndex(i);
        try {
          const result = await buildSticker(packId, uris[i], style);
          await appendSticker(packId, result.sticker);
          await spendExport();
          setThumbs(t => [...t, `file://${result.sticker.localPath}`]);
          if (result.reason === 'no-subject') setNoSubject(n => n + 1);
          if (result.reason === 'failed') setCutFailed(n => n + 1);
        } catch (e) {
          reportError(e, 'bulk.item');
          setFailed(f => f + 1);
        }
        Animated.timing(progress, {
          toValue: (i + 1) / uris.length,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
      haptics.success();
      setPhase('done');
    })();

    return () => {
      cancelled.current = true;
    };
  }, [packId, uris, progress]);

  const finish = () => {
    const routes = navigation.getState().routes;
    const hasEditor = routes.some((r: any) => r.name === 'PackEditor' && r.params?.packId === packId);
    if (hasEditor) {
      navigation.popTo('PackEditor', {packId});
    } else {
      navigation.replace('PackEditor', {packId});
    }
  };

  const added = thumbs.length;
  const running = phase === 'running';

  const headline =
    phase === 'running'
      ? `Adding ${Math.min(index + 1, uris.length)} of ${uris.length}`
      : phase === 'quota'
      ? 'Free exports used up'
      : phase === 'cancelled'
      ? 'Stopped'
      : added > 0
      ? `${added} sticker${added === 1 ? '' : 's'} added`
      : 'Nothing was added';

  const notes: string[] = [];
  if (noSubject > 0) {
    notes.push(
      `${noSubject} photo${noSubject === 1 ? ' had' : 's had'} no clear subject, so ${
        noSubject === 1 ? 'it was' : 'they were'
      } kept as-is.`,
    );
  }
  if (cutFailed > 0) {
    notes.push(
      `Background removal did not run for ${cutFailed} photo${cutFailed === 1 ? '' : 's'}, so ${
        cutFailed === 1 ? 'it was' : 'they were'
      } kept as-is. Open them in the editor to try again.`,
    );
  }
  if (failed > 0) notes.push(`${failed} could not be processed.`);
  if (phase === 'quota') {
    notes.push('Unlock unlimited exports in Settings to finish the rest.');
  }

  return (
    <Screen title="Adding stickers" subtitle="Cutting out each photo automatically">
      <View style={styles.body}>
        <Text style={styles.headline}>{headline}</Text>

        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              {width: progress.interpolate({inputRange: [0, 1], outputRange: ['0%', '100%']})},
            ]}
          />
        </View>

        {notes.map(n => (
          <Text key={n} style={styles.note}>
            {n}
          </Text>
        ))}

        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {thumbs.map((uri, i) => (
            <FadeIn key={uri} offset={8} duration={200} style={styles.cell}>
              <Checkerboard size={8} style={styles.cellInner}>
                <Image source={{uri}} style={styles.cellImage} />
              </Checkerboard>
              <Text style={styles.cellIndex}>{i + 1}</Text>
            </FadeIn>
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        {running ? (
          <Button
            label="Stop"
            variant="ghost"
            onPress={() => {
              cancelled.current = true;
            }}
          />
        ) : (
          <>
            {phase === 'quota' ? (
              <Button label="Unlock in Settings" variant="ghost" onPress={() => navigation.navigate('Settings')} />
            ) : null}
            <Button label="View pack" variant="marker" onPress={finish} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {flex: 1, padding: theme.space(5), gap: theme.space(3)},
  headline: {...theme.type.title, color: theme.color.text},
  track: {height: 8, borderRadius: 4, backgroundColor: theme.color.raised, overflow: 'hidden'},
  fill: {height: '100%', backgroundColor: theme.color.marker, borderRadius: 4},
  note: {...theme.type.body, color: theme.color.textMuted},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), paddingTop: theme.space(2)},
  cell: {width: '31%', aspectRatio: 1},
  cellInner: {flex: 1, borderRadius: theme.radius.sm},
  cellImage: {width: '100%', height: '100%', resizeMode: 'contain'},
  cellIndex: {
    position: 'absolute',
    left: 6,
    bottom: 4,
    ...theme.type.meta,
    color: theme.color.textMuted,
  },
  footer: {padding: theme.space(5), gap: theme.space(2)},
});
