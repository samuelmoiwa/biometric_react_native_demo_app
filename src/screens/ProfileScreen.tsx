import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import {
  Avatar,
  InfoRow,
  Notice,
  Page,
  PrimaryButton,
  Surface,
} from "../components/UI";
import type { ProfileBiometrics, UserProfile } from "../types";
import { BiometricDataScreen } from "./BiometricDataScreen";
import { FaceCaptureScreen } from "./FaceCaptureScreen";
import { VoiceCaptureScreen } from "./VoiceCaptureScreen";
import { FingertipCaptureScreen } from "./FingertipCaptureScreen";

type VerificationMode = "face" | "voice" | "fingerprint";

export function ProfileScreen({
  user,
  onBack,
  onDelete,
  onLoadBiometrics,
}: {
  user: UserProfile;
  onBack: () => void;
  onDelete: () => Promise<void>;
  onLoadBiometrics: () => Promise<ProfileBiometrics>;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [loadingMode, setLoadingMode] = useState<VerificationMode | null>(null);
  const [verificationMode, setVerificationMode] = useState<VerificationMode | null>(null);
  const [biometrics, setBiometrics] = useState<ProfileBiometrics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unlockMethod, setUnlockMethod] = useState<
    VerificationMode | "device" | null
  >(null);
  const [deviceUnlocking, setDeviceUnlocking] = useState(false);
  const [showBiometricData, setShowBiometricData] = useState(false);

  async function beginVerification(mode: VerificationMode) {
    setLoadingMode(mode);
    setLoadError(null);
    try {
      const saved = await onLoadBiometrics();
      const template =
        mode === "face"
          ? saved.faceTemplate
          : mode === "voice"
            ? saved.voiceEmbedding
            : saved.fingerprintTemplates;
      if (!template || template.length === 0) {
        throw new Error(`This profile has no enrolled ${mode} template.`);
      }
      setBiometrics(saved);
      setVerificationMode(mode);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "The saved biometric template could not be loaded."
      );
    } finally {
      setLoadingMode(null);
    }
  }

  async function unlockWithDeviceBiometrics() {
    if (deviceUnlocking) return;
    setDeviceUnlocking(true);
    setLoadError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock this local profile",
        promptSubtitle: "Confirms this device user, not the profile's identity",
        cancelLabel: "Cancel",
        disableDeviceFallback: true,
        biometricsSecurityLevel: "strong",
      });
      if (!result.success) {
        throw new Error(
          result.error === "not_enrolled" || result.error === "not_available"
            ? "No usable device authentication is configured. Enroll a device biometric or use face, voice or fingerprint profile verification."
            : "Device authentication did not complete successfully."
        );
      }

      const saved = await onLoadBiometrics();
      setBiometrics(saved);
      setUnlockMethod("device");
      setUnlocked(true);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "The profile could not be unlocked with device authentication."
      );
    } finally {
      setDeviceUnlocking(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete this profile?", "This permanently removes the local profile, photo, and biometric templates.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void onDelete().catch((error: unknown) => {
            Alert.alert(
              "Could not delete profile",
              error instanceof Error ? error.message : "An unexpected error occurred."
            );
          });
        },
      },
    ]);
  }

  if (!unlocked && verificationMode === "face" && biometrics?.faceTemplate) {
    return (
      <FaceCaptureScreen
        mode="verify"
        profileId={user.id}
        expectedTemplate={biometrics.faceTemplate}
        onVerified={() => {
          setUnlockMethod("face");
          setUnlocked(true);
        }}
        onCancel={() => setVerificationMode(null)}
      />
    );
  }

  if (!unlocked && verificationMode === "voice" && biometrics?.voiceEmbedding) {
    return (
      <VoiceCaptureScreen
        mode="verify"
        profileId={user.id}
        expectedEmbedding={biometrics.voiceEmbedding}
        onVerified={() => {
          setUnlockMethod("voice");
          setUnlocked(true);
        }}
        onCancel={() => setVerificationMode(null)}
      />
    );
  }

  if (!unlocked && verificationMode === "fingerprint" && biometrics?.fingerprintTemplates.length) {
    return (
      <FingertipCaptureScreen
        mode="verify"
        expectedTemplates={biometrics.fingerprintTemplates}
        onVerified={() => {
          setUnlockMethod("fingerprint");
          setUnlocked(true);
        }}
        onCancel={() => setVerificationMode(null)}
      />
    );
  }

  if (unlocked && showBiometricData && biometrics) {
    return (
      <BiometricDataScreen
        user={user}
        biometrics={biometrics}
        onBack={() => setShowBiometricData(false)}
      />
    );
  }

  return (
    <Page>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to directory"
          className="mb-5 h-10 w-10 items-center justify-center rounded-full bg-white"
        >
          <Ionicons name="arrow-back" size={20} color="#14211F" />
        </Pressable>

        {!unlocked ? (
          <>
            <View className="items-center rounded-[28px] border border-line bg-white px-6 py-8">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-mint">
                <Ionicons name="shield-outline" size={34} color="#176B57" />
              </View>
              <Text className="mt-5 text-xl font-extrabold text-ink">Verify this profile</Text>
              <Text className="mt-2 text-center text-sm leading-5 text-muted">
                Choose an enrolled modality. Matching runs against this profile's saved template on this device.
              </Text>

              <View className="mt-6 w-full">
                <PrimaryButton
                  title="Verify with face"
                  icon="scan-outline"
                  onPress={() => void beginVerification("face")}
                  loading={loadingMode === "face"}
                  disabled={!user.hasFaceTemplate || loadingMode !== null}
                />
              </View>
              <View className="mt-3 w-full">
                <PrimaryButton
                  title="Verify with voice"
                  icon="mic-outline"
                  onPress={() => void beginVerification("voice")}
                  loading={loadingMode === "voice"}
                  disabled={!user.hasVoiceTemplate || loadingMode !== null}
                />
              </View>
              <View className="mt-3 w-full">
                <PrimaryButton
                  title="Verify with fingerprint"
                  icon="finger-print-outline"
                  onPress={() => void beginVerification("fingerprint")}
                  loading={loadingMode === "fingerprint"}
                  disabled={!user.hasFingerprintTemplates || loadingMode !== null}
                />
              </View>
              <View className="mt-3 w-full">
                <PrimaryButton
                  title="Unlock with device biometrics"
                  icon="finger-print-outline"
                  onPress={() => void unlockWithDeviceBiometrics()}
                  loading={deviceUnlocking}
                  disabled={deviceUnlocking || loadingMode !== null}
                />
              </View>
              <Text className="mt-3 text-center text-xs leading-5 text-muted">
                The system prompt confirms access to this device; it does not verify that you are the person named in this profile.
              </Text>
            </View>

            {loadError ? (
              <View className="mt-4">
                <Notice icon="alert-circle-outline" tone="amber">
                  <Text className="text-sm font-bold text-ink">Verification unavailable</Text>
                  <Text className="mt-1 text-sm leading-5 text-muted">{loadError}</Text>
                </Notice>
              </View>
            ) : null}

            <View className="mt-4">
              <Notice icon="information-circle-outline" tone="amber">
                <Text className="text-sm font-bold text-ink">Demo-only identity matching</Text>
                <Text className="mt-1 text-sm leading-5 text-muted">
                  Face, voice and camera-fingerprint matching all run locally, but none is certified for access control. Camera fingerprints are far less reliable than a dedicated sensor.
                </Text>
              </Notice>
            </View>

            <Pressable
              onPress={confirmDelete}
              className="mt-6 flex-row items-center justify-center rounded-2xl border border-red-200 bg-white py-4"
            >
              <Ionicons name="trash-outline" size={18} color="#B42318" />
              <Text className="ml-2 font-bold text-[#B42318]">Delete local profile</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View className="items-center rounded-[28px] bg-[#15352E] px-6 py-7">
              <Avatar name={user.name} photoDataUrl={user.photoDataUrl} size={80} />
              <Text className="mt-4 text-2xl font-extrabold text-white">{user.name}</Text>
              <Text className="mt-1 text-sm text-white/70">{user.organization || "Saved user profile"}</Text>
              <View className="mt-4 flex-row items-center rounded-full bg-white/10 px-3 py-2">
                <Ionicons name="shield-checkmark" size={15} color="#BEE9D2" />
                <Text className="ml-2 text-xs font-semibold text-[#BEE9D2]">
                  {unlockMethod === "device"
                    ? "Device authentication complete"
                    : `${
                        unlockMethod === "face" ? "Face" : unlockMethod === "voice" ? "Voice" : "Fingerprint"
                      } verification complete`}
                </Text>
              </View>
            </View>

            <View className="mt-5">
              <Text className="mb-3 text-base font-bold text-ink">Profile information</Text>
              <Surface>
                <InfoRow icon="mail-outline" label="Email address" value={user.email} />
                <View className="h-px bg-line" />
                <InfoRow icon="call-outline" label="Phone number" value={user.phone} />
                {user.organization ? (
                  <>
                    <View className="h-px bg-line" />
                    <InfoRow icon="business-outline" label="Organization" value={user.organization} />
                  </>
                ) : null}
                {user.notes ? (
                  <>
                    <View className="h-px bg-line" />
                    <InfoRow icon="document-text-outline" label="Notes" value={user.notes} />
                  </>
                ) : null}
                <View className="h-px bg-line" />
                <InfoRow icon="key-outline" label="Local profile reference" value={user.id} />
              </Surface>
            </View>

            <View className="mt-5">
              <Text className="mb-3 text-base font-bold text-ink">Stored biometric data</Text>
              <Surface className="p-0">
                <TemplateRow
                  icon="scan-outline"
                  title="Face recognition"
                  detail={
                    biometrics?.faceTemplate
                      ? `On-device template · ${biometrics.faceTemplate.byteLength.toLocaleString()} bytes`
                      : "No face template"
                  }
                  available={user.hasFaceTemplate}
                />
                <View className="mx-4 h-px bg-line" />
                <TemplateRow
                  icon="mic-outline"
                  title="Voice recognition"
                  detail={
                    biometrics?.voiceEmbedding
                      ? `Speaker embedding · ${biometrics.voiceEmbedding.length} numeric values`
                      : "No voice template"
                  }
                  available={user.hasVoiceTemplate}
                />
                <View className="mx-4 h-px bg-line" />
                <TemplateRow
                  icon="finger-print-outline"
                  title="Fingerprint recognition"
                  detail={
                    biometrics
                      ? `${biometrics.fingerprintTemplates.length} minutiae templates from camera images`
                      : user.hasFingerprintTemplates
                        ? "Fingerprint templates saved locally"
                        : "No fingerprint templates"
                  }
                  available={user.hasFingerprintTemplates}
                />
              </Surface>
              <Text className="mt-3 text-xs leading-5 text-muted">
                Face, voice and fingerprint templates are stored in the encrypted local database; raw face frames, voice audio and fingertip images are not retained.
              </Text>
            </View>

            <View className="mt-5">
              <PrimaryButton
                title="View backend JSON preview"
                icon="code-slash-outline"
                onPress={() => setShowBiometricData(true)}
              />
            </View>

            <Pressable
              onPress={confirmDelete}
              className="mt-6 flex-row items-center justify-center rounded-2xl border border-red-200 bg-white py-4"
            >
              <Ionicons name="trash-outline" size={18} color="#B42318" />
              <Text className="ml-2 font-bold text-[#B42318]">Delete local profile</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Page>
  );
}

function TemplateRow({
  icon,
  title,
  detail,
  available,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  available: boolean;
}) {
  return (
    <View className="flex-row items-center p-4">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-canvas">
        <Ionicons name={icon} size={20} color="#176B57" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-bold text-ink">{title}</Text>
        <Text className="mt-1 text-xs leading-4 text-muted">{detail}</Text>
      </View>
      <Ionicons
        name={available ? "checkmark-circle" : "remove-circle-outline"}
        size={20}
        color={available ? "#176B57" : "#9AA49F"}
      />
    </View>
  );
}
