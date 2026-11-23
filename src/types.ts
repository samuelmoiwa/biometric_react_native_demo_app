export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  notes: string;
  photoDataUrl: string | null;
  createdAt: string;
};

export type NewUserProfile = Omit<UserProfile, "id" | "createdAt">;

export type SupportedBiometric = "Face recognition" | "Fingerprint" | "Iris";
