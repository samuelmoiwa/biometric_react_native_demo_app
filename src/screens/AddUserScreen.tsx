import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Field, Notice, Page, PrimaryButton } from "../components/UI";
import { FaceCaptureScreen } from "./FaceCaptureScreen";
import { VoiceCaptureScreen } from "./VoiceCaptureScreen";
import { FingertipCaptureScreen } from "./FingertipCaptureScreen";
import { PhotoCropScreen } from "./PhotoCropScreen";
import {
  FINGERTIP_FINGERS,
  type FingerprintTemplate,
  type NewUserProfile,
} from "../types";

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
  const [consent, setConsent] = useState(false);
  const [captureStep, setCaptureStep] = useState<
    "details" | "crop" | "face" | "voice" | "fingertips"
  >("details");
  const [pendingPhoto, setPendingPhoto] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [faceTemplate, setFaceTemplate] = useState<Uint8Array | null>(null);
  const [voiceEmbedding, setVoiceEmbedding] = useState<number[] | null>(null);
  const [fingerprintTemplates, setFingerprintTemplates] = useState<FingerprintTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const biometricsReady =
    Boolean(faceTemplate) &&
    Boolean(voiceEmbedding) &&
    fingerprintTemplates.length === FINGERTIP_FINGERS.length;

  if (captureStep === "crop" && pendingPhoto) {
    return (
      <PhotoCropScreen
        uri={pendingPhoto.uri}
        width={pendingPhoto.width}
        height={pendingPhoto.height}
        onCancel={() => {
          setPendingPhoto(null);
          setCaptureStep("details");
        }}
        onConfirm={(dataUrl) => {
          setPhotoDataUrl(dataUrl);
          setPendingPhoto(null);
          setCaptureStep("details");
        }}
      />
    );
  }

  if (captureStep === "face") {
    return (
      <FaceCaptureScreen
        mode="enroll"
        onComplete={(template) => {
          setFaceTemplate(new Uint8Array(template));
          setCaptureStep("voice");
        }}
        onCancel={() => setCaptureStep("details")}
      />
    );
  }

  if (captureStep === "voice") {
    return (
      <VoiceCaptureScreen
        mode="enroll"
        onComplete={(embedding) => {
          setVoiceEmbedding(embedding);
          setCaptureStep("fingertips");
        }}
        onCancel={() => setCaptureStep("details")}
      />
    );
  }

  if (captureStep === "fingertips") {
    return (
      <FingertipCaptureScreen
        mode="enroll"
        onComplete={(templates) => {
          setFingerprintTemplates(templates);
          setCaptureStep("details");
        }}
        onCancel={() => setCaptureStep("details")}
      />
    );
  }

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo permission needed",
          "Allow photo-library access to choose a profile picture. This permission is used only for the selected photo."
        );
        return;
      }

      // Cropping happens in our own screen, not the system editor.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled) {
        const image = result.assets[0];
        if (!image.width || !image.height) {
          Alert.alert("Photo unavailable", "The selected photo could not be read. Please choose another.");
          return;
        }
        setPendingPhoto({ uri: image.uri, width: image.width, height: image.height });
        setCaptureStep("crop");
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
    if (!consent) {
      Alert.alert(
        "Consent required",
        "Confirm consent to on-device biometric processing before saving this profile."
      );
      return;
    }

    if (!faceTemplate || !voiceEmbedding || fingerprintTemplates.length !== FINGERTIP_FINGERS.length) {
      Alert.alert(
        "Biometric enrollment required",
        "Capture the face, voice and all ten fingerprint templates before saving this profile."
      );
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
        faceTemplate,
        voiceEmbedding,
        fingerprintTemplates,
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
          Add contact details, then create on-device face, voice and fingerprint templates.
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

        <Field label="Full name *" value={name} onChangeText={setName} placeholder="e.g. Alex Kamara" autoCapitalize="words" />
        <Field
          label="Email address *"
          value={email}
          onChangeText={setEmail}
          placeholder="alex@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field label="Phone number *" value={phone} onChangeText={setPhone} placeholder="+232 (00) 000-000" keyboardType="phone-pad" />
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

        <View className="mb-4 rounded-2xl border border-line bg-white p-4">
          <Text className="text-sm font-bold text-ink">Biometric enrollment</Text>
          <Text className="mt-1 text-xs leading-5 text-muted">
            {biometricsReady
              ? "Face, voice and all ten fingerprint templates are ready."
              : "Complete face, voice and fingerprint enrollment."}
          </Text>
          <View className="mt-4 flex-row items-center">
            <Ionicons
              name={faceTemplate ? "checkmark-circle" : "ellipse-outline"}
              size={19}
              color={faceTemplate ? "#176B57" : "#9AA49F"}
            />
            <Text className="ml-2 flex-1 text-sm font-medium text-ink">
              Face template {faceTemplate ? "captured" : "not captured"}
            </Text>
            {faceTemplate ? (
              <Text className="text-xs text-muted">{faceTemplate.byteLength} bytes</Text>
            ) : null}
          </View>
          <View className="mt-3 flex-row items-center">
            <Ionicons
              name={voiceEmbedding ? "checkmark-circle" : "ellipse-outline"}
              size={19}
              color={voiceEmbedding ? "#176B57" : "#9AA49F"}
            />
            <Text className="ml-2 flex-1 text-sm font-medium text-ink">
              Voice template {voiceEmbedding ? "captured" : "not captured"}
            </Text>
            {voiceEmbedding ? (
              <Text className="text-xs text-muted">{voiceEmbedding.length} values</Text>
            ) : null}
          </View>
          <View className="mt-3 flex-row items-center">
            <Ionicons
              name={fingerprintTemplates.length === FINGERTIP_FINGERS.length ? "checkmark-circle" : "ellipse-outline"}
              size={19}
              color={fingerprintTemplates.length === FINGERTIP_FINGERS.length ? "#176B57" : "#9AA49F"}
            />
            <Text className="ml-2 flex-1 text-sm font-medium text-ink">
              Fingerprint templates {fingerprintTemplates.length === FINGERTIP_FINGERS.length ? "captured" : "not captured"}
            </Text>
            {fingerprintTemplates.length > 0 ? (
              <Text className="text-xs text-muted">{fingerprintTemplates.length}/10 fingers</Text>
            ) : null}
          </View>
          <View className="mt-4">
            <PrimaryButton
              title={
                biometricsReady
                  ? "Re-enroll biometrics"
                  : !faceTemplate
                    ? "Start face enrollment"
                    : !voiceEmbedding
                      ? "Continue with voice"
                      : "Continue with fingerprints"
              }
              icon={biometricsReady ? "refresh" : "scan-outline"}
              onPress={() => {
                if (!consent) {
                  Alert.alert(
                    "Consent required",
                    "Confirm consent to on-device biometric processing and local fingerprint template storage before enrollment."
                  );
                  return;
                }
                if (biometricsReady) {
                  setFaceTemplate(null);
                  setVoiceEmbedding(null);
                  setFingerprintTemplates([]);
                }
                setCaptureStep(
                  !faceTemplate
                    ? "face"
                    : !voiceEmbedding
                      ? "voice"
                      : "fingertips"
                );
              }}
              disabled={saving}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          onPress={() => setConsent((current) => !current)}
          className="mb-4 flex-row items-start rounded-2xl border border-line bg-white p-4"
        >
          <Ionicons
            name={consent ? "checkbox" : "square-outline"}
            size={21}
            color={consent ? "#176B57" : "#72807C"}
          />
          <Text className="ml-3 flex-1 text-xs leading-5 text-muted">
            I have permission to enroll this person and consent to processing their live face frames, voice sample and fingertip camera images on this device, and to storing the resulting face, voice and fingerprint templates in the encrypted profile database. Camera frames and recordings are not saved. No data is uploaded; the local JSON preview includes sensitive biometric data, and copying it places that data on the clipboard.
          </Text>
        </Pressable>

        <Notice icon="lock-closed-outline">
          <Text className="text-sm font-bold text-ink">Stored privately on this device</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">
            Profile details and the face, voice and fingerprint templates are saved in the encrypted local database. Face frames, voice recordings and fingertip images are processed on device and are not saved. Nothing is sent to an API.
          </Text>
        </Notice>
        <View className="mt-6">
          <PrimaryButton
            title="Save user profile"
            icon="checkmark"
            onPress={submit}
            loading={saving}
            disabled={!consent || !biometricsReady || saving}
          />
        </View>
      </ScrollView>
    </Page>
  );
}
