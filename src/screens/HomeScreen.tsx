import React, {useCallback, useState} from 'react';
import {View, Text, Pressable, StyleSheet, ScrollView} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Svg, {Circle, Path} from 'react-native-svg';
import {Screen} from '../components/Screen';
import {PackCard} from '../components/PackCard';
import {FadeIn} from '../components/FadeIn';
import {BannerAdSlot} from '../ads/BannerAdSlot';
import {theme, WHATSAPP_LIMITS} from '../theme';
import {remainingExports, FREE_EXPORTS_PER_MONTH} from '../storage/quota';
import {useSharedMedia} from '../lib/useSharedMedia';
import {loadPacks, savePacks, newPack, ensureTargetPack} from '../storage/packs';
import {pickPhotos, openForPhotos, BATCH_LIMIT} from '../lib/pickPhotos';
import {haptics} from '../lib/haptics';
import {reportError} from '../lib/errors';
import type {StickerPack} from '../types';

const TOOLS = [
  {key: 'GifMaker', title: 'Video to GIF', line: 'Trim, set speed, export'},
  {key: 'ImagesToGif', title: 'Photos to GIF', line: 'Turn a burst into a loop'},
  {key: 'GifEditor', title: 'Edit a GIF', line: 'Crop, reverse, resize'},
];

