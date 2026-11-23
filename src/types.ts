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
  createdAt: string;
};

export type NewUserProfile = Omit<
  UserProfile,
  "id" | "createdAt" | "hasFaceTemplate" | "hasVoiceTemplate"
> & {
  faceTemplate: Uint8Array;
  voiceEmbedding: number[];
};

export type ProfileBiometrics = {
  faceTemplate: Uint8Array | null;
  voiceEmbedding: number[] | null;
};
