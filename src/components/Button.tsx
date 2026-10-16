import React from 'react';
import {Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle} from 'react-native';
import {theme} from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'marker' | 'quiet' | 'ghost';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({label, onPress, variant = 'quiet', busy, disabled, style}: Props) {
  const isMarker = variant === 'marker';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || busy}
      style={({pressed}) => [
        styles.base,
        isMarker && styles.marker,
        variant === 'ghost' && styles.ghost,
        (disabled || busy) && styles.off,
        pressed && styles.pressed,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={isMarker ? theme.color.markerInk : theme.color.text} />
      ) : (
        <Text style={[styles.label, isMarker && styles.markerLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: theme.space(6),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {backgroundColor: theme.color.marker},
  ghost: {backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.color.hairline},
  off: {opacity: 0.45},
  pressed: {transform: [{scale: 0.97}]},
  label: {...theme.type.label, color: theme.color.text},
  markerLabel: {color: theme.color.markerInk},
});
