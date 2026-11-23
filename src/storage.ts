import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { NewUserProfile, UserProfile } from "./types";

const DATABASE_NAME = "biomatic-demo.db";
const DATABASE_KEY_NAME = "biomatic-demo.database-key";
const ONBOARDING_KEY_NAME = "biomatic-demo.onboarding-complete";

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function getDatabaseKey(): Promise<string> {
  const savedKey = await SecureStore.getItemAsync(DATABASE_KEY_NAME);
  if (savedKey) return savedKey;

  const bytes = Crypto.getRandomBytes(32);
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(DATABASE_KEY_NAME, key);
  return key;
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
        created_at TEXT NOT NULL
      );
      PRAGMA journal_mode = WAL;
    `);
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
    createdAt: row.created_at,
  };
}

export async function listProfiles(): Promise<UserProfile[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<Parameters<typeof toProfile>[0]>(
    "SELECT id, name, email, phone, organization, notes, photo_data_url, created_at FROM user_profiles ORDER BY created_at DESC"
  );
  return rows.map(toProfile);
}

export async function searchProfiles(searchText: string): Promise<UserProfile[]> {
  const database = await openDatabase();
  const rows = await database.getAllAsync<Parameters<typeof toProfile>[0]>(
    `SELECT id, name, email, phone, organization, notes, photo_data_url, created_at
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
  const created: UserProfile = {
    ...profile,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  await database.runAsync(
    `INSERT INTO user_profiles
      (id, name, email, phone, organization, notes, photo_data_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    created.id,
    created.name,
    created.email,
    created.phone,
    created.organization,
    created.notes,
    created.photoDataUrl,
    created.createdAt
  );
  return created;
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
