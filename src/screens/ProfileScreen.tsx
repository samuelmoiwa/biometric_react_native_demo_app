import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, InfoRow, Notice, Page, PrimaryButton, Surface } from "../components/UI";
import type { SupportedBiometric, UserProfile } from "../types";

type BiometricStatus = {
  available: boolean;
  methods: SupportedBiometric[];
};

function getErrorMessage(error: string | undefined): string {
  switch (error) {
    case "not_enrolled":
      return "No biometric is enrolled on this device. Set up Face ID or fingerprint in your device settings.";
    case "not_available":
    case "no_hardware":
      return "This device does not have an available biometric authenticator.";
    case "lockout":
    case "lockout_permanent":
      return "Biometric verification is temporarily locked. Try again later or check your device settings.";
    default:
      return "Device verification could not be completed. Please try again.";
  }
}

export function ProfileScreen({
  user,
  onBack,
  onDelete,
}: {
  user: UserProfile;
  onBack: () => void;
  onDelete: () => Promise<void>;
}) {
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    async function readDeviceStatus() {
      try {
        const [hardware, enrolled, supportedTypes] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        if (!active) return;
        const methods: SupportedBiometric[] = [];
        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) methods.push("Face recognition");
        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) methods.push("Fingerprint");
        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) methods.push("Iris");
        setStatus({ available: hardware && enrolled, methods });
      } catch (error) {
        if (active) {
          setStatusError(error instanceof Error ? error.message : "Could not check device biometric availability.");
        }
      }
    }
    void readDeviceStatus();
    return () => {
      active = false;
    };
  }, []);

  async function verify() {
    if (!status?.available) {
      Alert.alert(
        "Biometric verification unavailable",
        statusError ?? "Set up Face ID or fingerprint on this device, then try again."
      );
      return;
    }
    setVerifying(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Verify to reveal this demo profile",
        cancelLabel: "Cancel",
        disableDeviceFallback: true,
      });
      if (result.success) {
        setUnlocked(true);
      } else if (result.error !== "user_cancel" && result.error !== "system_cancel" && result.error !== "app_cancel") {
        Alert.alert("Verification failed", getErrorMessage(result.error));
      }
    } catch (error) {
      Alert.alert(
        "Verification error",
        error instanceof Error ? error.message : "An unexpected error occurred."
      );
    } finally {
      setVerifying(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete this profile?", "This permanently removes the local profile and its photo.", [
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

  return (
    <Page>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} className="mb-5 h-10 w-10 items-center justify-center rounded-full bg-white">
          <Ionicons name="arrow-back" size={20} color="#14211F" />
        </Pressable>

        {!unlocked ? (
          <>
            <View className="items-center rounded-[28px] border border-line bg-white px-6 py-8">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-mint">
                <Ionicons name="lock-closed" size={34} color="#176B57" />
              </View>
              <Text className="mt-5 text-xl font-extrabold text-ink">Profile is protected</Text>
              <Text className="mt-2 text-center text-sm leading-5 text-muted">
                Verify with your device to reveal this saved profile.
              </Text>
              <View className="mt-5 w-full">
                <PrimaryButton
                  title="Verify with device"
                  icon="finger-print-outline"
                  onPress={verify}
                  loading={verifying}
                />
              </View>
            </View>
            <View className="mt-4">
              <Notice icon={status?.available ? "checkmark-circle-outline" : "information-circle-outline"} tone={status?.available ? "green" : "amber"}>
                <Text className="text-sm font-bold text-ink">
                  {status ? (status.available ? "Device biometric ready" : "Device biometric not set up") : "Checking device…"}
                </Text>
                <Text className="mt-1 text-sm leading-5 text-muted">
                  {statusError ??
                    (status?.available
                      ? `Supported by this device: ${status.methods.join(", ") || "biometric authentication"}.`
                      : "Set up Face ID or fingerprint in device settings to use this demo.")}
                </Text>
              </Notice>
            </View>
            <View className="mt-4">
              <Notice icon="shield-outline">
                <Text className="text-sm font-bold text-ink">Device check, not person matching</Text>
                <Text className="mt-1 text-sm leading-5 text-muted">
                  This prompt verifies an enrolled biometric on this device. It does not compare the selected profile to a face, voice, or fingerprint sample.
                </Text>
              </Notice>
            </View>
          </>
        ) : (
          <>
            <View className="items-center rounded-[28px] bg-[#15352E] px-6 py-7">
              <Avatar name={user.name} photoDataUrl={user.photoDataUrl} size={80} />
              <Text className="mt-4 text-2xl font-extrabold text-white">{user.name}</Text>
              <Text className="mt-1 text-sm text-white/70">{user.organization || "Saved user profile"}</Text>
              <View className="mt-4 flex-row items-center rounded-full bg-white/10 px-3 py-2">
                <Ionicons name="shield-checkmark" size={15} color="#BEE9D2" />
                <Text className="ml-2 text-xs font-semibold text-[#BEE9D2]">Device verification complete</Text>
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
              <Text className="mb-3 text-base font-bold text-ink">Biometric status</Text>
              <Surface className="p-0">
                <StatusRow
                  icon="finger-print-outline"
                  title="Fingerprint"
                  detail="Device support only. No fingerprint data is exposed or stored."
                  available={status?.methods.includes("Fingerprint") ?? false}
                />
                <View className="mx-4 h-px bg-line" />
                <StatusRow
                  icon="scan-outline"
                  title="Face recognition"
                  detail="Device support only. No face video or template is exposed or stored."
                  available={status?.methods.includes("Face recognition") ?? false}
                />
                <View className="mx-4 h-px bg-line" />
                <StatusRow
                  icon="mic-outline"
                  title="Voice"
                  detail="Not collected. Voice samples are not part of this demo."
                  available={false}
                />
              </Surface>
              <Text className="mt-3 text-xs leading-5 text-muted">
                The device prompt confirms local access only. It cannot tell this app which saved person or biometric method was used.
              </Text>
            </View>

            <Pressable onPress={confirmDelete} className="mt-6 flex-row items-center justify-center rounded-2xl border border-red-200 bg-white py-4">
              <Ionicons name="trash-outline" size={18} color="#B42318" />
              <Text className="ml-2 font-bold text-[#B42318]">Delete local profile</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Page>
  );
}

function StatusRow({
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
      <View className="items-end">
        <Ionicons
          name={available ? "checkmark-circle" : "remove-circle-outline"}
          size={20}
          color={available ? "#176B57" : "#9AA49F"}
        />
        <Text className="mt-1 text-[9px] text-muted">{available ? "Supported" : "No support"}</Text>
      </View>
    </View>
  );
}
