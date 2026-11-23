import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Avatar,
  EmptyState,
  IconTile,
  Page,
  PrimaryButton,
  SectionTitle,
  Surface,
} from "../components/UI";
import type { UserProfile } from "../types";

export function HomeScreen({
  users,
  onAddUser,
  onFindUser,
  onSelectUser,
}: {
  users: UserProfile[];
  onAddUser: () => void;
  onFindUser: () => void;
  onSelectUser: (user: UserProfile) => void;
}) {
  return (
    <Page>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-5 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand">
              <Ionicons name="finger-print-outline" size={27} color="white" />
            </View>
            <View className="ml-3">
              <Text className="text-xs font-bold tracking-[1.5px] text-brand">BIOMATIC</Text>
              <Text className="mt-1 text-sm font-medium text-muted">Your private directory</Text>
            </View>
          </View>
          <View className="flex-row items-center rounded-full border border-line bg-white px-3 py-2">
            <Ionicons name="lock-closed" size={13} color="#176B57" />
            <Text className="ml-1.5 text-[10px] font-bold text-brand">ON DEVICE</Text>
          </View>
        </View>

        <View className="overflow-hidden rounded-[28px] bg-[#15352E] p-5">
          <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[24px] border-white/5" />
          <View className="absolute right-8 top-10 h-16 w-16 rounded-full border border-white/10" />
          <View className="flex-row items-center self-start rounded-full bg-white/10 px-3 py-1.5">
            <View className="mr-2 h-1.5 w-1.5 rounded-full bg-[#9FE0BD]" />
            <Text className="text-[10px] font-bold tracking-[1px] text-[#C8EAD7]">
              PRIVATE BY DESIGN
            </Text>
          </View>
          <Text className="mt-3 max-w-[270px] text-[25px] font-extrabold leading-[30px] text-white">
            A secure home for your people.
          </Text>
          <Text className="mt-2 max-w-[270px] text-sm leading-5 text-white/75">
            Manage local profiles and explore on-device face and voice matching.
          </Text>
          <View className="mt-4 flex-row items-center">
            <Ionicons name="shield-checkmark-outline" size={15} color="#BEE9D2" />
            <Text className="ml-2 text-xs font-semibold text-[#BEE9D2]">
              Encrypted local profiles
            </Text>
          </View>
        </View>

        <View className="mt-6">
          <SectionTitle title="Your directory" />
          <View className="flex-row gap-3">
            <View
              className="flex-1 justify-between rounded-[24px] border border-line bg-white p-4"
              style={{ height: 142 }}
            >
              <View className="flex-row items-center">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-canvas">
                  <Ionicons name="people-outline" size={19} color="#176B57" />
                </View>
                <Text
                  className="ml-2.5 flex-1 text-[10px] font-bold tracking-[0.5px] text-muted"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  SAVED PROFILES
                </Text>
              </View>
              <View className="mt-4 flex-row items-baseline">
                <Text className="text-[34px] font-extrabold leading-10 text-ink">
                  {users.length}
                </Text>
                <Text className="ml-2 text-xs font-medium text-muted">
                  {users.length === 1 ? "profile" : "profiles"}
                </Text>
              </View>
              <Text className="mt-1 text-xs text-muted">Stored on this device</Text>
            </View>

            <Pressable
              onPress={onFindUser}
              accessibilityRole="button"
              accessibilityLabel="Find a saved user"
              className="flex-1"
              style={{ height: 142 }}
            >
              <View className="flex-1 justify-between rounded-[24px] bg-brand p-4">
                <View className="flex-row items-center justify-between">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Ionicons name="search" size={18} color="white" />
                  </View>
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-white/15">
                    <Ionicons name="arrow-forward" size={14} color="white" />
                  </View>
                </View>
                <View className="mt-4">
                  <Text className="text-base font-bold text-white">Find a user</Text>
                  <Text className="mt-1 text-xs leading-4 text-white/75">
                    Search your directory
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>
        </View>

        <View className="mt-4">
          <PrimaryButton title="Add a user" icon="person-add-outline" onPress={onAddUser} />
        </View>

        <View className="mt-8">
          <SectionTitle
            title="Recently added"
            action={users.length ? "View all" : undefined}
            onAction={onFindUser}
          />
          {users.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Your directory is empty"
              description="Add a demo profile to get started. User details stay in encrypted local storage."
              action={
                <PrimaryButton
                  title="Create first profile"
                  icon="add"
                  onPress={onAddUser}
                />
              }
            />
          ) : (
            <View className="gap-2.5">
              {users.slice(0, 3).map((user) => (
                <Pressable
                  key={user.id}
                  onPress={() => onSelectUser(user)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${user.name}'s profile`}
                  className="active:opacity-80"
                >
                  <Surface className="p-3.5">
                    <UserRow user={user} />
                  </Surface>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View className="mt-6 flex-row items-center rounded-2xl bg-mint/60 p-4">
          <IconTile icon="finger-print-outline" size={38} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-ink">Local biometrics, private by design</Text>
            <Text className="mt-1 text-xs leading-4 text-muted">
              Templates and demo fingertip photos are encrypted locally. Fingertip photos do not authenticate.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Page>
  );
}

export function UserRow({
  user,
  trailing = "chevron-forward",
}: {
  user: UserProfile;
  trailing?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="flex-row items-center">
      <Avatar name={user.name} photoDataUrl={user.photoDataUrl} />
      <View className="ml-3 flex-1">
        <Text className="font-bold text-ink">{user.name}</Text>
        <Text className="mt-1 text-sm text-muted" numberOfLines={1}>
          {user.organization || user.email}
        </Text>
      </View>
      <Ionicons name={trailing} size={18} color="#72807C" />
    </View>
  );
}
