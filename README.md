# DieCut: Sticker Maker & GIF

Offline Android app. Cut the background out of a photo, give it a die-cut border,
build a WhatsApp sticker pack, and turn videos or photos into GIFs.
No server, no account, no upload.

Package: `com.mps.stickergif` (the debug variant is `com.mps.stickergif.debug`)

The launcher label is **DieCut**. The Play listing title is **DieCut: Sticker Maker & GIF**
(27 characters, under Play's 30 limit); a label that long would be truncated under the
icon, so the two are deliberately different. Listing copy is in [`store/listing.md`](store/listing.md).

## Toolchain

| Piece | Version | Why |
|---|---|---|
| React Native | 0.87.1 | New Architecture only |
| React | 19.2.8 | RN 0.87 requires `^19.2.3` |
| compileSdk / targetSdk | 36 (Android 16) | Google Play requires API 36 for new apps and updates from 31 Aug 2026 |
| minSdk | 24 | Covers ~99% of active devices |
| Android Gradle Plugin | 9.2.1 | The version RN 0.87's Gradle plugin is built against |
| Gradle | 9.4.1 | Minimum for AGP 9.2 |
| Kotlin | 2.2.0 | RN 0.87 toolchain |
| Java | 17 | |
| `react-native-google-mobile-ads` | 16.5.0 | 15.x does not compile against RN 0.87 (`currentActivity`) |

`android/gradle.properties` sets `android.newDsl=false` and `android.builtInKotlin=false`.
AGP 9 defaults to a DSL the Kotlin Android plugin cannot apply against, and every
autolinked React Native library still applies that plugin. Revisit when they migrate.

## Setup

Prerequisites: Node 20.19.4+, JDK 17, Android SDK Platform 36, Build-Tools 36.0.0,
NDK 27.1.12297006, CMake 3.22.1. Install the NDK and CMake from Android Studio's SDK
Manager under SDK Tools; the native animated-WebP encoder will not configure without them.

The first build runs CMake `FetchContent`, which clones libwebp from GitHub. That one
step needs network; every later build is offline and cached.

```
npm install
cd android
./gradlew assembleDebug      # android/app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # R8-minified, android/app/build/outputs/apk/release/
./gradlew bundleRelease      # AAB for Play
```

The debug APK is **standalone**: `debuggableVariants = []` in `android/app/build.gradle`
packages the JS bundle into it, so it runs with no Metro attached. For Fast Refresh, run
`npx react-native start` and `adb reverse tcp:8081 tcp:8081`; the app uses the dev server
when it is reachable and the packaged bundle when it is not.

`npm run tsc` typechecks the project and should stay clean.

## Layout

```
src/                  React Native app (screens, components, storage, lib)
android/app/          Native modules (Kotlin), content provider, CMake for the WebP encoder
docs/                 Published pages: landing, privacy policy, terms of use
store/                Play Store assets and listing copy
tools/gen-icons.js    Generates every launcher icon, the splash mark and the Play icon
```

Regenerate the artwork with
`node tools/gen-icons.js android/app/src/main/res store/play_icon_512.png`.

## Launch sequence

1. The system splash (`androidx.core:core-splashscreen`, `AppTheme.Starting`) shows the
   two-sticker mark. `MainActivity` holds it until React's context is initialised, capped
   at two seconds, so it hands over instead of vanishing at the first frame.
2. `src/components/AnimatedSplash.tsx` starts from the same mark at the same size, then
   plays the die-cut sequence: a dashed cut line marches round the front sticker, it lifts
   out, and "Die" and "Cut" slide in and meet. Tap to skip. With Android's "remove
   animations" on, it shows the finished lockup briefly instead.
3. The first screen is built underneath, so the splash fades onto a ready app.

## Legal pages

`docs/` holds `index.html`, `privacy.html` and `terms.html`, self-contained (no external
fonts or scripts). To publish: repository **Settings, Pages, Deploy from a branch,
`main`, `/docs`**. They are then served at `https://mps0103.github.io/StickerGifMaker/`.

`src/lib/links.ts` is the one place those URLs live. Settings links to them, and the
privacy URL is also written into every sticker pack for WhatsApp. If the pages move,
change `SITE` there and nowhere else.

## Reliability

- `src/lib/safeStorage.ts`: every stored value is parsed and validated. A corrupt value
  is moved aside under `<key>.corrupt` and the app opens with defaults, instead of
  crashing on every launch.
- `src/components/ErrorBoundary.tsx`: a render-time crash shows "Something went wrong" with
  Try again and Send a report, instead of closing the app.
- `src/lib/errors.ts`: swallowed failures are recorded (last 20, on disk) and a global
  handler chains to React Native's. Settings, Send feedback, attaches them to an email draft.
- Cache hygiene: previews older than a day are purged at launch; Settings can clear them.
- A pack's list is saved before it is published to WhatsApp, so a provider failure can never
  lose a pack; the failure is raised loudly at the moment of the WhatsApp handoff.
- `android/app/proguard-rules.pro` keeps Room database constructors. R8's full mode strips
  the one WorkManager creates reflectively and the release build crashed at startup
  ("Failed to create an instance of WorkDatabase"). Always smoke-test a **release** build.

## What runs where

- Background removal: ML Kit Subject Segmentation, on-device, delivered by Google Play
  services. Photos are decoded at up to 2048 px on the long edge before segmenting.
- The cut-out keeps the photo's framing (it is not cropped), so the Clean up screen's
  Restore brush lines up with the original pixel for pixel. Cropping to the subject happens
  in `applyEffects`, which runs for every preview and every saved sticker.
- Die-cut border and drop shadow: `StickerFx.kt`, built from the alpha channel.
- Sticker encoding: Android's WebP encoder, quality stepped down until the file fits WhatsApp's budget.
- WhatsApp handoff: `StickerContentProvider` plus the `ENABLE_STICKER_PACK` intent.
- Share sheet: `ShareIntentModule.kt` reads both the cold-start intent and `onNewIntent`.
  Sharing a sticker out of the app sends its `.webp` through the file provider.
- GIF encode: `com.squareup:gifencoder` (Apache-2.0). GIF decode and seek: `android-gif-drawable` (MIT).
- Video frames: `MediaMetadataRetriever`. No FFmpeg.

## Features

- **Batch creation.** Pick up to 20 photos; each is cut out and saved with the user's default
  border and shadow, with live progress and a Stop button. Every sticker is persisted as it
  finishes, so leaving or running out of free exports loses nothing already done.
- **Die-cut border** in four weights and four colours, with a **drop shadow**.
- **Rotate, flip, caption, and a manual Clean up brush** (erase and restore).
- **Per-sticker actions in a bottom sheet:** edit emoji tags, share, save as PNG, delete.
- **Share-sheet entry:** share any photo from any app and the cut-out is already running.
- **Animated stickers** from any video clip, auto-fitted to WhatsApp's 10-second and 500 KB limits.
- **GIF tools:** video to GIF (presets, boomerang, reverse), photos to GIF, GIF editor.
- **Settings:** publisher name, default border and shadow, haptics, clear temporary files,
  replay the intro, rate, share, send feedback.
- **Rewarded ad for one more export** instead of a hard stop at the free limit; the free
  allowance refills monthly.

## WhatsApp pack rules enforced in code

- Static sticker: 512x512, WebP, 100 KB or less. Tray icon: 96x96, WebP, 50 KB or less.
- Pack: 3 to 30 stickers, at least one and at most three emojis per sticker (an empty tag
  list is published as the default emoji).
- A pack is all-static or all-animated; the UI disables the wrong button.
- `image_data_version` is bumped on every pack change, otherwise WhatsApp serves a cached copy.

## Animated stickers (native)

`src/main/cpp/webp_anim.cpp` wraps libwebp's `WebPAnimEncoder` through JNI. Android ships a
WebP decoder but no animated encoder.

- `android/app/src/main/jni/CMakeLists.txt` is the CMake entry point. It must include React
  Native's `ReactNative-application.cmake` (the `appmodules` library); pointing Gradle at a
  CMake file that does not removes every TurboModule and the app dies at startup with
  "PlatformConstants could not be found". The WebP library is added as a subdirectory.
- libwebp v1.6.0 is pulled by `FetchContent` at configure time. Pin or vendor it to build offline.
- ABIs: armeabi-v7a, arm64-v8a, x86_64. `-Wl,-z,max-page-size=16384` keeps it loadable on
  16 KB page-size devices (Android 15+).
- `saveAnimatedSticker` retries at 12, 9 and 6 fps until the result is under 500 KB.

## Play Billing

`BillingModule.kt`, one non-consumable product `mps_remove_ads`. Ownership is queried from Play
on every Settings visit and before every export, so a refund or a new device resolves with no
local flag to go stale. Create the product in Play Console with exactly this ID before testing,
and add a licence tester account.

## Play Console checklist before upload

1. **AdMob.** Replace the test app ID in `res/values/strings.xml`, and the placeholder banner and
   rewarded unit IDs in `src/ads/BannerAdSlot.tsx` and `src/ads/rewarded.ts`. As shipped, a
   release build earns nothing.
2. **EEA/UK consent.** AdMob requires a consent form (Google's UMP) for users in the EEA and UK.
   It is not implemented. `react-native-google-mobile-ads` exposes `AdsConsent`; configure the
   message in AdMob first.
3. Enable GitHub Pages for `/docs` (see Legal pages) so the privacy URL is live before review.
4. Add `com.mps.stickergif` to `app-ads.txt` on the developer website.
5. Generate the upload keystore and put the four `MPS_UPLOAD_*` values in `~/.gradle/gradle.properties`, never in the repo.
6. Bump `versionCode` and `versionName` in `android/app/build.gradle` once, at the end of a batch of changes.
7. Data safety form: the app collects nothing itself; AdMob collects the advertising ID and
   approximate location. Ads declaration: yes. Target audience 13+, not designed for children.
8. Upload an AAB, not an APK. Test the **release** build on a real device first.
9. Test on Android 16: edge-to-edge is enforced at API 36.
10. Ship no pre-made packs of copyrighted characters.

## Not in this build

- Sticker-on-sticker layering and freehand doodle.
- Curved text and custom fonts.
- Auto-suggested emoji tags from image content.
- Translations.
