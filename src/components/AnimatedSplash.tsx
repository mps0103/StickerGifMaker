import React, {useCallback, useEffect, useRef} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {theme} from '../theme';

/**
 * The launch animation, built around the name: a die-cut line marches round the
 * sticker, the sticker lifts out of the page, and "Die" and "Cut" slide in from
 * either side and meet.
 *
 * Frame zero is the same two-sticker mark, at the same size and position, as the
 * system splash that precedes it (res/drawable/splash_logo.png), so the hand-off
 * from the OS splash is seamless rather than a flash of an empty screen.
 *
 * Tapping skips it, and with "remove animations" on in Android's settings it shows
 * the finished lockup for a moment instead of playing the sequence.
 */

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const TOTAL_MS = 1600;
const FADE_MS = 220;

// Mark geometry, in dp. Copied from tools/gen-icons.js so the pieces match the icon:
// the front sticker is the unit, everything else is a fraction of it.
const BOX = 220;
const U = 86.4;
const FRONT = {size: U, cx: BOX / 2 - 0.09 * U, cy: BOX / 2 + 0.09 * U, deg: -12.6, border: 0.085 * U};
const BACK = {
  size: 0.86 * U,
  cx: BOX / 2 + 0.17 * U,
  cy: BOX / 2 - 0.15 * U,
  deg: 17.2,
  border: 0.075 * U,
};
const CUT_PAD = 14; // room around the front sticker for the dashed cut line

type Layer = {size: number; border: number};

function StickerArt({
  size,
  border,
  top,
  bottom,
  id,
}: Layer & {top: string; bottom: string; id: string}) {
  const radius = size * 0.26;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      <Rect width={size} height={size} rx={radius} fill="#FFFFFF" />
      <Rect
        x={border}
        y={border}
        width={size - border * 2}
        height={size - border * 2}
        rx={Math.max(0, radius - border)}
        fill={`url(#${id})`}
      />
    </Svg>
  );
}

