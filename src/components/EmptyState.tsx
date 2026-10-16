import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {theme} from '../theme';
import {Button} from './Button';

/** An empty screen is an invitation to act, so it always carries the action. */
export function EmptyState({headline, action, onAction}: {
  headline: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>{headline}</Text>
      <Button label={action} variant="marker" onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space(8), gap: theme.space(5)},
  headline: {...theme.type.title, color: theme.color.textMuted, textAlign: 'center'},
});
