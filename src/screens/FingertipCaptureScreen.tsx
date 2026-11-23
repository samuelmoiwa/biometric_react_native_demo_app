import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Notice, Page, PrimaryButton } from "../components/UI";
import { FINGERTIP_FINGERS, type FingertipPhoto } from "../types";

type Props = {
  onComplete: (photos: FingertipPhoto[]) => void;
  onCancel: () => void;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The fingertip photo could not be captured.";
}

export function FingertipCaptureScreen({ onComplete, onCancel }: Props) {
  const [photos, setPhotos] = useState<FingertipPhoto[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureLock = useRef(false);
  const currentFinger = FINGERTIP_FINGERS[photos.length];

  async function captureFinger() {
    if (captureLock.current || !currentFinger) return;
    captureLock.current = true;
    setIsCapturing(true);
    setError(null);

    let cameraImageUri: string | null = null;
    let compressedImageUri: string | null = null;
    let capturedPhoto: FingertipPhoto | null = null;
    let captureError: string | null = null;
    const cleanupErrors: string[] = [];

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Camera permission is required to take demo fingertip photos.");
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        cameraType: ImagePicker.CameraType.back,
        quality: 0.75,
        allowsEditing: false,
        base64: false,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        cameraImageUri = asset.uri;
        const scale = Math.min(
          1,
          640 / asset.width,
          640 / asset.height
        );
        const width = Math.max(1, Math.round(asset.width * scale));
        const height = Math.max(1, Math.round(asset.height * scale));
        const context = ImageManipulator.ImageManipulator.manipulate(asset.uri, {
          maxWidth: 640,
          maxHeight: 640,
        });
        const rendered = await context.resize({ width, height }).renderAsync();
        const compressed = await rendered.saveAsync({
          format: ImageManipulator.SaveFormat.JPEG,
          compress: 0.6,
          base64: true,
        });
        compressedImageUri = compressed.uri;

        if (!compressed.base64 || compressed.width <= 0 || compressed.height <= 0) {
          throw new Error("The compressed fingertip photo is empty.");
        }
        capturedPhoto = {
          fingerId: currentFinger.id,
          dataBase64: compressed.base64,
          width: compressed.width,
          height: compressed.height,
          capturedAt: new Date().toISOString(),
        };
      }
    } catch (captureFailure) {
      captureError = getErrorMessage(captureFailure);
    }

    for (const uri of [compressedImageUri, cameraImageUri]) {
      if (!uri) continue;
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (cleanupFailure) {
        cleanupErrors.push(getErrorMessage(cleanupFailure));
      }
    }

    captureLock.current = false;
    setIsCapturing(false);
    if (cleanupErrors.length > 0) {
      setError(`Could not remove a temporary camera image: ${cleanupErrors[0]}`);
      return;
    }
    if (captureError) {
      setError(captureError);
      return;
    }
    if (capturedPhoto) {
      setPhotos((current) => [...current, capturedPhoto]);
    }
  }

  function retakeLastPhoto() {
    setPhotos((current) => current.slice(0, -1));
    setError(null);
  }

  return (
    <Page>
      <View className="flex-1 bg-[#10231F]">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={onCancel}
            disabled={isCapturing}
            accessibilityRole="button"
            accessibilityLabel="Cancel fingertip photo capture"
            className="h-10 w-10 items-center justify-center rounded-full bg-black/35"
          >
            <Ionicons name="close" size={20} color="white" />
          </Pressable>

          <Text className="mt-5 text-2xl font-extrabold text-white">
            Fingertip photo demo
          </Text>
          <Text className="mt-2 text-sm leading-5 text-white/75">
            Take one compressed photo of each fingertip. These are camera images, not fingerprint templates, and are never used to verify identity.
          </Text>

          <View className="mt-6 rounded-[26px] border border-white/15 bg-white/5 p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-white">Capture progress</Text>
              <Text className="text-sm font-bold text-[#BEE9D2]">
                {photos.length}/{FINGERTIP_FINGERS.length}
              </Text>
            </View>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <View
                className="h-full rounded-full bg-[#9FE0BD]"
                style={{ width: `${(photos.length / FINGERTIP_FINGERS.length) * 100}%` }}
              />
            </View>

            {currentFinger ? (
              <View className="mt-6 items-center rounded-2xl bg-black/20 px-4 py-8">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-white/10">
                  <Ionicons name="hand-left-outline" size={34} color="#BEE9D2" />
                </View>
                <Text className="mt-4 text-lg font-bold text-white">{currentFinger.label}</Text>
                <Text className="mt-1 text-center text-sm text-white/65">
                  Center this fingertip in the camera and keep it steady.
                </Text>
              </View>
            ) : (
              <View className="mt-6 items-center rounded-2xl bg-black/20 px-4 py-6">
                <Ionicons name="checkmark-circle" size={42} color="#9FE0BD" />
                <Text className="mt-3 text-lg font-bold text-white">All ten photos captured</Text>
                <Text className="mt-1 text-center text-sm leading-5 text-white/65">
                  Review the labels, then add these demo photos to the profile.
                </Text>
              </View>
            )}

            {error ? (
              <View className="mt-4">
                <Notice icon="alert-circle-outline" tone="amber">
                  <Text className="text-sm text-ink">{error}</Text>
                </Notice>
              </View>
            ) : null}

            {currentFinger ? (
              <View className="mt-5">
                <PrimaryButton
                  title={`Capture ${currentFinger.label.toLowerCase()}`}
                  icon="camera-outline"
                  onPress={() => void captureFinger()}
                  loading={isCapturing}
                  disabled={isCapturing}
                />
              </View>
            ) : (
              <View className="mt-5 gap-3">
                <PrimaryButton
                  title="Use these 10 demo photos"
                  icon="checkmark"
                  onPress={() => onComplete(photos)}
                />
                <Pressable
                  onPress={retakeLastPhoto}
                  accessibilityRole="button"
                  className="items-center rounded-2xl border border-white/20 py-3"
                >
                  <Text className="font-semibold text-white">Retake the right little finger</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View className="mt-4">
            <Notice icon="information-circle-outline" tone="amber">
              <Text className="text-sm font-bold text-ink">Demo photos only</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Phone cameras cannot read or export the device&apos;s fingerprint template. These resized photos are stored locally in the encrypted profile database and are not uploaded.
              </Text>
            </Notice>
          </View>

          {photos.length > 0 ? (
            <View className="mt-5 gap-2">
              {photos.map((photo) => {
                const finger = FINGERTIP_FINGERS.find((item) => item.id === photo.fingerId);
                return (
                  <View
                    key={photo.fingerId}
                    className="flex-row items-center rounded-xl bg-white/10 p-2.5"
                  >
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${photo.dataBase64}` }}
                      className="h-12 w-12 rounded-lg bg-black/20"
                    />
                    <Text className="ml-3 flex-1 text-sm font-medium text-white">
                      {finger?.label ?? photo.fingerId}
                    </Text>
                    <Ionicons name="checkmark-circle" size={20} color="#9FE0BD" />
                  </View>
                );
              })}
            </View>
          ) : null}

          {isCapturing ? (
            <View className="mt-4 flex-row items-center justify-center">
              <ActivityIndicator size="small" color="#BEE9D2" />
              <Text className="ml-2 text-xs text-white/70">Resizing and preparing local image data…</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Page>
  );
}
