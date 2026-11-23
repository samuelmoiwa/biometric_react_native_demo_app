import "./global.css";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Page } from "./src/components/UI";
import { AddUserScreen } from "./src/screens/AddUserScreen";
import { FindUserScreen } from "./src/screens/FindUserScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import {
  completeOnboarding,
  createProfile,
  deleteProfile,
  getProfileBiometrics,
  hasCompletedOnboarding,
  listProfiles,
} from "./src/storage";
import type { NewUserProfile, UserProfile } from "./src/types";

type Tab = "home" | "find";
type Screen = Tab | "add";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
        <AppContent />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabPosition = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(tabPosition, {
      toValue: activeTab === "home" ? 0 : 1,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [activeTab, tabPosition]);

  async function loadApp() {
    setIsReady(false);
    setLoadError(null);
    try {
      const [onboardingComplete, savedProfiles] = await Promise.all([
        hasCompletedOnboarding(),
        listProfiles(),
      ]);
      setHasOnboarded(onboardingComplete);
      setProfiles(savedProfiles);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The local database could not be opened.");
    } finally {
      setIsReady(true);
    }
  }

  useEffect(() => {
    void loadApp();
  }, []);

  async function beginDemo() {
    try {
      await completeOnboarding();
      setHasOnboarded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not save onboarding preferences.");
    }
  }

  async function saveProfile(profile: NewUserProfile) {
    const savedProfile = await createProfile(profile);
    setProfiles((current) => [savedProfile, ...current]);
    setScreen("home");
    setActiveTab("home");
  }

  async function removeProfile(id: string) {
    await deleteProfile(id);
    setProfiles((current) => current.filter((profile) => profile.id !== id));
    setSelectedProfile(null);
  }

  function showProfile(profile: UserProfile) {
    setSelectedProfile(profile);
  }

  function navigate(tab: Tab) {
    setSelectedProfile(null);
    setScreen(tab);
    setActiveTab(tab);
  }

  if (!isReady) {
    return (
      <Page className="items-center justify-center">
        <StatusBar style="dark" />
        <View className="h-20 w-20 items-center justify-center rounded-[26px] bg-brand">
          <Ionicons name="finger-print-outline" size={44} color="white" />
        </View>
        <ActivityIndicator className="mt-7" color="#176B57" size="large" />
        <Text className="mt-4 text-sm font-medium text-muted">Preparing your secure space…</Text>
      </Page>
    );
  }

  if (!hasOnboarded) {
    return (
      <>
        <StatusBar style="dark" />
        <OnboardingScreen onContinue={beginDemo} />
        {loadError ? (
          <View className="absolute bottom-3 left-5 right-5 rounded-xl bg-red-50 p-3">
            <Text className="text-center text-sm text-red-700">{loadError}</Text>
          </View>
        ) : null}
      </>
    );
  }

  if (loadError) {
    return (
      <Page className="items-center justify-center px-8">
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={48} color="#B42318" />
        <Text className="mt-4 text-center text-xl font-bold text-ink">Could not open your local data</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">{loadError}</Text>
        <Pressable onPress={() => void loadApp()} className="mt-6 rounded-xl bg-brand px-6 py-3">
          <Text className="font-bold text-white">Try again</Text>
        </Pressable>
      </Page>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <View className="flex-1">
        {selectedProfile ? (
          <ProfileScreen
            user={selectedProfile}
            onBack={() => setSelectedProfile(null)}
            onDelete={() => removeProfile(selectedProfile.id)}
            onLoadBiometrics={() => getProfileBiometrics(selectedProfile.id)}
          />
        ) : screen === "add" ? (
          <AddUserScreen
            onCancel={() => setScreen(activeTab)}
            onSave={saveProfile}
          />
        ) : screen === "find" ? (
          <FindUserScreen
            users={profiles}
            onSelectUser={showProfile}
            onAddUser={() => setScreen("add")}
          />
        ) : (
          <HomeScreen
            users={profiles}
            onAddUser={() => setScreen("add")}
            onFindUser={() => navigate("find")}
            onSelectUser={showProfile}
          />
        )}
      </View>
      {!selectedProfile && screen !== "add" ? (
        <View className="px-5 pb-2 pt-2">
          <View
            onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}
            className="relative h-[66px] flex-row items-center overflow-hidden rounded-[26px] border border-line bg-white px-2"
            style={{
              shadowColor: "#10231F",
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            {tabBarWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                className="absolute bottom-1.5 top-1.5 rounded-[20px] bg-[#EAF5EF]"
                style={{
                  left: 8,
                  width: (tabBarWidth - 16) / 2,
                  transform: [
                    {
                      translateX: tabPosition.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, (tabBarWidth - 16) / 2],
                      }),
                    },
                  ],
                }}
              />
            ) : null}
            <TabButton
              icon="home-outline"
              activeIcon="home"
              label="Home"
              active={activeTab === "home"}
              onPress={() => navigate("home")}
            />
            <TabButton
              icon="search-outline"
              activeIcon="search"
              label="Find users"
              active={activeTab === "find"}
              onPress={() => navigate("find")}
            />
          </View>
        </View>
      ) : null}
    </>
  );
}

function TabButton({
  icon,
  activeIcon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      className="z-10 flex-1 active:opacity-80"
    >
      <View className="min-h-[54px] flex-row items-center justify-center rounded-2xl px-3">
        <Ionicons name={active ? activeIcon : icon} size={20} color={active ? "#176B57" : "#72807C"} />
        <Text
          className={`ml-2 text-sm font-bold ${
            active ? "text-brand" : "text-muted"
          }`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
