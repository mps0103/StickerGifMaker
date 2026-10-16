import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {theme} from '../theme';

const FILL = {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0} as const;

/**
 * The bottom sheet is the standard Android answer to "a few actions for this
 * thing": it keeps the thumb near the bottom of the screen and makes every action
 * visible, unlike the long-press it replaces.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 160,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, t]);

  const height = Dimensions.get('window').height;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Animated.View style={[styles.scrim, {opacity: t}]}>
        <Pressable style={FILL} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + theme.space(4),
            transform: [
              {translateY: t.interpolate({inputRange: [0, 1], outputRange: [height * 0.4, 0]})},
            ],
          },
        ]}>
        <View style={styles.grabber} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </Animated.View>
    </Modal>
  );
}

export function SheetAction({
  label,
  hint,
  onPress,
  danger,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.action, pressed && styles.actionPressed]}>
      <Text style={[styles.actionLabel, danger && styles.danger]}>{label}</Text>
      {hint ? <Text style={styles.actionHint}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {...FILL, backgroundColor: 'rgba(0,0,0,0.6)'},
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: theme.radius.lg + 6,
    borderTopRightRadius: theme.radius.lg + 6,
    paddingHorizontal: theme.space(5),
    paddingTop: theme.space(2),
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.hairline,
    marginBottom: theme.space(3),
  },
  title: {...theme.type.title, color: theme.color.text, marginBottom: theme.space(2)},
  action: {paddingVertical: theme.space(3.5), borderRadius: theme.radius.md},
  actionPressed: {backgroundColor: theme.color.raised},
  actionLabel: {...theme.type.title, fontSize: 16, color: theme.color.text},
  actionHint: {...theme.type.meta, color: theme.color.textMuted, marginTop: 2},
  danger: {color: theme.color.danger},
});
