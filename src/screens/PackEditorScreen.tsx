import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {Checkerboard} from '../components/Checkerboard';
import {FadeIn} from '../components/FadeIn';
import {BottomSheet, SheetAction} from '../components/BottomSheet';
import {
  loadPacks,
  savePacks,
  bumpVersion,
  publishPacks,
  packProblem,
} from '../storage/packs';
import {Stickers} from '../native';
import {WHATSAPP_LIMITS, theme} from '../theme';
import {EMOJI_CHOICES, MAX_EMOJIS, DEFAULT_EMOJI} from '../lib/emojis';
import {reportError} from '../lib/errors';
import {haptics} from '../lib/haptics';
import {pickPhotos, openForPhotos, BATCH_LIMIT} from '../lib/pickPhotos';
import type {Sticker, StickerPack} from '../types';

type Sheet = {kind: 'add'} | {kind: 'sticker'; id: string; mode: 'actions' | 'emojis'} | null;

export function PackEditorScreen({route, navigation}: any) {
  const {packId} = route.params;
  const [pack, setPack] = useState<StickerPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  // Cells have a fixed width. With flex: 1 a lone sticker on the last row of a
  // three-column grid stretches to fill the whole row.
  const {width: screenWidth} = useWindowDimensions();
  const cellSize = Math.floor((screenWidth - theme.space(5) * 2 - theme.space(2) * 2) / 3);

  const reload = useCallback(async () => {
    const all = await loadPacks();
    setPack(all.find(p => p.identifier === packId) ?? null);
  }, [packId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const persist = async (next: StickerPack) => {
    const all = await loadPacks();
    await savePacks(all.map(p => (p.identifier === next.identifier ? next : p)));
    setPack(next);
  };

  const selected: Sticker | undefined =
    sheet?.kind === 'sticker' ? pack?.stickers.find(s => s.id === sheet.id) : undefined;

  const removeSticker = (s: Sticker) =>
    Alert.alert('Delete this sticker?', 'It will be removed from the pack.', [
      {text: 'Keep', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!pack) return;
          try {
            await Stickers.deleteSticker(pack.identifier, s.fileName);
            await persist(bumpVersion({...pack, stickers: pack.stickers.filter(x => x.id !== s.id)}));
            haptics.tap();
          } catch (e: any) {
            reportError(e, 'pack.delete');
            Alert.alert('Could not delete', e?.message ?? 'Try again.');
          }
        },
      },
    ]);

  const saveToGallery = async (s: Sticker) => {
    if (!pack) return;
    try {
      await Stickers.exportStickerToGallery(pack.identifier, s.fileName);
      haptics.success();
      Alert.alert('Saved to gallery', 'Find it in Pictures/DieCut. Works in Telegram, Signal and Instagram too.');
    } catch (e: any) {
      reportError(e, 'pack.export');
      Alert.alert('Export failed', e?.message ?? 'Could not write to the gallery.');
    }
  };

  const share = async (s: Sticker) => {
    if (!pack) return;
    try {
      await Stickers.shareSticker(pack.identifier, s.fileName);
    } catch (e: any) {
      reportError(e, 'pack.share');
      Alert.alert('Could not share', e?.message ?? 'Try again.');
    }
  };

  const toggleEmoji = async (s: Sticker, emoji: string) => {
    if (!pack) return;
    const has = s.emojis.includes(emoji);
    if (!has && s.emojis.length >= MAX_EMOJIS) return;
    haptics.select();
    const emojis = has ? s.emojis.filter(e => e !== emoji) : [...s.emojis, emoji];
    // WhatsApp needs one emoji at minimum, so the last tag cannot be removed.
    if (emojis.length === 0) emojis.push(DEFAULT_EMOJI);
    await persist(
      bumpVersion({
        ...pack,
        stickers: pack.stickers.map(x =>
          x.id === s.id
            ? {...x, emojis, accessibilityText: `Sticker ${emojis.join(' ')}`}
            : x,
        ),
      }),
    );
  };

  const pick = async (many: boolean) => {
    if (!pack) return;
    setSheet(null);
    const room = WHATSAPP_LIMITS.maxStickers - pack.stickers.length;
    const uris = await pickPhotos(many ? Math.min(room, BATCH_LIMIT) : 1);
    openForPhotos(navigation, pack.identifier, uris);
  };

  const addToWhatsApp = async () => {
    if (!pack) return;
    const problem = packProblem(pack, WHATSAPP_LIMITS.minStickers);
    if (problem) {
      haptics.warn();
      Alert.alert('Pack is not ready', problem);
      return;
    }
    setBusy(true);
    try {
      const installed = await Stickers.isWhatsAppInstalled();
      if (!installed.consumer && !installed.business) {
        Alert.alert('WhatsApp not found', 'Install WhatsApp, or save the stickers as images to use them elsewhere.');
        return;
      }
      const bumped = bumpVersion(pack);
      await persist(bumped);
      // savePacks records a publish failure quietly; here it has to be loud,
      // because WhatsApp is about to read exactly what was published.
      await publishPacks(await loadPacks());
      await Stickers.addPackToWhatsApp(bumped.identifier, bumped.name);
    } catch (e: any) {
      reportError(e, 'pack.whatsapp');
      haptics.warn();
      Alert.alert('Could not add the pack', e?.message ?? 'WhatsApp refused the handoff.');
    } finally {
      setBusy(false);
    }
  };

  if (!pack) return <Screen title="Pack"><View /></Screen>;

  const full = pack.stickers.length >= WHATSAPP_LIMITS.maxStickers;
  const hasAnimated = pack.stickers.some(s => s.animated);
  const hasStill = pack.stickers.some(s => !s.animated);
  const problem = packProblem(pack, WHATSAPP_LIMITS.minStickers);

  return (
    <Screen
      title={pack.name}
      subtitle={`${pack.stickers.length} of ${WHATSAPP_LIMITS.maxStickers} stickers${
        hasAnimated ? ' · animated' : ''
      }`}>
      <TextInput
        value={pack.name}
        onChangeText={name => setPack({...pack, name})}
        onEndEditing={() => persist(pack)}
        style={styles.nameInput}
        placeholder="Pack name"
        placeholderTextColor={theme.color.textMuted}
        maxLength={128}
        accessibilityLabel="Pack name"
      />

      {problem ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{problem}</Text>
        </View>
      ) : (
        <View style={[styles.banner, styles.bannerReady]}>
          <Text style={[styles.bannerText, styles.bannerReadyText]}>Ready for WhatsApp</Text>
        </View>
      )}

      <FlatList
        data={pack.stickers}
        numColumns={3}
        keyExtractor={s => s.id}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({item, index}) => (
          <FadeIn delay={Math.min(index, 9) * 40} offset={8} style={{width: cellSize, aspectRatio: 1}}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sticker ${index + 1}, options`}
              style={styles.cellPress}
              onPress={() => {
                haptics.tap();
                setSheet({kind: 'sticker', id: item.id, mode: 'actions'});
              }}>
              <Checkerboard size={8} style={styles.cellInner}>
                <Image source={{uri: `file://${item.localPath}`}} style={styles.cellImage} />
              </Checkerboard>
            </Pressable>
          </FadeIn>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No stickers yet</Text>
            <Text style={styles.hint}>
              Add one photo to cut it out by hand, or pick several and they are cut out
              automatically.
            </Text>
          </View>
        }
      />

      <View style={styles.actions}>
        <View style={styles.actionRow}>
          <Button
            label={full ? 'Pack is full' : 'Add stickers'}
            onPress={() => setSheet({kind: 'add'})}
            disabled={full || hasAnimated}
            style={styles.half}
          />
          <Button
            label="Animated"
            onPress={() => navigation.navigate('AnimatedSticker', {packId: pack.identifier})}
            disabled={full || hasStill}
            style={styles.half}
          />
        </View>
        <Button label="Add to WhatsApp" variant="marker" busy={busy} onPress={addToWhatsApp} />
      </View>

      <BottomSheet visible={sheet?.kind === 'add'} onClose={() => setSheet(null)} title="Add stickers">
        <SheetAction
          label="One photo"
          hint="Full editor: border, shadow, text, clean-up"
          onPress={() => pick(false)}
        />
        <SheetAction
          label="Several photos"
          hint={`Pick up to ${Math.min(BATCH_LIMIT, WHATSAPP_LIMITS.maxStickers - pack.stickers.length)}, each cut out automatically`}
          onPress={() => pick(true)}
        />
      </BottomSheet>

      <BottomSheet
        visible={sheet?.kind === 'sticker' && !!selected}
        onClose={() => setSheet(null)}
        title={sheet?.kind === 'sticker' && sheet.mode === 'emojis' ? 'Emoji tags' : 'Sticker'}>
        {selected && sheet?.kind === 'sticker' && sheet.mode === 'actions' ? (
          <>
            <View style={styles.sheetPreview}>
              <Checkerboard size={8} style={styles.sheetPreviewBox}>
                <Image source={{uri: `file://${selected.localPath}`}} style={styles.cellImage} />
              </Checkerboard>
              <Text style={styles.sheetEmojis}>{selected.emojis.join(' ')}</Text>
            </View>
            <SheetAction
              label="Edit emoji tags"
              hint="Help people find it in WhatsApp"
              onPress={() => setSheet({kind: 'sticker', id: selected.id, mode: 'emojis'})}
            />
            <SheetAction
              label="Share"
              hint="Send as a sticker to WhatsApp or Telegram"
              onPress={() => {
                setSheet(null);
                share(selected);
              }}
            />
            <SheetAction
              label="Save to gallery"
              hint="PNG with transparency, for any other app"
              onPress={() => {
                setSheet(null);
                saveToGallery(selected);
              }}
            />
            <SheetAction
              label="Delete"
              danger
              onPress={() => {
                setSheet(null);
                removeSticker(selected);
              }}
            />
          </>
        ) : null}
        {selected && sheet?.kind === 'sticker' && sheet.mode === 'emojis' ? (
          <>
            <View style={styles.emojiGrid}>
              {/* Tags already on the sticker are listed first even when they are not in the
                  standard set, otherwise the default one could never be taken off. */}
              {[...selected.emojis.filter(x => !EMOJI_CHOICES.includes(x)), ...EMOJI_CHOICES].map(e => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={`Tag ${e}`}
                  onPress={() => toggleEmoji(selected, e)}
                  style={[styles.emoji, selected.emojis.includes(e) && styles.emojiOn]}>
                  <Text style={styles.emojiText}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <SheetAction
              label="Done"
              onPress={() => setSheet({kind: 'sticker', id: selected.id, mode: 'actions'})}
            />
          </>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nameInput: {
    marginHorizontal: theme.space(5),
    marginBottom: theme.space(3),
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    color: theme.color.text,
    ...theme.type.body,
  },
  banner: {
    marginHorizontal: theme.space(5),
    marginBottom: theme.space(3),
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2.5),
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,201,77,0.12)',
  },
  bannerText: {...theme.type.label, color: theme.color.highlight},
  bannerReady: {backgroundColor: 'rgba(120,220,160,0.12)'},
  bannerReadyText: {color: '#7DDCA0'},
  grid: {paddingHorizontal: theme.space(5), gap: theme.space(2), flexGrow: 1},
  gridRow: {gap: theme.space(2)},
  cellPress: {flex: 1},
  cellInner: {flex: 1, borderRadius: theme.radius.sm},
  cellImage: {width: '100%', height: '100%', resizeMode: 'contain'},
  empty: {padding: theme.space(6), alignItems: 'center', gap: theme.space(2)},
  emptyTitle: {...theme.type.title, color: theme.color.text},
  hint: {...theme.type.body, color: theme.color.textMuted, textAlign: 'center'},
  actions: {padding: theme.space(5), gap: theme.space(2)},
  actionRow: {flexDirection: 'row', gap: theme.space(2)},
  half: {flex: 1},
  sheetPreview: {flexDirection: 'row', alignItems: 'center', gap: theme.space(3), marginBottom: theme.space(2)},
  sheetPreviewBox: {width: 72, height: 72, borderRadius: theme.radius.md},
  sheetEmojis: {fontSize: 24},
  emojiGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginBottom: theme.space(2)},
  emoji: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOn: {backgroundColor: theme.color.marker},
  emojiText: {fontSize: 21},
});
