# Biomatic Demo App

A React Native demo for creating local user profiles and revealing them after a native device-biometric check. The interface uses NativeWind, and profile records are stored in an SQLCipher-encrypted SQLite database with its key held in the platform secure store.

## What it does

- Welcomes users with a privacy-first onboarding screen.
- Creates, searches, views, and deletes local profiles with a name, email, phone number, organization, notes, and optional profile photo.
- Uses the iOS or Android biometric prompt before revealing a selected profile.
- Shows the device's supported biometric capabilities and a local profile reference.
- Provides loading, empty, permission, and error states throughout the main flows.

## Important biometric limitations

This is a profile-management demo, not a biometric enrollment or identity-matching system. It uses [`expo-local-authentication`](https://github.com/expo/expo/tree/main/packages/expo-local-authentication), an open-source React Native interface to the operating system's authenticator.

The operating system does not give apps raw fingerprint templates, identify which enrolled person authenticated, or return biometric samples. As a result:

- The app does **not** capture or save fingerprints, face video, voice recordings, or biometric templates.
- It cannot scan each finger or use a saved sample to match someone to a profile.
- Passing the device prompt confirms local device access only; the app does not claim that it proves the selected profile's identity.
- The face and fingerprint indicators describe device support, not biometric data attached to a profile. Voice is explicitly marked as not collected.

Do not use this demo for identity proofing, access control, or production biometric enrollment.

## Privacy and local data

Profile fields and the optional profile photo are stored only in an SQLCipher-encrypted SQLite database. A random database key is stored using iOS Keychain / Android Keystore through `expo-secure-store`. The app requests photo-library access only when a user chooses a profile picture; it does not request camera or microphone access.

This local-storage setup is a demo baseline, not a complete production security review. Protect device access, establish retention and consent policies, and get a security review before using real personal data.

## Setup

Use a supported Node.js release (22.13+, 24.3+, or 26+). This project includes an `.nvmrc` for Node 22; with nvm, run:

```sh
nvm install
nvm use
npm install
npx expo prebuild
npm run ios
# or
npm run android
```

For development, start Metro with:

```sh
npm start
```

Run the TypeScript check with:

```sh
npm run typecheck
```

On iOS, test on a device with Face ID or Touch ID configured. On Android, test on a device or emulator with biometric hardware and an enrolled biometric. The system prompt and available biometric types depend on the platform and device.

## Project structure

```text
App.tsx                       App state and tab navigation
src/
  components/UI.tsx           Shared NativeWind UI components
  screens/                    Onboarding, home, add, find, and profile screens
  storage.ts                  SQLCipher database and secure key management
  types.ts                    Profile and biometric capability types
app.json                      Expo app and native module configuration
global.css                    NativeWind Tailwind directives
tailwind.config.js            NativeWind theme
```
