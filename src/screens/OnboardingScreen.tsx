import React, {useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {theme} from '../theme';
import {updateSettings} from '../storage/settings';
import {haptics} from '../lib/haptics';

type Page = {key: string; title: string; body: string; Art: React.ComponentType};

const PAGES: Page[] = [
  {
    key: 'cut',
    title: 'Cut out anything',
    body: 'Pick a photo and the subject is lifted out automatically. Touch up the edge by hand if it missed a spot.',
    Art: CutArt,
  },
  {
    key: 'batch',
    title: 'Make a whole pack at once',
    body: 'Choose up to 20 photos and they are all cut out and saved with your favourite border while you watch.',
    Art: BatchArt,
  },
  {
    key: 'send',
    title: 'Send them anywhere',
    body: 'Add the pack to WhatsApp in one tap, or share single stickers to Telegram, Signal and Instagram.',
    Art: SendArt,
  },
];

export function OnboardingScreen({navigation, route}: any) {
  const {width} = useWindowDimensions();
  const replay = !!route.params?.replay;
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Page>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const last = index === PAGES.length - 1;

  const finish = async () => {
    haptics.success();
    if (replay) {
      navigation.goBack();
      return;
    }
    await updateSettings({onboarded: true});
    navigation.replace('Home');
  };

  const next = () => {
    haptics.tap();
    if (last) {
      finish();
    } else {
      list.current?.scrollToIndex({index: index + 1, animated: true});
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.top}>
        {last ? null : (
          <Pressable accessibilityRole="button" hitSlop={12} onPress={finish}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>

      <Animated.FlatList
        ref={list as any}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={p => p.key}
        onScroll={Animated.event([{nativeEvent: {contentOffset: {x: scrollX}}}], {
          useNativeDriver: false,
        })}
        onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, i) => ({length: width, offset: width * i, index: i})}
        renderItem={({item}) => (
          <View style={[styles.page, {width}]}>
            <View style={styles.art}>
              <item.Art />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {PAGES.map((p, i) => {
            const w = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [8, 26, 8],
              extrapolate: 'clamp',
            });
            const o = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });
            return <Animated.View key={p.key} style={[styles.dot, {width: w, opacity: o}]} />;
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={next}
          style={({pressed}) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text style={styles.ctaText}>{last ? (replay ? 'Done' : 'Get started') : 'Next'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CutArt() {
  return (
    <Svg width={230} height={230} viewBox="0 0 230 230">
      <Rect x={14} y={30} width={150} height={120} rx={16} fill="#282235" />
      <Path d="M14 130l44-46 34 34 26-22 46 40v14a16 16 0 0 1-16 16H30a16 16 0 0 1-16-16z" fill="#3A3346" />
      <Circle cx={128} cy={64} r={13} fill="#FFC94D" />
      <Circle cx={92} cy={90} r={30} fill="none" stroke="#FF3D87" strokeWidth={3} strokeDasharray="7 6" />
      <Path
        d="M150 118h46a14 14 0 0 1 14 14v46a14 14 0 0 1-14 14h-46a14 14 0 0 1-14-14v-46a14 14 0 0 1 14-14z"
        fill="#FF3D87"
        stroke="#FFFFFF"
        strokeWidth={5}
        transform="rotate(-9 173 155)"
      />
      <Circle cx={163} cy={150} r={5} fill="#12060B" />
      <Circle cx={184} cy={150} r={5} fill="#12060B" />
      <Path d="M161 166q12 11 24 0" stroke="#12060B" strokeWidth={4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function BatchArt() {
  const colors = ['#FF3D87', '#FFC94D', '#7DDCA0', '#8EA2FF', '#FF8A5C', '#C28BFF'];
  return (
    <Svg width={230} height={230} viewBox="0 0 230 230">
      {colors.map((c, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 18 + col * 70;
        const y = 50 + row * 78;
        const tilt = (i % 2 === 0 ? -1 : 1) * (5 + i);
        return (
          <React.Fragment key={c}>
            <Rect
              x={x}
              y={y}
              width={58}
              height={58}
              rx={14}
              fill={c}
              stroke="#FFFFFF"
              strokeWidth={4}
              transform={`rotate(${tilt} ${x + 29} ${y + 29})`}
            />
            <Circle cx={x + 21} cy={y + 26} r={3.5} fill="#12060B" />
            <Circle cx={x + 37} cy={y + 26} r={3.5} fill="#12060B" />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function SendArt() {
  return (
    <Svg width={230} height={230} viewBox="0 0 230 230">
      <Rect x={22} y={44} width={186} height={136} rx={26} fill="#282235" />
      <Path d="M62 180l-12 30 38-30z" fill="#282235" />
      <Rect
        x={88}
        y={62}
        width={76}
        height={76}
        rx={18}
        fill="#FFC94D"
        stroke="#FFFFFF"
        strokeWidth={5}
        transform="rotate(8 126 100)"
      />
      <Circle cx={112} cy={96} r={5} fill="#12060B" />
      <Circle cx={138} cy={96} r={5} fill="#12060B" />
      <Path d="M108 116q17 15 34 0" stroke="#12060B" strokeWidth={4.5} strokeLinecap="round" fill="none" />
      <Circle cx={190} cy={52} r={22} fill="#7DDCA0" />
      <Path d="M180 52l8 8 14-16" stroke="#12060B" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: theme.color.board},
  top: {height: 48, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: theme.space(5)},
  skip: {...theme.type.label, fontSize: 15, color: theme.color.textMuted},
  page: {alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.space(8), gap: theme.space(3)},
  art: {marginBottom: theme.space(4)},
  title: {...theme.type.display, color: theme.color.text, textAlign: 'center'},
  body: {...theme.type.body, fontSize: 16, color: theme.color.textMuted, textAlign: 'center', lineHeight: 23},
  bottom: {paddingHorizontal: theme.space(5), paddingBottom: theme.space(5), gap: theme.space(5)},
  dots: {flexDirection: 'row', justifyContent: 'center', gap: 6},
  dot: {height: 8, borderRadius: 4, backgroundColor: theme.color.marker},
  cta: {
    backgroundColor: theme.color.marker,
    borderRadius: theme.radius.pill,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {transform: [{scale: 0.98}]},
  ctaText: {...theme.type.title, fontSize: 16, color: theme.color.markerInk},
});
