# Biomatic Demo App

Biomatic Demo App is an Expo / React Native sample for creating local user profiles and matching them with live face or voice samples. Face and speaker processing run on-device; profile details and derived biometric templates are stored in an SQLCipher-encrypted SQLite database.

> **Demo only:** This project is not certified for identity proofing, authentication, or access control. Face and speaker recognition can produce false matches or rejections. Do not use it to protect sensitive resources or make consequential decisions.

## Features

- Onboarding, local profile creation, search, profile lookup, and profile deletion.
- Optional profile picture and basic contact details.
- Live face-frame enrollment with passive liveness checks, front/back camera selection, and profile-specific matching.
- Streaming voice enrollment and profile-specific speaker matching using Sherpa-ONNX.
- Consent before enrollment. Raw face frames and voice audio are processed in memory and are not intentionally saved.
- Face templates and voice embeddings stored in the encrypted profile database.
- No fingerprint enrollment or matching. Mobile operating systems do not expose raw fingerprint templates to applications, and this demo does not use the system biometric prompt.

## Privacy and data

Profiles and biometric templates are kept locally in SQLCipher-encrypted SQLite. The random database key is held in iOS Keychain / Android Keystore through `expo-secure-store`. The face and voice models run locally after they are downloaded.

On first launch, profiles from the previous unencrypted demo database are copied into the encrypted database. The legacy database is removed only after the copy succeeds.

The face detector/recognizer and voice model are downloaded from their respective open-source project release sources. Face models are prepared during the native prebuild command; the speaker model is downloaded when the voice flow is first opened. An internet connection is required for those first downloads. No face video or voice recording is written to app storage. The database retains derived face and speaker templates only.

Biometric information is sensitive personal data. Enroll only with the subject's informed permission, delete profiles when no longer needed, and obtain legal, privacy, and security review before adapting this sample for real users.

## Requirements

- Node.js 22.13+ (or 24.3+ / 26+); `.nvmrc` selects Node 22.
- A physical iOS device running iOS 16.4+ or an Android `arm64-v8a` device running API 24+ for face recognition. Simulators and emulators are not supported by the face module.
- A working Xcode / iOS toolchain or Android SDK and JDK for native builds.
- Expo Go is not supported because this app uses native camera, audio, ONNX, and Nitro modules.

## Setup and run

```sh
git submodule update --init --depth 1
nvm install
nvm use
npm install
npm run prebuild
npm run ios
# or
npm run android
```

The prebuild command prepares the face-model files and generates the native projects. The first voice flow downloads the speaker model to app-local storage. Grant camera and microphone permissions when prompted.

This app includes `expo-dev-client` because Expo Go does not contain its native biometric/Nitro modules. Install and launch the custom development build (do not open the project in Expo Go). When native dependencies change, rebuild and reinstall; refreshing Metro or reloading JavaScript does not update the installed native binary. The Android preparation script aligns the face recognizer with Sherpa's ONNX Runtime before building, so both native modules use a compatible shared runtime. On Android, face recognition falls back to ONNX Runtime's CPU provider if XNNPACK is unavailable in that runtime. Always use the project Android script rather than invoking Expo's Android build command directly. If Android shows `The native "NitroModules" Turbo/Native-Module could not be found`, connect the device with USB debugging enabled and run:

```sh
npm run android -- --device
```

This installs a fresh native build on the connected device. The device must be connected before running the command.

Start Metro for an already-built native app with:

```sh
npm start
```

Type-check the TypeScript source with:

```sh
npm run typecheck
```

## SDK and model sources

- Face processing: [react-native-vision-camera-face-recognizer](https://github.com/margelo/face-recognition-demo/tree/main/modules/react-native-face-recognition), MIT-licensed module source pinned as a Git submodule. Face and passive-liveness model assets are fetched by the module's preparation script and have their own licensing terms.
- Voice processing: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) through the MIT-licensed [`@siteed/sherpa-onnx.rn`](https://github.com/deeeed/sherpa-onnx.rn) React Native wrapper. The speaker model is from the Apache-2.0 3D-Speaker / CAM++ model release.
- Database encryption: Expo SQLite with SQLCipher enabled; the encryption key is stored using Expo SecureStore.

Review the individual SDK and model licenses before redistribution or commercial use.

## Project structure

```text
App.tsx                         App state, navigation, and screen coordination
src/
  biometrics/voice.ts           Voice model download and speaker-engine lifecycle
  components/UI.tsx             Shared NativeWind components
  screens/                      Onboarding, home, add, find, capture, and profile UI
  storage.ts                    SQLCipher database and template persistence
  types.ts                      Profile and biometric-template types
plugins/
  withAndroidOnnxRuntimePickFirst.js  Resolves duplicate Android ONNX runtime libraries
scripts/
  prepare-face-models.mjs       Prepares face models and aligns the Android ONNX runtime
vendor/
  face-recognition-demo/        Pinned upstream face SDK Git submodule
app.json                        Expo permissions and native module configuration
global.css                      NativeWind Tailwind directives
tailwind.config.js              NativeWind theme
```