export function HomeScreen({navigation}: any) {
  const [left, setLeft] = useState(FREE_EXPORTS_PER_MONTH);
  const [packs, setPacks] = useState<StickerPack[]>([]);

  useFocusEffect(
    useCallback(() => {
      remainingExports()
        .then(setLeft)
        .catch(e => reportError(e, 'home.quota'));
      loadPacks()
        .then(setPacks)
        .catch(e => reportError(e, 'home.packs'));
    }, []),
  );

  // Shared straight from another app: skip the home screen entirely.
  useSharedMedia(
    useCallback(
      async media => {
        if (media.kind === 'video') {
          navigation.navigate('GifMaker');
          return;
        }
        const target = await ensureTargetPack();
        openForPhotos(navigation, target.identifier, media.uris);
      },
      [navigation],
    ),
  );

  const create = async () => {
    haptics.tap();
    try {
      const target = await ensureTargetPack();
      const room = WHATSAPP_LIMITS.maxStickers - target.stickers.length;
      const uris = await pickPhotos(Math.min(room, BATCH_LIMIT));
      openForPhotos(navigation, target.identifier, uris);
    } catch (e) {
      reportError(e, 'home.create');
    }
  };

  const newEmptyPack = async () => {
    haptics.tap();
    const pack = newPack(packs.length === 0 ? 'My stickers' : `Stickers ${packs.length + 1}`);
    await savePacks([pack, ...packs]);
    navigation.navigate('PackEditor', {packId: pack.identifier});
  };

  const unlimited = left > FREE_EXPORTS_PER_MONTH;

  return (
    <Screen
      title="DieCut"
      subtitle={unlimited ? 'Unlimited exports' : `${left} free exports left this month`}
      footer={<BannerAdSlot />}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={10}
          onPress={() => navigation.navigate('Settings')}
          style={styles.gear}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={3.2} stroke={theme.color.text} strokeWidth={1.8} fill="none" />
            <Path
              d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
              stroke={theme.color.text}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      }>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create stickers from your photos"
            onPress={create}
            style={({pressed}) => [styles.hero, pressed && styles.heroPressed]}>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Create stickers</Text>
              <Text style={styles.heroLine}>
                Pick photos and the subject is cut out for you. Pick many at once.
              </Text>
              <View style={styles.heroCta}>
                <Text style={styles.heroCtaText}>Choose photos</Text>
              </View>
            </View>
            <HeroArt />
          </Pressable>
        </FadeIn>

        <FadeIn delay={80}>
          <View style={styles.sectionHead}>
            <Text style={styles.section}>Your packs</Text>
            {packs.length > 0 ? (
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => navigation.navigate('Packs')}>
                <Text style={styles.link}>See all</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.packRow}>
            {packs.slice(0, 6).map(p => (
              <PackCard
                key={p.identifier}
                pack={p}
                compact
                onPress={() => navigation.navigate('PackEditor', {packId: p.identifier})}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a new pack"
              onPress={newEmptyPack}
              style={({pressed}) => [styles.newPack, pressed && styles.heroPressed]}>
              <Text style={styles.newPackPlus}>+</Text>
              <Text style={styles.newPackLabel}>New pack</Text>
            </Pressable>
          </ScrollView>
        </FadeIn>

        <FadeIn delay={160}>
          <Text style={[styles.section, styles.toolsHead]}>GIF tools</Text>
          <View style={styles.tools}>
            {TOOLS.map(tool => (
              <Pressable
                key={tool.key}
                accessibilityRole="button"
                accessibilityLabel={`${tool.title}. ${tool.line}`}
                onPress={() => {
                  haptics.tap();
                  navigation.navigate(tool.key);
                }}
                style={({pressed}) => [styles.tool, pressed && styles.heroPressed]}>
                <Text style={styles.toolTitle}>{tool.title}</Text>
                <Text style={styles.toolLine}>{tool.line}</Text>
              </Pressable>
            ))}
          </View>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

/** Two tilted die-cut stickers, the same mark as the launcher icon. */
function HeroArt() {
  return (
    <Svg width={104} height={104} viewBox="0 0 104 104">
      <Path
        d="M60 14h26a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H60a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10z"
        fill="#FFC94D"
        stroke="#FFFFFF"
        strokeWidth={4}
        transform="rotate(14 73 37)"
      />
      <Path
        d="M20 40h30a11 11 0 0 1 11 11v30a11 11 0 0 1-11 11H20a11 11 0 0 1-11-11V51a11 11 0 0 1 11-11z"
        fill="#FFFFFF"
        stroke="#FFFFFF"
        strokeWidth={4}
        transform="rotate(-12 35 66)"
      />
      <Path
        d="M22 44h26a9 9 0 0 1 9 9v26a9 9 0 0 1-9 9H22a9 9 0 0 1-9-9V53a9 9 0 0 1 9-9z"
        fill="#12060B"
        opacity={0.9}
        transform="rotate(-12 35 66)"
      />
      <Circle cx={30} cy={62} r={4.5} fill="#FF3D87" />
      <Circle cx={42} cy={62} r={4.5} fill="#FF3D87" />
      <Path d="M27 74q9 8 18 0" stroke="#FF3D87" strokeWidth={3.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: {padding: theme.space(5), paddingTop: theme.space(2), gap: theme.space(5), paddingBottom: theme.space(8)},
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.color.marker,
    borderRadius: theme.radius.lg + 4,
    padding: theme.space(5),
    overflow: 'hidden',
  },
  heroPressed: {opacity: 0.88, transform: [{scale: 0.985}]},
  heroText: {flex: 1, gap: theme.space(1.5)},
  heroTitle: {...theme.type.display, fontSize: 26, color: theme.color.markerInk},
  heroLine: {...theme.type.body, color: 'rgba(18,6,11,0.78)'},
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: theme.space(2),
    backgroundColor: theme.color.markerInk,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2.5),
  },
  heroCtaText: {...theme.type.label, color: '#FFFFFF'},
  sectionHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.space(3)},
  section: {...theme.type.title, color: theme.color.text},
  link: {...theme.type.label, color: theme.color.marker},
  packRow: {gap: theme.space(3), paddingRight: theme.space(5)},
  newPack: {
    width: 120,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(1),
    paddingVertical: theme.space(6),
  },
  newPackPlus: {color: theme.color.marker, fontSize: 30, fontWeight: '300', lineHeight: 32},
  newPackLabel: {...theme.type.label, color: theme.color.textMuted},
  toolsHead: {marginBottom: theme.space(3)},
  tools: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(3)},
  tool: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space(4),
    gap: 2,
  },
  toolTitle: {...theme.type.title, fontSize: 16, color: theme.color.text},
  toolLine: {...theme.type.meta, color: theme.color.textMuted},
});
