import { StatusBar } from "expo-status-bar";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Notice, Page, PrimaryButton } from "../components/UI";

export function OnboardingScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <Page>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-9 items-center">
          <View className="h-24 w-24 items-center justify-center rounded-[30px] bg-brand">
            <Ionicons name="finger-print-outline" size={56} color="white" />
          </View>
          <Text className="mt-7 text-center text-3xl font-extrabold tracking-tight text-ink">
            Biomatic Demo App
          </Text>
          <Text className="mt-3 max-w-xs text-center text-base leading-6 text-muted">
            A thoughtful, on-device demo for managing profiles and exploring
            face, voice, and camera-photo workflows.
          </Text>
        </View>

        <View className="mb-6 gap-3">
          {[
            ["person-add-outline", "Create local profiles", "Keep contact details and a profile photo on this device."],
            ["lock-closed-outline", "Unlock local profiles", "Use face or voice matching, or the device's system biometric prompt to unlock local profile data."],
            ["hand-left-outline", "Explore fingertip demo photos", "Capture ten compressed camera images for a backend-format preview; they are not fingerprint templates and cannot authenticate."],
            ["shield-checkmark-outline", "Stay in control", "Data is encrypted locally and never uploaded. Copying the JSON preview places sensitive data on the clipboard."],
          ].map(([icon, title, description]) => (
            <View
              key={title}
              className="flex-row items-center rounded-2xl border border-line bg-white p-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-mint">
                <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color="#176B57" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-bold text-ink">{title}</Text>
                <Text className="mt-1 text-sm leading-5 text-muted">{description}</Text>
              </View>
            </View>
          ))}
        </View>

        <Notice icon="information-circle-outline" tone="amber">
          <Text className="text-sm font-bold text-ink">A demo, not production identity proofing</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">
            Face and voice templates are matched locally. Camera fingertip photos
            are demo data only, not fingerprint templates or authentication. The
            system prompt confirms device access, not profile identity. Do not use
            this app for access control.
          </Text>
        </Notice>

        <View className="mt-7">
          <PrimaryButton title="Get started" icon="arrow-forward" onPress={onContinue} />
          <Text className="mt-4 text-center text-xs leading-5 text-muted">
            By continuing, you confirm that you have permission to add the
            profile information you enter.
          </Text>
        </View>
      </ScrollView>
    </Page>
  );
}
