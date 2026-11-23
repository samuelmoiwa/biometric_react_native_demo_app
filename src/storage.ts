import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { NewUserProfile, ProfileBiometrics, UserProfile } from "./types";

const DATABASE_NAME = "biomatic-demo-encrypted.db";
const LEGACY_DATABASE_NAME = "biomatic-demo.db";
const DATABASE_KEY_NAME = "biomatic-demo.database-key";
const LEGACY_MIGRATION_KEY_NAME = "biomatic-demo.legacy-database-migrated";
const ONBOARDING_KEY_NAME = "biomatic-demo.onboarding-complete";

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function deleteLegacyDatabaseIfPresent(): Promise<void> {
  const databasePath = `${SQLite.defaultDatabaseDirectory}/${LEGACY_DATABASE_NAME}`;
  const databaseInfo = await FileSystem.getInfoAsync(`file://${databasePath}`);
  if (databaseInfo.exists) {
    await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
  }
}

async function getDatabaseKey(): Promise<string> {
  const savedKey = await SecureStore.getItemAsync(DATABASE_KEY_NAME);
  if (savedKey) return savedKey;

  const bytes = Crypto.getRandomBytes(32);
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(DATABASE_KEY_NAME, key);
  return key;
}

async function migrateLegacyProfiles(
  database: SQLite.SQLiteDatabase
): Promise<void> {
  const migrationCompleted = await SecureStore.getItemAsync(
    LEGACY_MIGRATION_KEY_NAME
  );
  if (migrationCompleted === "true") {
    await deleteLegacyDatabaseIfPresent();
    return;
  }

  const legacyDatabase = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  let profiles: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    organization: string;
    notes: string;
    photo_data_url: string | null;
    created_at: string;
  }> = [];
  try {
    const table = await legacyDatabase.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_profiles'"
    );
    if (table) {
      profiles = await legacyDatabase.getAllAsync(
        `SELECT id, name, email, phone, organization, notes, photo_data_url, created_at
         FROM user_profiles`
      );
    }
  } finally {
    await legacyDatabase.closeAsync();
  }

  if (profiles.length > 0) {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const profile of profiles) {
        await transaction.runAsync(
          `INSERT OR IGNORE INTO user_profiles
            (id, name, email, phone, organization, notes, photo_data_url,
             face_template, voice_embedding, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
          profile.id,
          profile.name,
          profile.email,
          profile.phone,
          profile.organization,
          profile.notes,
          profile.photo_data_url,
          profile.created_at
        );
      }
    });
  }

  await SecureStore.setItemAsync(LEGACY_MIGRATION_KEY_NAME, "true");
  await deleteLegacyDatabaseIfPresent();
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (databasePromise) return databasePromise;

  const initialization = (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    const key = await getDatabaseKey();
    await database.execAsync(`PRAGMA key = '${key}';`);
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        organization TEXT NOT NULL,
        notes TEXT NOT NULL,
        photo_data_url TEXT,
        face_template BLOB,
        voice_embedding TEXT,
        created_at TEXT NOT NULL
      );
      PRAGMA journal_mode = WAL;
    `);

    const columns = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(user_profiles)"
    );
    if (!columns.some((column) => column.name === "face_template")) {
      await database.execAsync(
        "ALTER TABLE user_profiles ADD COLUMN face_template BLOB"
      );
    }
    if (!columns.some((column) => column.name === "voice_embedding")) {
      await database.execAsync(
        "ALTER TABLE user_profiles ADD COLUMN voice_embedding TEXT"
      );
    }
    await migrateLegacyProfiles(database);
    return database;
  })();
  databasePromise = initialization;
  try {
    return await initialization;
  } catch (error) {
    databasePromise = undefined;
    throw error;
  }
}

function toProfile(row: {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  notes: string;
  photo_data_url: string | null;
  has_face_template: number;
  has_voice_template: number;
  created_at: string;
}): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    organization: row.organization,
    notes: row.notes,
    photoDataUrl: row.photo_data_url,
    hasFaceTemplate: row.has_face_template === 1,
    hasVoiceTemplate: row.has_voice_template === 1,
    createdAt: row.created_at,
  };
}

const PROFILE_COLUMNS = `
  id, name, email, phone, organization, notes, photo_data_url,
  face_template IS NOT NULL AS has_face_template,
  voice_embedding IS NOT NULL AS has_voice_template,
  created_at
`;

export async function listProfiles(): Promise<UserProfile[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<Parameters<typeof toProfile>[0]>(
    `SELECT ${PROFILE_COLUMNS} FROM user_profiles ORDER BY created_at DESC`
  );
  return rows.map(toProfile);
}

export async function searchProfiles(searchText: string): Promise<UserProfile[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<Parameters<typeof toProfile>[0]>(
    `SELECT ${PROFILE_COLUMNS}
     FROM user_profiles
     WHERE instr(lower(name), lower(?)) > 0
        OR instr(lower(email), lower(?)) > 0
        OR instr(lower(phone), lower(?)) > 0
        OR instr(lower(organization), lower(?)) > 0
     ORDER BY created_at DESC`,
    searchText,
    searchText,
    searchText,
    searchText
  );
  return rows.map(toProfile);
}

export async function createProfile(profile: NewUserProfile): Promise<UserProfile> {
  const database = await openDatabase();
  const { faceTemplate, voiceEmbedding, ...details } = profile;
  const created: UserProfile = {
    ...details,
    id: Crypto.randomUUID(),
    hasFaceTemplate: faceTemplate.byteLength > 0,
    hasVoiceTemplate: voiceEmbedding.length > 0,
    createdAt: new Date().toISOString(),
  };

  await database.runAsync(
    `INSERT INTO user_profiles
      (id, name, email, phone, organization, notes, photo_data_url,
       face_template, voice_embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    created.id,
    created.name,
    created.email,
    created.phone,
    created.organization,
    created.notes,
    created.photoDataUrl,
    faceTemplate,
    JSON.stringify(voiceEmbedding),
    created.createdAt
  );
  return created;
}

export async function getProfileBiometrics(
  id: string
): Promise<ProfileBiometrics> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{
    face_template: Uint8Array | null;
    voice_embedding: string | null;
  }>(
    "SELECT face_template, voice_embedding FROM user_profiles WHERE id = ?",
    id
  );
  if (!row) throw new Error("The selected profile no longer exists.");

  let voiceEmbedding: number[] | null = null;
  if (row.voice_embedding !== null) {
    const parsed: unknown = JSON.parse(row.voice_embedding);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new Error("The saved voice template is invalid.");
    }
    voiceEmbedding = parsed;
  }

  return {
    faceTemplate: row.face_template,
    voiceEmbedding,
  };
}

export async function deleteProfile(id: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync("DELETE FROM user_profiles WHERE id = ?", id);
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDING_KEY_NAME)) === "true";
}

export async function completeOnboarding(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_KEY_NAME, "true");
}