export function AnimatedSplash({onDone}: {onDone: () => void}) {
  const {width, height} = useWindowDimensions();
  const p = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    p.stopAnimation();
    Animated.timing(fade, {toValue: 0, duration: FADE_MS, useNativeDriver: true}).start(() => onDone());
  }, [fade, p, onDone]);

  useEffect(() => {
    let alive = true;
    let hold: ReturnType<typeof setTimeout> | undefined;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduce => {
        if (!alive) return;
        if (reduce) {
          p.setValue(1);
          hold = setTimeout(finish, 650);
          return;
        }
        Animated.timing(p, {
          toValue: 1,
          duration: TOTAL_MS,
          easing: Easing.linear,
          useNativeDriver: false, // SVG props animate on the JS driver
        }).start(({finished: done}) => {
          if (done && alive) hold = setTimeout(finish, 180);
        });
      });

    return () => {
      alive = false;
      if (hold) clearTimeout(hold);
    };
  }, [p, finish]);

  /** One segment of the timeline, eased. Times are fractions of TOTAL_MS. */
  const seg = (a: number, b: number, from: number, to: number, easing = Easing.out(Easing.cubic)) =>
    p.interpolate({inputRange: [a, b], outputRange: [from, to], easing, extrapolate: 'clamp'});

  // The dashed cut line fades in, marches round the sticker, then fades away.
  const cutOpacity = p.interpolate({
    inputRange: [0.02, 0.12, 0.5, 0.62],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const cutDash = seg(0.04, 0.6, 0, -150, Easing.linear);

  // The front sticker lifts as it is cut, then settles.
  const peak = [0.1, 0.3, 0.55];
  const lift = {
    scale: p.interpolate({inputRange: peak, outputRange: [1, 1.12, 1], extrapolate: 'clamp'}),
    translateY: p.interpolate({inputRange: peak, outputRange: [0, -9, 0], extrapolate: 'clamp'}),
    rotate: p.interpolate({
      inputRange: peak,
      outputRange: [`${FRONT.deg}deg`, `${FRONT.deg + 7}deg`, `${FRONT.deg}deg`],
      extrapolate: 'clamp',
    }),
  };
  const shadowOpacity = p.interpolate({inputRange: peak, outputRange: [0, 0.42, 0], extrapolate: 'clamp'});
  const shadowScale = p.interpolate({inputRange: peak, outputRange: [0.6, 1, 0.6], extrapolate: 'clamp'});

  const backRotate = p.interpolate({
    inputRange: [0.2, 0.5],
    outputRange: [`${BACK.deg}deg`, `${BACK.deg + 4}deg`],
    easing: Easing.out(Easing.cubic),
    extrapolate: 'clamp',
  });

  // The whole mark rises and shrinks to make room for the name.
  const lead = Easing.inOut(Easing.cubic);
  const markY = seg(0.46, 0.72, 0, -50, lead);
  const markScale = seg(0.46, 0.72, 1, 0.86, lead);

  // "Die" and "Cut" slide in from opposite sides and meet.
  const dieX = seg(0.5, 0.72, -30, 0);
  const cutX = seg(0.5, 0.72, 30, 0);
  const nameOpacity = seg(0.5, 0.68, 0, 1, Easing.linear);
  const tagOpacity = seg(0.7, 0.88, 0, 1, Easing.linear);
  const tagY = seg(0.7, 0.88, 10, 0);

  const centreY = height / 2 - 10;
  const g = FRONT.size + CUT_PAD * 2;

  return (
    <Animated.View style={[styles.root, {opacity: fade}]} pointerEvents="auto">
      <Pressable
        style={styles.fill}
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel="DieCut. Tap to skip the intro"
        accessibilityHint="Opens the app">
        <Animated.View
          style={[
            styles.mark,
            {
              left: width / 2 - BOX / 2,
              top: centreY - BOX / 2,
              transform: [{translateY: markY}, {scale: markScale}],
            },
          ]}>
          <Animated.View
            style={{
              position: 'absolute',
              left: BACK.cx - BACK.size / 2,
              top: BACK.cy - BACK.size / 2,
              transform: [{rotate: backRotate}],
            }}>
            <StickerArt size={BACK.size} border={BACK.border} top="#FFC94D" bottom="#FFA82B" id="back" />
          </Animated.View>

          {/* Soft shadow that appears while the front sticker is lifted. */}
          <Animated.View
            style={[
              styles.shadow,
              {
                left: FRONT.cx - 32,
                top: FRONT.cy + FRONT.size / 2 + 4,
                opacity: shadowOpacity,
                transform: [{scaleX: shadowScale}],
              },
            ]}
          />

          <Animated.View
            style={{
              position: 'absolute',
              left: FRONT.cx - g / 2,
              top: FRONT.cy - g / 2,
              width: g,
              height: g,
              transform: [{translateY: lift.translateY}, {scale: lift.scale}, {rotate: lift.rotate}],
            }}>
            <View style={{position: 'absolute', left: CUT_PAD, top: CUT_PAD}}>
              <StickerArt
                size={FRONT.size}
                border={FRONT.border}
                top="#FF77AC"
                bottom="#FF3D87"
                id="front"
              />
            </View>
            <Svg width={g} height={g} viewBox={`0 0 ${g} ${g}`} style={StyleSheet.absoluteFill}>
              <AnimatedRect
                x={3}
                y={3}
                width={g - 6}
                height={g - 6}
                rx={FRONT.size * 0.26 + CUT_PAD - 3}
                fill="none"
                stroke="#F2EEF7"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeDasharray="10 8"
                strokeDashoffset={cutDash as any}
                opacity={cutOpacity as any}
              />
            </Svg>
          </Animated.View>
        </Animated.View>

        <View style={[styles.lockup, {top: height / 2 + 24}]} pointerEvents="none">
          <View style={styles.nameRow}>
            <Animated.Text style={[styles.name, {opacity: nameOpacity, transform: [{translateX: dieX}]}]}>
              Die
            </Animated.Text>
            <Animated.Text
              style={[styles.name, styles.nameAccent, {opacity: nameOpacity, transform: [{translateX: cutX}]}]}>
              Cut
            </Animated.Text>
          </View>
          <Animated.Text style={[styles.tag, {opacity: tagOpacity, transform: [{translateY: tagY}]}]}>
            Sticker Maker &amp; GIF
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.board,
    zIndex: 100,
    elevation: 100,
  },
  fill: {flex: 1},
  mark: {position: 'absolute', width: BOX, height: BOX},
  shadow: {
    position: 'absolute',
    width: 64,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#000000',
  },
  lockup: {position: 'absolute', left: 0, right: 0, alignItems: 'center'},
  nameRow: {flexDirection: 'row', alignItems: 'center'},
  name: {
    color: theme.color.text,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1.4,
  },
  nameAccent: {color: theme.color.marker},
  tag: {
    marginTop: 6,
    color: theme.color.textMuted,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
});
