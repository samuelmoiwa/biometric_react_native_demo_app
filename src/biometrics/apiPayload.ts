import { VOICE_SAMPLE_RATE } from "./voice";
import type { ProfileBiometrics, UserProfile } from "../types";

const FACE_TEMPLATE_PRODUCER =
  "react-native-vision-camera-face-recognizer";
const VOICE_MODEL_ID = "3dspeaker-campplus-sv-en-voxceleb-16k";

export type BiometricApiPayload = {
  schema: "biomatic.profile-biometrics";
  schemaVersion: 1;
  generatedAt: string;
  uploadStatus: "preview-only-not-uploaded";
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string;
    organization: string;
  };
  biometrics: {
    face: {
      format: "opaque-native-template";
      encoding: "base64";
      producer: string;
      data: string;
      byteLength: number;
    } | null;
    voice: {
      format: "speaker-embedding";
      encoding: "json-number-array";
      model: string;
      sampleRateHz: number;
      vectorDimension: number;
      data: number[];
    } | null;
    fingertipPhotos: {
      type: "demo-camera-photos-not-fingerprint-templates";
      authenticationCapable: false;
      encoding: "base64";
      mimeType: "image/jpeg";
      images: {
        fingerId: string;
        width: number;
        height: number;
        capturedAt: string;
        data: string;
      }[];
    };
  };
};

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;

    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 0x03) << 4) | (second >> 4)];
    encoded += hasSecond
      ? alphabet[((second & 0x0f) << 2) | (third >> 6)]
      : "=";
    encoded += hasThird ? alphabet[third & 0x3f] : "=";
  }
  return encoded;
}

export function buildBiometricApiPayload(
  profile: UserProfile,
  biometrics: ProfileBiometrics
): BiometricApiPayload {
  return {
    schema: "biomatic.profile-biometrics",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    uploadStatus: "preview-only-not-uploaded",
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      organization: profile.organization,
    },
    biometrics: {
      face: biometrics.faceTemplate?.byteLength
        ? {
            format: "opaque-native-template",
            encoding: "base64",
            producer: FACE_TEMPLATE_PRODUCER,
            data: bytesToBase64(biometrics.faceTemplate),
            byteLength: biometrics.faceTemplate.byteLength,
          }
        : null,
      voice: biometrics.voiceEmbedding
        ? {
            format: "speaker-embedding",
            encoding: "json-number-array",
            model: VOICE_MODEL_ID,
            sampleRateHz: VOICE_SAMPLE_RATE,
            vectorDimension: biometrics.voiceEmbedding.length,
            data: biometrics.voiceEmbedding,
          }
        : null,
      fingertipPhotos: {
        type: "demo-camera-photos-not-fingerprint-templates",
        authenticationCapable: false,
        encoding: "base64",
        mimeType: "image/jpeg",
        images: biometrics.fingertipPhotos.map((photo) => ({
          fingerId: photo.fingerId,
          width: photo.width,
          height: photo.height,
          capturedAt: photo.capturedAt,
          data: photo.dataBase64,
        })),
      },
    },
  };
}
