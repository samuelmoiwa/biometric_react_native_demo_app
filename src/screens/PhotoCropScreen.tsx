import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { Page, PrimaryButton } from "../components/UI";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const OUTPUT_SIZE = 512;

type Props = {
  uri: string;
  width: number;
  height: number;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(event: GestureResponderEvent): number {
  const [a, b] = event.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export function PhotoCropScreen({ uri, width, height, onCancel, onConfirm }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const size = Math.min(screenWidth - 40, 360);
  // Scale at which the image exactly covers the square viewport.
  const base = size / Math.min(width, height);
  const imageWidth = width * base;
  const imageHeight = height * base;

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const view = useRef({ zoom: 1, x: 0, y: 0 });
  const gesture = useRef({
    startZoom: 1,
    startX: 0,
    startY: 0,
    startDistance: 0,
    pinching: false,
  });

  function limit(nextZoom: number, x: number, y: number) {
    const maxX = Math.max(0, (imageWidth * nextZoom - size) / 2);
    const maxY = Math.max(0, (imageHeight * nextZoom - size) / 2);
    return { zoom: nextZoom, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }

  function apply(next: { zoom: number; x: number; y: number }) {
    view.current = next;
    setZoom(next.zoom);
    setOffset({ x: next.x, y: next.y });
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          setDragging(true);
          gesture.current = {
            startZoom: view.current.zoom,
            startX: view.current.x,
            startY: view.current.y,
            startDistance: 0,
            pinching: false,
          };
        },
        onPanResponderMove: (event, state) => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            const distance = touchDistance(event);
            if (!gesture.current.pinching) {
              gesture.current = {
                startZoom: view.current.zoom,
                startX: view.current.x,
                startY: view.current.y,
                startDistance: distance,
                pinching: true,
              };
              return;
            }
            const nextZoom = clamp(
              (gesture.current.startZoom * distance) / gesture.current.startDistance,
              MIN_ZOOM,
              MAX_ZOOM
            );
            apply(limit(nextZoom, view.current.x, view.current.y));
            return;
          }
          if (gesture.current.pinching) {
            // One finger lifted: continue panning from the current position.
            gesture.current = {
              startZoom: view.current.zoom,
              startX: view.current.x,
              startY: view.current.y,
              startDistance: 0,
              pinching: false,
            };
            return;
          }
          apply(
            limit(
              view.current.zoom,
              gesture.current.startX + state.dx,
              gesture.current.startY + state.dy
            )
          );
        },
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    // The responder reads everything from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageWidth, imageHeight, size]
  );

  function changeZoom(delta: number) {
    const nextZoom = clamp(view.current.zoom + delta, MIN_ZOOM, MAX_ZOOM);
    apply(limit(nextZoom, view.current.x, view.current.y));
  }

  async function confirm() {
    if (saving) return;
    setSaving(true);
    try {
      const scale = base * view.current.zoom;
      const side = size / scale;
      const originX = clamp(width / 2 - view.current.x / scale - side / 2, 0, Math.max(0, width - side));
      const originY = clamp(height / 2 - view.current.y / scale - side / 2, 0, Math.max(0, height - side));
      const context = ImageManipulator.ImageManipulator.manipulate(uri);
      const rendered = await context
        .crop({
          originX: Math.round(originX),
          originY: Math.round(originY),
          width: Math.round(Math.min(side, width)),
          height: Math.round(Math.min(side, height)),
        })
        .resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE })
        .renderAsync();
      const saved = await rendered.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.8,
        base64: true,
      });
      if (!saved.base64) throw new Error("The cropped photo could not be read.");
      onConfirm(`data:image/jpeg;base64,${saved.base64}`);
    } catch (error) {
      Alert.alert(
        "Could not crop photo",
        error instanceof Error ? error.message : "An unexpected error occurred."
      );
    } finally {
      setSaving(false);
    }
  }

  const zoomPercent = ((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100;

  return (
    <Page>
      <View className="flex-1 px-5 pt-3">
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable
            onPress={onCancel}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel cropping"
            className="h-10 w-10 items-center justify-center rounded-full bg-white"
          >
            <Ionicons name="close" size={20} color="#14211F" />
          </Pressable>
          <Text className="text-base font-extrabold text-ink">Crop profile photo</Text>
          <View className="h-10 w-10" />
        </View>

        <Text className="mb-4 text-center text-sm leading-5 text-muted">
          Drag to reposition and pinch to zoom. The circle is what shows on the profile.
        </Text>

        <View className="items-center">
          <View
            {...responder.panHandlers}
            className="overflow-hidden rounded-3xl bg-black"
            style={{ width: size, height: size }}
          >
            <Image
              source={{ uri }}
              resizeMode="cover"
              style={{
                position: "absolute",
                width: imageWidth,
                height: imageHeight,
                left: (size - imageWidth) / 2,
                top: (size - imageHeight) / 2,
                transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale: zoom }],
              }}
            />
            {/* Dimmed area outside the circle. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -size,
                top: -size,
                width: size * 3,
                height: size * 3,
                borderRadius: size * 1.5,
                borderWidth: size,
                borderColor: "rgba(0,0,0,0.58)",
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.95)",
              }}
            />
            {dragging ? (
              <>
                <View pointerEvents="none" style={{ position: "absolute", left: size / 3, top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
                <View pointerEvents="none" style={{ position: "absolute", left: (size * 2) / 3, top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
                <View pointerEvents="none" style={{ position: "absolute", top: size / 3, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
                <View pointerEvents="none" style={{ position: "absolute", top: (size * 2) / 3, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
              </>
            ) : null}
          </View>
        </View>

        <View className="mt-6 flex-row items-center rounded-2xl border border-line bg-white px-3 py-3">
          <Pressable
            onPress={() => changeZoom(-0.4)}
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
            className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
          >
            <Ionicons name="remove" size={20} color="#14211F" />
          </Pressable>
          <View className="mx-3 h-2 flex-1 overflow-hidden rounded-full bg-canvas">
            <View className="h-full rounded-full bg-brand" style={{ width: `${zoomPercent}%` }} />
          </View>
          <Pressable
            onPress={() => changeZoom(0.4)}
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
            className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
          >
            <Ionicons name="add" size={20} color="#14211F" />
          </Pressable>
          <Pressable
            onPress={() => apply({ zoom: 1, x: 0, y: 0 })}
            accessibilityRole="button"
            accessibilityLabel="Reset crop"
            className="ml-3 h-10 flex-row items-center justify-center rounded-xl bg-canvas px-3"
          >
            <Ionicons name="refresh" size={16} color="#176B57" />
            <Text className="ml-1 text-xs font-bold text-brand">Reset</Text>
          </Pressable>
        </View>

        <View className="mt-auto pb-6 pt-6">
          <PrimaryButton title="Use this photo" icon="checkmark" onPress={() => void confirm()} loading={saving} />
          {saving ? (
            <View className="mt-3 flex-row items-center justify-center">
              <ActivityIndicator size="small" color="#176B57" />
              <Text className="ml-2 text-xs text-muted">Cropping…</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Page>
  );
}
