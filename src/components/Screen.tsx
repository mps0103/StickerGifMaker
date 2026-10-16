import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {theme} from '../theme';

export function Screen({title, subtitle, children, footer, headerRight}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** A single action at the top right, such as a settings button. */
  headerRight?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {headerRight}
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: theme.color.board},
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: theme.space(5),
    paddingTop: theme.space(4),
    paddingBottom: theme.space(3),
    gap: theme.space(3),
  },
  headerText: {flex: 1},
  title: {...theme.type.display, color: theme.color.text},
  subtitle: {...theme.type.body, color: theme.color.textMuted, marginTop: theme.space(1)},
  body: {flex: 1},
});
