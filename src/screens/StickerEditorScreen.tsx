import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Alert,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {Checkerboard} from '../components/Checkerboard';
import {FadeIn} from '../components/FadeIn';
import {Stickers} from '../native';
import {loadPacks, savePacks, bumpVersion} from '../storage/packs';
import {theme} from '../theme';
import {spendExport, remainingExports} from '../storage/quota';
import {watchAdForOneExport} from '../ads/rewarded';
import {useSettings} from '../storage/settings';
import {EMOJI_CHOICES, MAX_EMOJIS, DEFAULT_EMOJI} from '../lib/emojis';
import {reportError} from '../lib/errors';
import {haptics} from '../lib/haptics';

const OUTLINE_STEPS = [0, 8, 14, 22];
const OUTLINE_LABELS: Record<number, string> = {0: 'None', 8: 'Thin', 14: 'Classic', 22: 'Bold'};
const OUTLINE_COLORS = ['#FFFFFF', '#141119', '#FF3D87', '#FFC94D'];
const SHADOWS = [
  {value: 0, label: 'Flat'},
  {value: 6, label: 'Soft'},
  {value: 14, label: 'Lifted'},
];

export function StickerEditorScreen({route, navigation}: any) {
  const {packId, sourceUri, edited, bakedText, editedAt} = route.params;
  const settings = useSettings();

  const [cutUri, setCutUri] = useState<string | null>(null);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [working, setWorking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emojis, setEmojis] = useState<string[]>([]);
  const [outline, setOutline] = useState(settings.outline);
  const [outlineColor, setOutlineColor] = useState(settings.outlineColor);
  const [shadow, setShadow] = useState(settings.shadow);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [keepingBackground, setKeepingBackground] = useState(false);

  // The automatic cut-out, remembered so "Keep the background" can be undone.
  const autoCut = useRef<string | null>(null);
  // Effects re-render natively, so results can land out of order; only the latest wins.
  const renderTicket = useRef(0);
  // Rotations and flips applied so far. Clean up's Restore brush paints from the
  // original photo, so the original has to be put through the same moves or it
  // would be restored sideways.
  const ops = useRef<{rotate?: number; flipH?: boolean}[]>([]);
  // False once text is baked in: that bitmap no longer lines up with the photo.
  const restorable = useRef(true);

  useEffect(() => {
    let alive = true;
    Stickers.removeBackground(sourceUri)
      .then(uri => {
        if (!alive) return;
        autoCut.current = uri;
        setCutUri(uri);
        setIssue(null);
      })
      .catch(e => {
        if (!alive) return;
        reportError(e, 'editor.cutout');
        // Falling back to the untouched photo keeps the screen usable, but it has
        // to say so: handing back the original in silence looks exactly like a
        // cut-out that worked and left the whole background in place.
        setCutUri(sourceUri);
        setKeepingBackground(true);
        setIssue(
          e?.code === 'E_NO_SUBJECT'
            ? 'No clear subject found, so this is the original photo. Use Clean up to erase the background by hand.'
            : 'Background removal failed, so this is the original photo. Use Clean up to erase it by hand.',
        );
      })
      .finally(() => alive && setWorking(false));
    return () => {
      alive = false;
    };
  }, [sourceUri]);

  // Clean up and Add text hand their result back as plain route params.
  useEffect(() => {
    if (!edited) return;
    setCutUri(edited);
    setKeepingBackground(false);
    if (bakedText) {
      restorable.current = false;
      // Text is already drawn into the bitmap; an outline would wrap the letters.
      setOutline(0);
      setShadow(0);
    }
  }, [edited, editedAt, bakedText]);

  const refresh = useCallback(async () => {
    if (!cutUri) return;
    const ticket = ++renderTicket.current;
    // Rendered natively even with no border or shadow: that pass is also what crops
    // the transparent margin, so the preview and the saved sticker stay tight.
    try {
      const next = await Stickers.applyEffects(cutUri, {
        outlineWidth: outline,
        outlineColor,
        shadowRadius: shadow,
      });
      if (ticket === renderTicket.current) setDisplayUri(next);
    } catch (e) {
      reportError(e, 'editor.effects');
      if (ticket === renderTicket.current) setDisplayUri(cutUri);
    }
  }, [cutUri, outline, outlineColor, shadow]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleEmoji = (e: string) => {
    haptics.select();
    setEmojis(prev =>
      prev.includes(e) ? prev.filter(x => x !== e) : prev.length < MAX_EMOJIS ? [...prev, e] : prev,
    );
  };

  const transform = async (opts: {rotate?: number; flipH?: boolean}) => {
    if (!cutUri || busy) return;
    haptics.tap();
    setBusy(true);
    try {
      const next = await Stickers.transformSticker(cutUri, opts);
      ops.current = [...ops.current, opts];
      setCutUri(next);
    } catch (e: any) {
      reportError(e, 'editor.transform');
      Alert.alert('Could not change the sticker', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const openCleanup = async () => {
    if (busy) return;
    let original = restorable.current ? sourceUri : cutUri ?? sourceUri;
    if (restorable.current && ops.current.length > 0) {
      setBusy(true);
      try {
        for (const op of ops.current) {
          original = await Stickers.transformSticker(original, op);
        }
      } catch (e) {
        reportError(e, 'editor.cleanupPrep');
        original = cutUri ?? sourceUri;
      } finally {
        setBusy(false);
      }
    }
    navigation.navigate('Cleanup', {cutUri: cutUri ?? sourceUri, originalUri: original});
  };

  const toggleBackground = () => {
    haptics.tap();
    // Either side of the toggle starts from an untouched bitmap again.
    ops.current = [];
    restorable.current = true;
    if (keepingBackground && autoCut.current) {
      setCutUri(autoCut.current);
      setKeepingBackground(false);
    } else {
      setCutUri(sourceUri);
      setKeepingBackground(true);
    }
  };

  const save = async () => {
    const uri = displayUri ?? cutUri;
    if (!uri) return;

    if ((await remainingExports()) <= 0) {
      haptics.warn();
      Alert.alert(
        'Free exports used up',
        'Watch a short ad for one more, or unlock unlimited exports in Settings.',
        [
          {text: 'Not now', style: 'cancel'},
          {text: 'Unlock', onPress: () => navigation.navigate('Settings')},
          {
            text: 'Watch an ad',
            onPress: async () => {
              const ok = await watchAdForOneExport();
              if (ok) {
                save();
              } else {
                Alert.alert('No ad available', 'Try again in a moment, or unlock unlimited exports in Settings.');
              }
            },
          },
        ],
      );
      return;
    }

    setSaving(true);
    try {
      const tags = emojis.length ? emojis : [DEFAULT_EMOJI];
      const stickerId = `s_${Date.now()}`;
      const saved = await Stickers.saveSticker(packId, stickerId, uri);
      const all = await loadPacks();
      const current = all.find(p => p.identifier === packId);
      const isFirst = (current?.stickers.length ?? 0) === 0;
      const next = all.map(p =>
        p.identifier === packId
          ? bumpVersion({
              ...p,
              stickers: [
                ...p.stickers,
                {
                  id: stickerId,
                  fileName: saved.fileName,
                  localPath: saved.path,
                  emojis: tags,
                  accessibilityText: `Sticker ${tags.join(' ')}`,
                  bytes: saved.bytes,
                  animated: false,
                },
              ],
            })
          : p,
      );
      // The first sticker in a pack doubles as its tray icon.
      if (isFirst) {
        await Stickers.saveTrayIcon(packId, uri);
      }
      await savePacks(next);
      await spendExport();
      haptics.success();
      navigation.goBack();
    } catch (e: any) {
      reportError(e, 'editor.save');
      haptics.warn();
      Alert.alert('Sticker not saved', e?.message ?? 'Encoding failed.');
    } finally {
      setSaving(false);
    }
  };

  const subtitle = working
    ? 'Finding the subject'
    : issue ?? 'Adjust the edge, then tag it with emojis';

  return (
    <Screen title="Cut out" subtitle={subtitle}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Checkerboard size={14} style={styles.canvas}>
          {displayUri ? (
            <FadeIn offset={10} duration={240} style={styles.previewWrap}>
              <Image source={{uri: displayUri}} style={styles.preview} />
            </FadeIn>
          ) : null}
          {working || busy ? (
            <View style={styles.spinner} pointerEvents="none">
              <ActivityIndicator color={theme.color.marker} size="large" />
            </View>
          ) : null}
        </Checkerboard>

        <View style={styles.toolRow}>
          <Tool label="Rotate" onPress={() => transform({rotate: 90})} />
          <Tool label="Flip" onPress={() => transform({flipH: true})} />
          <Tool label="Clean up" onPress={openCleanup} />
          <Tool
            label="Add text"
            onPress={() =>
              navigation.navigate('TextLayer', {sourceUri: displayUri ?? cutUri ?? sourceUri})
            }
          />
          <Tool
            label={keepingBackground ? 'Cut out' : 'Original'}
            on={keepingBackground}
            onPress={toggleBackground}
          />
        </View>

        <Text style={styles.label}>Sticker border</Text>
        <View style={styles.row}>
          {OUTLINE_STEPS.map(v => (
            <Chip
              key={v}
              label={OUTLINE_LABELS[v]}
              on={outline === v}
              onPress={() => {
                haptics.select();
                setOutline(v);
              }}
            />
          ))}
        </View>

        {outline > 0 ? (
          <View style={styles.row}>
            {OUTLINE_COLORS.map(c => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Border colour ${c}`}
                onPress={() => {
                  haptics.select();
                  setOutlineColor(c);
                }}
                style={[styles.swatch, {backgroundColor: c}, outlineColor === c && styles.swatchOn]}
              />
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Drop shadow</Text>
        <View style={styles.row}>
          {SHADOWS.map(s => (
            <Chip
              key={s.value}
              label={s.label}
              on={shadow === s.value}
              onPress={() => {
                haptics.select();
                setShadow(s.value);
              }}
            />
          ))}
        </View>

        <Text style={styles.label}>
          Emoji tags ({emojis.length} of {MAX_EMOJIS})
        </Text>
        <View style={styles.wrapRow}>
          {EMOJI_CHOICES.map(e => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`Tag ${e}`}
              onPress={() => toggleEmoji(e)}
              style={[styles.emoji, emojis.includes(e) && styles.emojiOn]}>
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Save sticker" variant="marker" busy={saving || working} onPress={save} />
      </View>
    </Screen>
  );
}

function Chip({label, on, onPress}: {label: string; on?: boolean; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

function Tool({label, on, onPress}: {label: string; on?: boolean; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.tool, on && styles.toolOn, pressed && styles.toolPressed]}>
      <Text style={[styles.toolLabel, on && styles.toolLabelOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {padding: theme.space(5), paddingBottom: theme.space(3), gap: theme.space(2)},
  canvas: {height: 300, alignItems: 'center', justifyContent: 'center'},
  previewWrap: {width: '100%', height: '100%'},
  preview: {width: '100%', height: '100%', resizeMode: 'contain'},
  spinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,17,25,0.35)',
  },
  toolRow: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginTop: theme.space(2)},
  tool: {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2.5),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.hairline,
  },
  toolOn: {backgroundColor: theme.color.raised, borderColor: theme.color.marker},
  toolPressed: {opacity: 0.7},
  toolLabel: {...theme.type.label, color: theme.color.text},
  toolLabelOn: {color: theme.color.marker},
  label: {...theme.type.label, color: theme.color.textMuted, marginTop: theme.space(4)},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), alignItems: 'center'},
  wrapRow: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2)},
  chip: {
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.pill,
  },
  chipOn: {backgroundColor: theme.color.marker},
  chipLabel: {...theme.type.label, color: theme.color.text},
  chipLabelOn: {color: theme.color.markerInk},
  swatch: {width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: theme.color.hairline},
  swatchOn: {borderColor: theme.color.highlight, borderWidth: 3},
  emoji: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOn: {backgroundColor: theme.color.marker},
  emojiText: {fontSize: 21},
  footer: {
    padding: theme.space(5),
    paddingTop: theme.space(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.hairline,
    backgroundColor: theme.color.board,
  },
});
