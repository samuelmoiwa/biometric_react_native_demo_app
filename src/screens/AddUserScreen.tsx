import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Field, Notice, Page, PrimaryButton } from "../components/UI";
import type { NewUserProfile } from "../types";

export function AddUserScreen({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (profile: NewUserProfile) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [notes, setNotes] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo permission needed",
          "Allow photo access to choose a profile picture. The app does not access your camera or microphone."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        base64: true,
      });

      if (!result.canceled) {
        const image = result.assets[0];
        if (!image.base64) {
          Alert.alert("Photo unavailable", "The selected photo could not be read. Please choose another.");
          return;
        }
        setPhotoDataUrl(`data:${image.mimeType ?? "image/jpeg"};base64,${image.base64}`);
      }
    } catch (error) {
      Alert.alert(
        "Could not choose photo",
        error instanceof Error ? error.message : "An unexpected error occurred."
      );
    }
  }

  async function submit() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail || !phone.trim()) {
      Alert.alert("Complete the required fields", "Name, email, and phone number are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert("Check the email address", "Enter a valid email address and try again.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        email: trimmedEmail,
        phone: phone.trim(),
        organization: organization.trim(),
        notes: notes.trim(),
        photoDataUrl,
      });
    } catch (error) {
      Alert.alert(
        "Could not save profile",
        error instanceof Error ? error.message : "An unexpected error occurred."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onCancel} className="mb-5 h-10 w-10 items-center justify-center rounded-full bg-white">
          <Ionicons name="arrow-back" size={20} color="#14211F" />
        </Pressable>
        <Text className="text-2xl font-extrabold text-ink">Add a user</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">
          Create a local profile. No biometric sample is collected or attached.
        </Text>

        <View className="my-6 items-center">
          <Pressable onPress={choosePhoto} accessibilityRole="button">
            {photoDataUrl ? (
              <Image source={{ uri: photoDataUrl }} className="h-24 w-24 rounded-full" />
            ) : (
              <View className="h-24 w-24 items-center justify-center rounded-full border border-dashed border-brand/40 bg-mint">
                <Ionicons name="camera-outline" size={28} color="#176B57" />
              </View>
            )}
            <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-canvas bg-brand">
              <Ionicons name="add" size={18} color="white" />
            </View>
          </Pressable>
          <Text className="mt-3 text-sm font-semibold text-brand">
            {photoDataUrl ? "Change profile photo" : "Add profile photo"}
          </Text>
          <Text className="mt-1 text-xs text-muted">Choose an image from your photo library</Text>
        </View>

        <Field label="Full name *" value={name} onChangeText={setName} placeholder="e.g. Alex Morgan" autoCapitalize="words" />
        <Field
          label="Email address *"
          value={email}
          onChangeText={setEmail}
          placeholder="alex@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field label="Phone number *" value={phone} onChangeText={setPhone} placeholder="+1 (555) 000-0000" keyboardType="phone-pad" />
        <Field label="Organization" value={organization} onChangeText={setOrganization} placeholder="Company or team" />
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional details"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Notice icon="lock-closed-outline">
          <Text className="text-sm font-bold text-ink">Stored privately on this device</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">
            Profile fields and the selected photo are saved in an encrypted local database. We do not record face video or voice.
          </Text>
        </Notice>
        <View className="mt-6">
          <PrimaryButton title="Save user profile" icon="checkmark" onPress={submit} loading={saving} />
        </View>
      </ScrollView>
    </Page>
  );
}
