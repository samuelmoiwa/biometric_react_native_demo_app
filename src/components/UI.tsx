import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function Page({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <View className={`flex-1 bg-canvas ${className}`}>{children}</View>;
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-base font-bold text-ink">{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          <Text className="text-sm font-semibold text-brand">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Surface({
  children,
  className = "",
  ...props
}: PropsWithChildren<{ className?: string }> & ViewProps) {
  return (
    <View
      className={`rounded-2xl border border-line bg-white p-4 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`min-h-14 flex-row items-center justify-center rounded-2xl px-5 ${
        disabled || loading ? "bg-brand/60" : "bg-brand"
      }`}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={19} color="white" /> : null}
          <Text className="ml-2 text-base font-bold text-white">{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-semibold text-ink">{label}</Text>
      <TextInput
        className="min-h-12 rounded-xl border border-line bg-white px-4 py-3 text-base text-ink"
        placeholderTextColor="#9AA49F"
        {...inputProps}
      />
      {hint ? <Text className="mt-1 text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}

export function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start py-3">
      <Ionicons name={icon} size={18} color="#72807C" />
      <View className="ml-3 flex-1">
        <Text className="text-xs font-medium text-muted">{label}</Text>
        <Text className="mt-1 text-sm font-semibold text-ink">{value}</Text>
      </View>
    </View>
  );
}

export function IconTile({
  icon,
  background = "bg-mint",
  color = "#176B57",
  size = 44,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  background?: string;
  color?: string;
  size?: number;
}) {
  return (
    <View
      className={`items-center justify-center rounded-2xl ${background}`}
      style={{ width: size, height: size }}
    >
      <Ionicons name={icon} size={size * 0.48} color={color} />
    </View>
  );
}

export function Notice({
  icon,
  children,
  tone = "green",
}: PropsWithChildren<{ icon: keyof typeof Ionicons.glyphMap; tone?: "green" | "amber" }>) {
  const colors =
    tone === "amber"
      ? "border-amber/40 bg-amber/10 text-ink"
      : "border-brand/15 bg-mint/60 text-ink";
  return (
    <View className={`flex-row rounded-2xl border p-4 ${colors}`}>
      <Ionicons
        name={icon}
        size={20}
        color={tone === "amber" ? "#A66A0A" : "#176B57"}
      />
      <View className="ml-3 flex-1">
        {children}
      </View>
    </View>
  );
}

export function Avatar({
  name,
  photoDataUrl,
  size = 48,
}: {
  name: string;
  photoDataUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (photoDataUrl) {
    return (
      <Image
        source={{ uri: photoDataUrl }}
        accessibilityLabel={`${name} profile photo`}
        className="rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <View
      className="items-center justify-center rounded-full bg-mint"
      style={{ width: size, height: size }}
    >
      <Text className="font-bold text-brand" style={{ fontSize: size * 0.31 }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center rounded-3xl border border-dashed border-line bg-white px-6 py-10">
      <IconTile icon={icon} size={58} />
      <Text className="mt-4 text-lg font-bold text-ink">{title}</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-muted">
        {description}
      </Text>
      {action ? <View className="mt-5 w-full">{action}</View> : null}
    </View>
  );
}
