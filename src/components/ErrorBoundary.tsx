import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {theme} from '../theme';
import {reportError} from '../lib/errors';
import {sendFeedback} from '../lib/diagnostics';

type State = {error: Error | null};

/**
 * Last line of defence for render-time crashes. Without it a thrown error in any
 * screen unmounts the whole tree and the user is dumped to the launcher, which
 * Play counts as a crash. This keeps the app alive and offers a way back.
 *
 * It deliberately leans on nothing but core components: if the theme, navigation
 * or a native bridge is what broke, the fallback must still be able to draw itself.
 */
export class ErrorBoundary extends React.Component<{children: React.ReactNode}, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const frame = (info.componentStack ?? '').split('\n')[1]?.trim() ?? '';
    reportError(error, `render:${frame}`);
  }

  private reset = () => this.setState({error: null});

  private report = () => {
    sendFeedback('DieCut problem report', 'What were you doing when this happened?').catch(
      () => {},
    );
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.emoji}>🫠</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Your stickers are safe. Try again, and if it keeps happening, send us a report.
        </Text>
        <Pressable accessibilityRole="button" onPress={this.reset} style={styles.primary}>
          <Text style={styles.primaryLabel}>Try again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={this.report} style={styles.secondary}>
          <Text style={styles.secondaryLabel}>Send a report</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: theme.color.board,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emoji: {fontSize: 56},
  title: {color: theme.color.text, fontSize: 22, fontWeight: '800'},
  body: {color: theme.color.textMuted, fontSize: 15, textAlign: 'center', marginBottom: 12},
  primary: {
    backgroundColor: theme.color.marker,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  primaryLabel: {color: theme.color.markerInk, fontSize: 15, fontWeight: '700'},
  secondary: {paddingVertical: 12, paddingHorizontal: 24},
  secondaryLabel: {color: theme.color.textMuted, fontSize: 14, fontWeight: '600'},
});
