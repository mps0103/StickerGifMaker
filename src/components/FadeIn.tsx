import React, {useEffect, useRef} from 'react';
import {Animated, Easing, ViewStyle} from 'react-native';

/**
 * Entrance animation for anything that appears as a list or a result: a short rise
 * with a fade. Driven natively, so it costs nothing on the JS thread while the
 * segmenter or the encoder is busy.
 */
export function FadeIn({
  delay = 0,
  offset = 14,
  duration = 260,
  style,
  children,
}: {
  delay?: number;
  offset?: number;
  duration?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [t, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [
            {translateY: t.interpolate({inputRange: [0, 1], outputRange: [offset, 0]})},
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}
