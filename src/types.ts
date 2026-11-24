export const FINGERTIP_FINGERS = [
  { id: "left_thumb", label: "Left thumb" },
  { id: "left_index", label: "Left index finger" },
  { id: "left_middle", label: "Left middle finger" },
  { id: "left_ring", label: "Left ring finger" },
  { id: "left_little", label: "Left little finger" },
  { id: "right_thumb", label: "Right thumb" },
  { id: "right_index", label: "Right index finger" },
  { id: "right_middle", label: "Right middle finger" },
  { id: "right_ring", label: "Right ring finger" },
  { id: "right_little", label: "Right little finger" },
] as const;

export type FingertipId = (typeof FINGERTIP_FINGERS)[number]["id"];

/**
 * Capture steps. `fingerIds` is the order in which fingers appear from the
 * left edge of the camera preview to the right, with fingers pointing up and
 * pads facing the camera.
 */
export const FINGERPRINT_STEPS = [
  {
    id: "left_four",
    label: "Left hand, four fingers",
    short: "Left fingers",
    expected: 4,
    fingerIds: ["left_little", "left_ring", "left_middle", "left_index"],
  },
  {
    id: "right_four",
    label: "Right hand, four fingers",
    short: "Right fingers",
    expected: 4,
    fingerIds: ["right_index", "right_middle", "right_ring", "right_little"],
  },
  {
    id: "left_thumb",
    label: "Left thumb",
    short: "Left thumb",
    expected: 1,
    fingerIds: ["left_thumb"],
  },
  {
    id: "right_thumb",
    label: "Right thumb",
    short: "Right thumb",
    expected: 1,
    fingerIds: ["right_thumb"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  short: string;
  expected: number;
  fingerIds: readonly FingertipId[];
}[];

export type FingerprintStepId = (typeof FINGERPRINT_STEPS)[number]["id"];

/**
 * App-specific minutiae template extracted from a camera image of one fingertip.
 * `minutiae` is a flat list of [x, y, angleDegrees] triples (angle 0..179)
 * in a width x height crop.
 */
export type FingerprintTemplate = {
  fingerId: FingertipId;
  width: number;
  height: number;
  minutiae: number[];
  quality: number;
  capturedAt: string;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  notes: string;
  photoDataUrl: string | null;
  hasFaceTemplate: boolean;
  hasVoiceTemplate: boolean;
  hasFingerprintTemplates: boolean;
  createdAt: string;
};

export type NewUserProfile = Omit<
  UserProfile,
  | "id"
  | "createdAt"
  | "hasFaceTemplate"
  | "hasVoiceTemplate"
  | "hasFingerprintTemplates"
> & {
  faceTemplate: Uint8Array;
  voiceEmbedding: number[];
  fingerprintTemplates: FingerprintTemplate[];
};

export type ProfileBiometrics = {
  faceTemplate: Uint8Array | null;
  voiceEmbedding: number[] | null;
  fingerprintTemplates: FingerprintTemplate[];
};
