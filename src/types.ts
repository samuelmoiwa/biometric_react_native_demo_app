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

export type FingertipPhoto = {
  fingerId: FingertipId;
  dataBase64: string;
  width: number;
  height: number;
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
  hasFingertipPhotos: boolean;
  createdAt: string;
};

export type NewUserProfile = Omit<
  UserProfile,
  | "id"
  | "createdAt"
  | "hasFaceTemplate"
  | "hasVoiceTemplate"
  | "hasFingertipPhotos"
> & {
  faceTemplate: Uint8Array;
  voiceEmbedding: number[];
  fingertipPhotos: FingertipPhoto[];
};

export type ProfileBiometrics = {
  faceTemplate: Uint8Array | null;
  voiceEmbedding: number[] | null;
  fingertipPhotos: FingertipPhoto[];
};
