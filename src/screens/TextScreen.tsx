import React, {useState} from 'react';
import {View, Text, Image, TextInput, StyleSheet, Alert, Pressable, ScrollView} from 'react-native';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {Checkerboard} from '../components/Checkerboard';
import {Stickers} from '../native';
import {theme} from '../theme';
import {returnToEditor} from '../lib/handoff';

const COLORS = ['#FFFFFF', '#141119', '#FF3D87', '#FFC94D'];
const POSITIONS = [
  {label: 'Top', y: 0.18},
  {label: 'Middle', y: 0.52},
  {label: 'Bottom', y: 0.86},
];

export function TextScreen({route, navigation}: any) {
  const {sourceUri} = route.params;

  const [text, setText] = useState('');
  const [preview, setPreview] = useState<string>(sourceUri);
  const [color, setColor] = useState('#FFFFFF');
  const [outlineColor, setOutlineColor] = useState('#141119');
  const [y, setY] = useState(0.86);
  const [size, setSize] = useState(0.16);
  const [busy, setBusy] = useState(false);

  const render = async () => {
    if (!text.trim()) {
      setPreview(sourceUri);
      return sourceUri;
    }
    setBusy(true);
    try {
      const next = await Stickers.addText(sourceUri, {
        text: text.trim(),
        x: 0.5,
        y,
        size,
        color,
        outlineColor,
        bold: true,
      });
      setPreview(next);
      return next;
    } catch (e: any) {
      Alert.alert('Text not added', e?.message ?? 'Rendering failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Add text" subtitle="Burned into the sticker so it survives export">
      <Checkerboard size={12} style={styles.canvas}>
        <Image source={{uri: preview}} style={styles.preview} />
      </Checkerboard>

      <ScrollView contentContainerStyle={styles.controls}>
        <TextInput
          value={text}
          onChangeText={setText}
          onEndEditing={render}
          placeholder="Type a caption"
          placeholderTextColor={theme.color.textMuted}
          style={styles.input}
          maxLength={80}
        />

        <Text style={styles.label}>Position</Text>
        <View style={styles.row}>
          {POSITIONS.map(p => (
            <Text key={p.label} onPress={() => setY(p.y)} style={[styles.chip, y === p.y && styles.chipOn]}>
              {p.label}
            </Text>
          ))}
        </View>

        <Text style={styles.label}>Size</Text>
        <View style={styles.row}>
          {[0.11, 0.16, 0.22].map((s, i) => (
            <Text key={s} onPress={() => setSize(s)} style={[styles.chip, size === s && styles.chipOn]}>
              {['Small', 'Medium', 'Large'][i]}
            </Text>
          ))}
        </View>

        <Text style={styles.label}>Text colour</Text>
        <View style={styles.row}>
          {COLORS.map(c => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[styles.swatch, {backgroundColor: c}, color === c && styles.swatchOn]}
            />
          ))}
        </View>

        <Text style={styles.label}>Outline colour</Text>
        <View style={styles.row}>
          {COLORS.map(c => (
            <Pressable
              key={c}
              onPress={() => setOutlineColor(c)}
              style={[styles.swatch, {backgroundColor: c}, outlineColor === c && styles.swatchOn]}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Preview" variant="ghost" busy={busy} onPress={render} />
        <Button
          label="Done"
          variant="marker"
          onPress={async () => {
            const final = await render();
            returnToEditor(navigation, {edited: final ?? preview, bakedText: true});
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  canvas: {height: 230, margin: theme.space(5), alignItems: 'center', justifyContent: 'center'},
  preview: {width: '100%', height: '100%', resizeMode: 'contain'},
  controls: {paddingHorizontal: theme.space(5), gap: theme.space(2), paddingBottom: theme.space(4)},
  input: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    color: theme.color.text,
    ...theme.type.body,
  },
  label: {...theme.type.label, color: theme.color.textMuted, marginTop: theme.space(3)},
  row: {flexDirection: 'row', gap: theme.space(2), alignItems: 'center'},
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
  swatch: {width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: theme.color.hairline},
  swatchOn: {borderColor: theme.color.highlight, borderWidth: 3},
  actions: {padding: theme.space(5), gap: theme.space(2)},
});
