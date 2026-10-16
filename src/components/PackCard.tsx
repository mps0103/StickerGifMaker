import React from 'react';
import {View, Text, Image, Pressable, StyleSheet} from 'react-native';
import {Checkerboard} from './Checkerboard';
import {theme, WHATSAPP_LIMITS} from '../theme';
import {packProblem} from '../storage/packs';
import type {StickerPack} from '../types';

/** One pack at a glance: a strip of its first stickers, its name and whether it is ready. */
export function PackCard({
  pack,
  onPress,
  onMore,
  compact,
}: {
  pack: StickerPack;
  onPress: () => void;
  onMore?: () => void;
  compact?: boolean;
}) {
  const preview = pack.stickers.slice(0, 3);
  const problem = packProblem(pack, WHATSAPP_LIMITS.minStickers);
  const status = problem
    ? `${Math.max(0, WHATSAPP_LIMITS.minStickers - pack.stickers.length)} more needed`
    : 'Ready';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pack.name}, ${pack.stickers.length} stickers, ${status}`}
      onPress={onPress}
      style={({pressed}) => [styles.card, compact && styles.compact, pressed && styles.pressed]}>
      <View style={styles.strip}>
        {[0, 1, 2].map(i => {
          const s = preview[i];
          return (
            <Checkerboard key={i} size={6} style={styles.thumb}>
              {s ? <Image source={{uri: `file://${s.localPath}`}} style={styles.thumbImage} /> : null}
            </Checkerboard>
          );
        })}
      </View>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {pack.name}
          </Text>
          <Text style={styles.meta}>
            {pack.stickers.length} sticker{pack.stickers.length === 1 ? '' : 's'}
            {pack.animatedStickerPack || pack.stickers.some(s => s.animated) ? ' · animated' : ''}
          </Text>
        </View>
        {onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More options for ${pack.name}`}
            hitSlop={10}
            onPress={onMore}
            style={styles.more}>
            <Text style={styles.moreGlyph}>•••</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.chip, !problem && styles.chipReady]}>
        <Text style={[styles.chipText, !problem && styles.chipReadyText]}>{status}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space(3.5),
    gap: theme.space(2.5),
  },
  compact: {width: 200},
  pressed: {opacity: 0.85},
  strip: {flexDirection: 'row', gap: theme.space(1.5)},
  thumb: {flex: 1, aspectRatio: 1, borderRadius: theme.radius.sm},
  thumbImage: {width: '100%', height: '100%', resizeMode: 'contain'},
  row: {flexDirection: 'row', alignItems: 'center'},
  text: {flex: 1},
  name: {...theme.type.title, fontSize: 17, color: theme.color.text},
  meta: {...theme.type.meta, color: theme.color.textMuted, marginTop: 2},
  more: {paddingHorizontal: theme.space(2), paddingVertical: theme.space(1)},
  moreGlyph: {color: theme.color.textMuted, fontSize: 14, letterSpacing: 1},
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.space(2.5),
    paddingVertical: theme.space(1),
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,201,77,0.14)',
  },
  chipReady: {backgroundColor: 'rgba(120,220,160,0.14)'},
  chipText: {...theme.type.meta, color: theme.color.highlight, fontWeight: '600'},
  chipReadyText: {color: '#7DDCA0'},
});
