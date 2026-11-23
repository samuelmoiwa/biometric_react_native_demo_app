import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Notice, Page, PrimaryButton } from "../components/UI";
import { buildBiometricApiPayload } from "../biometrics/apiPayload";
import type { ProfileBiometrics, UserProfile } from "../types";

export function BiometricDataScreen({
  user,
  biometrics,
  onBack,
}: {
  user: UserProfile;
  biometrics: ProfileBiometrics;
  onBack: () => void;
}) {
  const [copying, setCopying] = useState(false);
  const payload = useMemo(
    () => JSON.stringify(buildBiometricApiPayload(user, biometrics), null, 2),
    [user, biometrics]
  );

  function confirmCopy() {
    Alert.alert(
      "Copy sensitive biometric data?",
      "This copies the full JSON payload, including face and voice templates and fingertip photos, to the device clipboard. Anyone with clipboard access may be able to read it. Nothing will be uploaded.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Copy JSON",
          style: "destructive",
          onPress: () => void copyPayload(),
        },
      ]
    );
  }

  async function copyPayload() {
    if (copying) return;
    setCopying(true);
    try {
      await Clipboard.setStringAsync(payload);
      Alert.alert("Copied", "The local JSON preview was copied to the clipboard.");
    } catch (error) {
      Alert.alert(
        "Could not copy JSON",
        error instanceof Error ? error.message : "The clipboard is unavailable."
      );
    } finally {
      setCopying(false);
    }
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
          accessibilityLabel="Back to profile"
          className="mb-5 h-10 w-10 items-center justify-center rounded-full bg-white"
        >
          <Ionicons name="arrow-back" size={20} color="#14211F" />
        </Pressable>

        <Text className="text-2xl font-extrabold text-ink">Biometric data</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">
          Versioned JSON preview showing the shape of a future API request. It is generated locally and is not sent anywhere.
        </Text>

        <View className="mt-5">
          <Notice icon="warning-outline" tone="amber">
            <Text className="text-sm font-bold text-ink">Sensitive data — preview only</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">
              No backend endpoint or API contract is configured. The face value is an opaque module-specific template, not a standardized interchange format. Camera photos are explicitly demo-only and cannot authenticate fingerprints.
            </Text>
          </Notice>
        </View>

        <View className="mt-5">
          <PrimaryButton
            title="Copy full JSON"
            icon="copy-outline"
            onPress={confirmCopy}
            loading={copying}
          />
        </View>

        <View className="mt-4 overflow-hidden rounded-2xl border border-line bg-[#11201D]">
          <View className="flex-row items-center border-b border-white/10 px-4 py-3">
            <View className="h-2.5 w-2.5 rounded-full bg-[#9FE0BD]" />
            <Text className="ml-2 text-xs font-bold text-white/80">application/json</Text>
            <Text className="ml-auto text-xs text-white/50">v1</Text>
          </View>
          <ScrollView
            horizontal
            nestedScrollEnabled
            contentContainerStyle={{ padding: 14 }}
            showsHorizontalScrollIndicator
          >
            <Text
              selectable
              className="font-mono text-[11px] leading-[17px] text-[#D8F3E4]"
            >
              {payload}
            </Text>
          </ScrollView>
        </View>

        <View className="mt-4 flex-row items-start">
          <Ionicons name="information-circle-outline" size={17} color="#72807C" />
          <Text className="ml-2 flex-1 text-xs leading-5 text-muted">
            Confirm the actual API schema, transport security, retention policy, and consent requirements with your backend team before connecting an endpoint.
          </Text>
        </View>
      </ScrollView>
    </Page>
  );
}
