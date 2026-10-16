import React, {useEffect, useState} from 'react';
import {StatusBar, View} from 'react-native';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import mobileAds from 'react-native-google-mobile-ads';

import {HomeScreen} from './screens/HomeScreen';
import {OnboardingScreen} from './screens/OnboardingScreen';
import {PackListScreen} from './screens/PackListScreen';
import {PackEditorScreen} from './screens/PackEditorScreen';
import {StickerEditorScreen} from './screens/StickerEditorScreen';
import {BulkAddScreen} from './screens/BulkAddScreen';
import {CleanupScreen} from './screens/CleanupScreen';
import {TextScreen} from './screens/TextScreen';
import {AnimatedStickerScreen} from './screens/AnimatedStickerScreen';
import {GifMakerScreen} from './screens/GifMakerScreen';
import {ImagesToGifScreen} from './screens/ImagesToGifScreen';
import {GifEditorScreen} from './screens/GifEditorScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {ErrorBoundary} from './components/ErrorBoundary';
import {AnimatedSplash} from './components/AnimatedSplash';
import {loadSettings} from './storage/settings';
import {installGlobalErrorHandler, reportError} from './lib/errors';
import {Stickers} from './native';
import {theme} from './theme';

installGlobalErrorHandler();

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {...DarkTheme.colors, background: theme.color.board, card: theme.color.board, text: theme.color.text},
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default function App() {
  const [initialRoute, setInitialRoute] = useState<'Home' | 'Onboarding' | null>(null);
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    // Settings decide whether the intro shows. If they cannot be read the app still
    // opens, just on Home, rather than hanging on a blank screen.
    loadSettings()
      .then(s => setInitialRoute(s.onboarded ? 'Home' : 'Onboarding'))
      .catch(e => {
        reportError(e, 'app.settings');
        setInitialRoute('Home');
      });

    // Initialised after mount so the first screen is never blocked by the ad SDK.
    mobileAds()
      .initialize()
      .catch(e => reportError(e, 'app.ads'));

    // Previews and intermediates pile up in the cache; anything a day old is dead.
    Stickers.purgeCache(DAY_MS).catch(e => reportError(e, 'app.purge'));
  }, []);

  // The splash sits on top of the app rather than in front of it, so the first
  // screen is already built and settled underneath by the time it fades away.
  return (
    <View style={{flex: 1, backgroundColor: theme.color.board}}>
      {initialRoute ? (
        <ErrorBoundary>
          <SafeAreaProvider>
            {/* backgroundColor/translucent were removed in RN 0.87: the activity calls
                enableEdgeToEdge() and AppTheme already paints the bars transparent. */}
            <StatusBar barStyle="light-content" />
            <NavigationContainer theme={navTheme}>
              <Stack.Navigator
                initialRouteName={initialRoute}
                screenOptions={{
                  headerShown: false,
                  contentStyle: {backgroundColor: theme.color.board},
                  animation: 'slide_from_right',
                  animationDuration: 220,
                }}>
                <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{animation: 'fade'}} />
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Packs" component={PackListScreen} />
                <Stack.Screen name="PackEditor" component={PackEditorScreen} />
                <Stack.Screen name="StickerEditor" component={StickerEditorScreen} />
                <Stack.Screen name="BulkAdd" component={BulkAddScreen} />
                <Stack.Screen name="Cleanup" component={CleanupScreen} />
                <Stack.Screen name="TextLayer" component={TextScreen} />
                <Stack.Screen name="AnimatedSticker" component={AnimatedStickerScreen} />
                <Stack.Screen name="GifMaker" component={GifMakerScreen} />
                <Stack.Screen name="ImagesToGif" component={ImagesToGifScreen} />
                <Stack.Screen name="GifEditor" component={GifEditorScreen} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          </SafeAreaProvider>
        </ErrorBoundary>
      ) : null}
      {splash ? <AnimatedSplash onDone={() => setSplash(false)} /> : null}
    </View>
  );
}
