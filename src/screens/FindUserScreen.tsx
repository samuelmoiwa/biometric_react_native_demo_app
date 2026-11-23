import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState, IconTile, Notice, Page, Surface } from "../components/UI";
import { searchProfiles } from "../storage";
import { UserRow } from "./HomeScreen";
import type { UserProfile } from "../types";

export function FindUserScreen({
  users,
  onSelectUser,
  onAddUser,
}: {
  users: UserProfile[];
  onSelectUser: (user: UserProfile) => void;
  onAddUser: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filteredUsers, setFilteredUsers] = useState(users);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    let active = true;
    setSearchError(null);
    if (!term) {
      setFilteredUsers(users);
      setSearching(false);
      return () => {
        active = false;
      };
    }

    setSearching(true);
    const timeout = setTimeout(() => {
      void searchProfiles(term)
        .then((results) => {
          if (active) setFilteredUsers(results);
        })
        .catch((error: unknown) => {
          if (active) {
            setFilteredUsers([]);
            setSearchError(
              error instanceof Error ? error.message : "The local search could not be completed."
            );
          }
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, users]);

  return (
    <Page>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-2xl font-extrabold text-ink">Find a user</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">
          Search locally, then match the selected profile with its enrolled face or voice template.
        </Text>

        <View className="mt-6 flex-row items-center rounded-2xl border border-line bg-white px-4">
          <Ionicons name="search-outline" size={20} color="#72807C" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name, email, phone or organization"
            placeholderTextColor="#9AA49F"
            autoCapitalize="none"
            className="ml-3 min-h-14 flex-1 text-sm text-ink"
            accessibilityLabel="Search user profiles"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={19} color="#9AA49F" />
            </Pressable>
          ) : null}
        </View>

        <View className="mt-6">
          <Text className="mb-3 text-sm font-bold text-ink">
            {query && !searching ? `${filteredUsers.length} matching ${filteredUsers.length === 1 ? "profile" : "profiles"}` : "Saved profiles"}
          </Text>
          {searchError ? (
            <Notice icon="alert-circle-outline" tone="amber">
              <Text className="text-sm font-bold text-ink">Search failed</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">{searchError}</Text>
            </Notice>
          ) : searching ? (
            <View className="items-center rounded-3xl border border-line bg-white px-6 py-10">
              <ActivityIndicator size="large" color="#176B57" />
              <Text className="mt-4 text-sm font-semibold text-ink">Searching encrypted profiles…</Text>
              <Text className="mt-1 text-xs text-muted">Your search stays on this device.</Text>
            </View>
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              icon={users.length ? "search-outline" : "people-outline"}
              title={users.length ? "No matches found" : "No users saved yet"}
              description={
                users.length
                  ? "Try another name, email, phone number, or organization."
                  : "Add a user profile first. New profiles are stored locally on this device."
              }
              action={
                !users.length ? (
                  <Pressable onPress={onAddUser} className="items-center rounded-xl bg-brand px-4 py-3">
                    <Text className="font-bold text-white">Add your first user</Text>
                  </Pressable>
                ) : undefined
              }
            />
          ) : (
            <View className="gap-2">
              {filteredUsers.map((user) => (
                <Pressable
                  key={user.id}
                  onPress={() => onSelectUser(user)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${user.name} for biometric verification`}
                >
                  <Surface className="p-3">
                    <UserRow user={user} />
                  </Surface>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View className="mt-6">
          <View className="flex-row items-start rounded-2xl bg-mint/60 p-4">
            <IconTile icon="finger-print-outline" size={36} />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-ink">Profile-specific matching</Text>
              <Text className="mt-1 text-xs leading-5 text-muted">
                Live face frames or a short voice sample are compared on this device with the selected profile's encrypted template.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </Page>
  );
}
