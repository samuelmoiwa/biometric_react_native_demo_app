import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput } from "react-native-vision-camera";
import { scheduleOnRN } from "react-native-worklets";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Notice, Page, PrimaryButton } from "../components/UI";
import {
  analyzePulse,
  CROP_H,
  CROP_SIZE,
  CROP_W,
  detectFingers,
  extractCrop,
  extractTemplate,
  FINGERPRINT_MATCH_THRESHOLD,
  FINGERPRINT_MIN_MINUTIAE,
  FINGERPRINT_MIN_QUALITY,
  fingerMetrics,
  FOCUS_MIN,
  isPulse,
  LIVE_MIN_SAMPLES,
  LIVE_WINDOW_MS,
  padRect,
  verifyFingerprints,
} from "../biometrics/fingerprint";
import {
  FINGERPRINT_STEPS,
  FINGERTIP_FINGERS,
  type FingerprintStepId,
  type FingerprintTemplate,
} from "../types";

type Props =
  | {
      mode: "enroll";
      onComplete: (templates: FingerprintTemplate[]) => void;
      onCancel: () => void;
    }
  | {
      mode: "verify";
      expectedTemplates: FingerprintTemplate[];
      onVerified: () => void;
      onCancel: () => void;
    };

/** Show pulse / focus numbers under the status line while tuning thresholds. */
const SHOW_DEBUG = true;

type Box = { x: number; y: number; w: number; h: number; state: number };
type Engine = {
  stable: number;
  prev: number[];
  window: number[][];
  times: number[];
};

const COLORS = ["#FF4D4F", "#FFC247", "#2DD36F"];

function makeEngine(): Engine {
  return { stable: 0, prev: [], window: [], times: [] };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function messageFor(status: string, expected: number): string {
  switch (status) {
    case "noHand":
      return expected > 1
        ? "Hold four fingers together, pointing up, pads facing the camera."
        : "Hold your thumb up with the pad facing the camera.";
    case "wrongCount":
      return expected > 1
        ? "Show exactly four fingers, pointing up, with the tips visible."
        : "Show only one thumb, pointing up.";
    case "tooFar":
      return "Move closer so the fingertips fill the frame.";
    case "tooClose":
      return "Move back a little and keep every fingertip fully in view.";
    case "moving":
      return "Hold still…";
    case "analyzing":
      return "Checking that this is a live finger. Keep still.";
    case "notLive":
      return "Live finger not detected. Photos and screens are rejected.";
    case "dark":
      return "Too dark. Move to brighter, even light.";
    case "bright":
      return "Too bright. Avoid glare and direct flash.";
    case "blurry":
      return "Not sharp enough. Adjust the distance until the ridges look crisp.";
    case "capture":
      return "Live finger confirmed. Capturing…";
    default:
      return "Position your fingertips inside the frames.";
  }
}

function FingerFrame({ index, boxes }: { index: number; boxes: SharedValue<Box[]> }) {
  const style = useAnimatedStyle(() => {
    const box = boxes.value[index];
    if (!box) return { opacity: 0 };
    const color = box.state === 2 ? "#2DD36F" : box.state === 1 ? "#FFC247" : "#FF4D4F";
    return {
      opacity: 1,
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      borderColor: color,
      backgroundColor: `${color}22`,
      borderTopLeftRadius: box.w / 2,
      borderTopRightRadius: box.w / 2,
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", borderWidth: 3, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
        style,
      ]}
    />
  );
}

export function FingertipCaptureScreen(props: Props) {
  const isEnroll = props.mode === "enroll";
  const [stepIndex, setStepIndex] = useState(0);
  const [verifyCount, setVerifyCount] = useState<4 | 1>(4);
  const [phase, setPhase] = useState<"capture" | "review">("capture");
  const [stepResults, setStepResults] = useState<
    Partial<Record<FingerprintStepId, FingerprintTemplate[]>>
  >({});
  const [processing, setProcessing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [status, setStatus] = useState("idle");
  const [tone, setTone] = useState(0);
  const [debug, setDebug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const permissionRequestedRef = useRef(false);
  const busyRef = useRef(false);
  const retakeRef = useRef(false);
  const completedRef = useRef(false);
  const handlerRef = useRef<(buffer: ArrayBuffer, count: number) => Promise<void>>(
    async () => undefined
  );

  const viewSize = useSharedValue({ w: 0, h: 0 });
  const config = useSharedValue({ expected: 4, active: true });
  const boxes = useSharedValue<Box[]>([]);
  const progress = useSharedValue(0);
  const engine = useSharedValue<Engine>(makeEngine());
  const lastStatus = useSharedValue("");
  const lastReport = useSharedValue(0);
  const errorSent = useSharedValue(false);

  const step = FINGERPRINT_STEPS[stepIndex];
  const expected = isEnroll ? step.expected : verifyCount;

  const resetEngine = useCallback(() => {
    engine.value = makeEngine();
    boxes.value = [];
    progress.value = 0;
    lastStatus.value = "";
    errorSent.value = false;
    setStatus("idle");
    setTone(0);
  }, [engine, boxes, progress, lastStatus, errorSent]);

  useEffect(() => {
    resetEngine();
  }, [expected, stepIndex, phase, resetEngine]);

  useEffect(() => {
    config.value = {
      expected,
      active: phase === "capture" && !processing && flash === null,
    };
  }, [expected, phase, processing, flash, config]);

  useEffect(() => {
    if (hasPermission || permissionRequestedRef.current) return;
    permissionRequestedRef.current = true;
    void requestPermission()
      .then((granted) => {
        if (!granted) setCameraError("Camera permission was not granted.");
      })
      .catch((e: unknown) => setCameraError(getErrorMessage(e)));
  }, [hasPermission, requestPermission]);

  const onStatus = useCallback((nextStatus: string, nextTone: number, snr: number, focus: number) => {
    setStatus(nextStatus);
    setTone(nextTone);
    setDebug(`Pulse ${snr.toFixed(1)} · Sharpness ${focus.toFixed(2)}`);
  }, []);

  const onProcessingError = useCallback((message: string) => {
    setCameraError(message);
  }, []);

  const onCaptured = useCallback((buffer: ArrayBuffer, count: number) => {
    void handlerRef.current(buffer, count);
  }, []);

  async function handleCapture(buffer: ArrayBuffer, count: number) {
    if (busyRef.current || completedRef.current) return;
    busyRef.current = true;
    setProcessing(true);
    setError(null);
    try {
      const gray = new Uint8Array(buffer);
      const extractions: ReturnType<typeof extractTemplate>[] = [];
      for (let i = 0; i < count; i++) {
        // Yield so the UI can paint between fingers.
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
        extractions.push(extractTemplate(gray.subarray(i * CROP_SIZE, (i + 1) * CROP_SIZE)));
      }

      if (props.mode === "enroll") {
        const currentStep = FINGERPRINT_STEPS[stepIndex];
        const weak = extractions
          .map((extraction, index) => ({ extraction, index }))
          .filter(
            ({ extraction }) =>
              extraction.count < FINGERPRINT_MIN_MINUTIAE ||
              extraction.quality < FINGERPRINT_MIN_QUALITY
          );
        if (weak.length > 0) {
          const names = weak
            .map(({ index }) => FINGERTIP_FINGERS.find((f) => f.id === currentStep.fingerIds[index])?.label)
            .filter(Boolean)
            .join(", ");
          throw new Error(
            `Not enough ridge detail for: ${names}. Clean and dry your fingers, use bright even light and hold steady.`
          );
        }
        const capturedAt = new Date().toISOString();
        const templates: FingerprintTemplate[] = extractions.map((extraction, index) => ({
          fingerId: currentStep.fingerIds[index],
          width: CROP_W,
          height: CROP_H,
          minutiae: extraction.minutiae,
          quality: extraction.quality,
          capturedAt,
        }));
        const next = { ...stepResults, [currentStep.id]: templates };
        setStepResults(next);
        setFlash(`${currentStep.short} captured`);
        await new Promise<void>((resolve) => setTimeout(resolve, 700));
        setFlash(null);
        if (retakeRef.current) {
          retakeRef.current = false;
          setPhase("review");
        } else {
          const nextIndex = FINGERPRINT_STEPS.findIndex((s) => !next[s.id]);
          if (nextIndex === -1) setPhase("review");
          else setStepIndex(nextIndex);
        }
      } else {
        const result = verifyFingerprints(
          extractions.map((extraction) => ({ minutiae: extraction.minutiae })),
          props.expectedTemplates
        );
        if (result.verified) {
          completedRef.current = true;
          props.onVerified();
          return;
        }
        const scores = result.results.map((r) => r.score.toFixed(2)).join(", ");
        throw new Error(
          `Fingerprint did not match this profile. Match scores: ${scores} (each needs ${FINGERPRINT_MATCH_THRESHOLD.toFixed(2)} or more, ${result.required} finger${result.required === 1 ? "" : "s"} required). Try again.`
        );
      }
    } catch (captureError) {
      setError(getErrorMessage(captureError));
      resetEngine();
    } finally {
      busyRef.current = false;
      setProcessing(false);
    }
  }
  handlerRef.current = handleCapture;

  const frameOutput = useFrameOutput({
    targetResolution: { width: 1920, height: 1080 },
    pixelFormat: "rgb",
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      "worklet";
      try {
        const cfg = config.value;
        if (!cfg.active) return;

        const now = Date.now();
        const data = new Uint8Array(frame.getPixelBuffer());
        const fw = frame.width;
        const fh = frame.height;
        const stride = frame.bytesPerRow;
        const bgra = String(frame.pixelFormat).indexOf("bgra") >= 0;
        const detection = detectFingers(data, fw, fh, stride, bgra, cfg.expected);
        const fingers = detection.fingers;

        const vs = viewSize.value;
        const scale = vs.w > 0 ? Math.max(vs.w / fw, vs.h / fh) : 1;
        const ox = (vs.w - fw * scale) / 2;
        const oy = (vs.h - fh * scale) / 2;

        let status: string = detection.status;
        let state = 0;
        let snr = 0;
        let focusMin = 0;
        let eng = engine.value;
        let captureNow = false;
        let rects: { x: number; y: number; w: number; h: number }[] = [];

        if (detection.status === "ok") {
          rects = fingers.map((f) => padRect(f));
          const current: number[] = [];
          let movement = 0;
          for (let i = 0; i < fingers.length; i++) {
            const f = fingers[i];
            const cx = (f.left + f.right) / 2;
            current.push(cx, f.tipY);
            if (eng.prev.length === fingers.length * 2) {
              const m = (Math.abs(cx - eng.prev[i * 2]) + Math.abs(f.tipY - eng.prev[i * 2 + 1])) / f.width;
              if (m > movement) movement = m;
            } else {
              movement = 1;
            }
          }

          if (movement > 0.05) {
            const empty: number[][] = [];
            for (let i = 0; i < fingers.length; i++) empty.push([]);
            eng = { stable: 0, prev: current, window: empty, times: [] };
            status = "moving";
            state = 1;
          } else {
            const windowValues: number[][] = eng.window.length === fingers.length ? eng.window : [];
            if (windowValues.length === 0) for (let i = 0; i < fingers.length; i++) windowValues.push([]);
            const times = eng.times.slice();
            let meanLow = 255;
            let meanHigh = 0;
            focusMin = 1e9;
            const nextWindow: number[][] = [];
            for (let i = 0; i < fingers.length; i++) {
              const metrics = fingerMetrics(data, stride, fw, fh, rects[i]);
              const series = windowValues[i].slice();
              series.push(metrics.mean);
              nextWindow.push(series);
              if (metrics.mean < meanLow) meanLow = metrics.mean;
              if (metrics.mean > meanHigh) meanHigh = metrics.mean;
              if (metrics.focus < focusMin) focusMin = metrics.focus;
            }
            times.push(now);
            while (times.length > 1 && now - times[0] > LIVE_WINDOW_MS) {
              times.shift();
              for (let i = 0; i < nextWindow.length; i++) nextWindow[i].shift();
            }
            eng = { stable: eng.stable + 1, prev: current, window: nextWindow, times };

            const elapsed = times[times.length - 1] - times[0];
            progress.value = Math.min(1, elapsed / LIVE_WINDOW_MS);
            if (elapsed < LIVE_WINDOW_MS * 0.9 || times.length < LIVE_MIN_SAMPLES) {
              status = "analyzing";
              state = 1;
            } else {
              let passes = 0;
              let snrSum = 0;
              for (let i = 0; i < nextWindow.length; i++) {
                const pulse = analyzePulse(nextWindow[i], times);
                snrSum += pulse.ratio;
                if (isPulse(pulse)) passes++;
              }
              snr = snrSum / nextWindow.length;
              const live = passes >= Math.ceil(nextWindow.length / 2);
              if (!live) {
                status = "notLive";
                state = 0;
              } else if (meanLow < 55) {
                status = "dark";
                state = 1;
              } else if (meanHigh > 225) {
                status = "bright";
                state = 1;
              } else if (focusMin < FOCUS_MIN) {
                status = "blurry";
                state = 1;
              } else {
                status = "capture";
                state = 2;
                captureNow = true;
              }
            }
          }
        } else {
          eng = { stable: 0, prev: [], window: [], times: [] };
          progress.value = 0;
          state = 0;
          // Draw the frames of whatever was found so the user can see why it is red.
          for (let i = 0; i < fingers.length; i++) rects.push({ x: fingers[i].left, y: fingers[i].tipY, w: 0, h: 0 });
        }

        engine.value = eng;

        const drawn: Box[] = [];
        if (vs.w > 0) {
          for (let i = 0; i < fingers.length; i++) {
            const f = fingers[i];
            drawn.push({
              x: f.left * scale + ox,
              y: (f.tipY - 0.04 * f.width) * scale + oy,
              w: f.width * scale,
              h: 1.25 * f.width * scale,
              state,
            });
          }
        }
        boxes.value = drawn;

        if (captureNow) {
          const out = new Uint8Array(CROP_SIZE * fingers.length);
          for (let i = 0; i < fingers.length; i++) {
            extractCrop(data, stride, fw, fh, rects[i], out, i * CROP_SIZE);
          }
          config.value = { expected: cfg.expected, active: false };
          scheduleOnRN(onCaptured, out.buffer, fingers.length);
        }

        if (status !== lastStatus.value || now - lastReport.value > 350) {
          lastStatus.value = status;
          lastReport.value = now;
          scheduleOnRN(onStatus, status, state, snr, focusMin === 1e9 ? 0 : focusMin);
        }
      } catch (frameError) {
        if (!errorSent.value) {
          errorSent.value = true;
          scheduleOnRN(
            onProcessingError,
            frameError instanceof Error ? frameError.message : "The camera frame could not be processed."
          );
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const progressStyle = useAnimatedStyle(() => ({ width: `${Math.round(progress.value * 100)}%` }));

  function onCameraLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    viewSize.value = { w: width, h: height };
  }

  function retake(index: number) {
    retakeRef.current = true;
    setError(null);
    setStepIndex(index);
    setPhase("capture");
  }

  const toneColor = COLORS[tone] ?? COLORS[0];
  const screenError = error ?? cameraError;
  const allCaptured = FINGERPRINT_STEPS.every((s) => stepResults[s.id]);

  if (isEnroll && phase === "review") {
    return (
      <Page>
        <View className="flex-1 bg-[#10231F]">
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              onPress={props.onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel fingerprint enrollment"
              className="h-10 w-10 items-center justify-center rounded-full bg-black/35"
            >
              <Ionicons name="close" size={20} color="white" />
            </Pressable>
            <Text className="mt-5 text-2xl font-extrabold text-white">Review fingerprints</Text>
            <Text className="mt-2 text-sm leading-5 text-white/75">
              All ten fingers were read from live camera images. Retake any set that looks weak.
            </Text>

            <View className="mt-6 gap-3">
              {FINGERPRINT_STEPS.map((s, index) => {
                const templates = stepResults[s.id] ?? [];
                const average = templates.length
                  ? Math.round(templates.reduce((sum, t) => sum + t.quality, 0) / templates.length)
                  : 0;
                return (
                  <View key={s.id} className="rounded-2xl border border-white/15 bg-white/5 p-4">
                    <View className="flex-row items-center">
                      <Ionicons name="checkmark-circle" size={22} color="#9FE0BD" />
                      <View className="ml-3 flex-1">
                        <Text className="text-sm font-bold text-white">{s.label}</Text>
                        <Text className="mt-1 text-xs text-white/65">
                          {templates.length} finger{templates.length === 1 ? "" : "s"} · quality {average}%
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => retake(index)}
                        accessibilityRole="button"
                        accessibilityLabel={`Retake ${s.label}`}
                        className="rounded-xl border border-white/20 px-3 py-2"
                      >
                        <Text className="text-xs font-semibold text-white">Retake</Text>
                      </Pressable>
                    </View>
                    <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <View className="h-full rounded-full bg-[#9FE0BD]" style={{ width: `${average}%` }} />
                    </View>
                    <Text className="mt-3 text-xs leading-5 text-white/55">
                      {templates
                        .map((t) => FINGERTIP_FINGERS.find((f) => f.id === t.fingerId)?.label ?? t.fingerId)
                        .join(" · ")}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View className="mt-6">
              <PrimaryButton
                title="Use these fingerprints"
                icon="checkmark"
                disabled={!allCaptured}
                onPress={() => {
                  if (props.mode !== "enroll") return;
                  props.onComplete(FINGERPRINT_STEPS.flatMap((s) => stepResults[s.id] ?? []));
                }}
              />
            </View>
          </ScrollView>
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <View className="flex-1 bg-[#10231F]">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={props.onCancel}
            disabled={processing}
            accessibilityRole="button"
            accessibilityLabel="Cancel fingerprint capture"
            className="h-10 w-10 items-center justify-center rounded-full bg-black/35"
          >
            <Ionicons name="close" size={20} color="white" />
          </Pressable>

          <Text className="mt-5 text-2xl font-extrabold text-white">
            {isEnroll ? "Enroll fingerprints" : "Verify with fingerprint"}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-white/75">
            {isEnroll
              ? `${step.label}: step ${stepIndex + 1} of ${FINGERPRINT_STEPS.length}. Capture starts by itself when the frames turn green.`
              : "Show your fingers to the camera. Matching runs on this device against the enrolled fingerprints."}
          </Text>

          {isEnroll ? (
            <View className="mt-4 flex-row gap-2">
              {FINGERPRINT_STEPS.map((s, index) => {
                const done = Boolean(stepResults[s.id]);
                const current = index === stepIndex;
                return (
                  <View
                    key={s.id}
                    className={`flex-1 items-center rounded-xl border px-1 py-2 ${
                      current ? "border-[#9FE0BD] bg-white/10" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <Ionicons
                      name={done ? "checkmark-circle" : current ? "radio-button-on" : "ellipse-outline"}
                      size={16}
                      color={done || current ? "#9FE0BD" : "#FFFFFF66"}
                    />
                    <Text className="mt-1 text-center text-[10px] font-semibold text-white/80" numberOfLines={1}>
                      {s.short}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="mt-4 flex-row gap-2">
              {([4, 1] as const).map((count) => (
                <Pressable
                  key={count}
                  onPress={() => setVerifyCount(count)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: verifyCount === count }}
                  className={`flex-1 items-center rounded-xl border py-3 ${
                    verifyCount === count ? "border-[#9FE0BD] bg-white/10" : "border-white/10 bg-white/5"
                  }`}
                >
                  <Text className="text-sm font-semibold text-white">
                    {count === 4 ? "Four fingers" : "One thumb"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View
            onLayout={onCameraLayout}
            className="mt-4 w-full overflow-hidden rounded-[28px] border border-white/20 bg-black"
            style={{ aspectRatio: 0.66 }}
          >
            {device && hasPermission && phase === "capture" ? (
              <Camera
                style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
                device={device}
                isActive
                outputs={[frameOutput]}
                onError={(e) => setCameraError(e.message)}
              />
            ) : (
              <View className="flex-1 items-center justify-center px-6">
                <Ionicons name="camera-outline" size={34} color="#BEE9D2" />
                <Text className="mt-3 text-center text-sm font-semibold text-white">
                  {!hasPermission ? "Camera access is required" : !device ? "No back camera found" : "Camera paused"}
                </Text>
              </View>
            )}

            {[0, 1, 2, 3].map((index) => (
              <FingerFrame key={index} index={index} boxes={boxes} />
            ))}

            <View className="absolute left-3 right-3 top-3 flex-row items-center rounded-2xl bg-black/60 px-3 py-2.5">
              <View className="mr-2.5 h-3 w-3 rounded-full" style={{ backgroundColor: toneColor }} />
              <Text className="flex-1 text-xs font-semibold leading-4 text-white">
                {flash ?? (processing ? "Reading ridge detail…" : messageFor(status, expected))}
              </Text>
              {processing ? <ActivityIndicator size="small" color="white" /> : null}
            </View>

            <View className="absolute bottom-3 left-3 right-3">
              {SHOW_DEBUG && debug ? (
                <Text className="mb-1.5 text-center text-[10px] text-white/60">{debug}</Text>
              ) : null}
              <View className="h-2 overflow-hidden rounded-full bg-white/15">
                <Animated.View className="h-full rounded-full" style={[{ backgroundColor: toneColor }, progressStyle]} />
              </View>
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-center">
            {[
              ["Not ready or not a live finger", 0],
              ["Checking", 1],
              ["Live and in position", 2],
            ].map(([label, index]) => (
              <View key={String(label)} className="mx-2 flex-row items-center">
                <View className="mr-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index as number] }} />
                <Text className="text-[10px] text-white/70">{label}</Text>
              </View>
            ))}
          </View>

          {screenError ? (
            <View className="mt-4">
              <Notice icon="alert-circle-outline" tone="amber">
                <Text className="text-sm font-bold text-ink">
                  {error ? "Fingerprint not accepted" : "Fingerprint capture unavailable"}
                </Text>
                <Text className="mt-1 text-sm leading-5 text-muted">{screenError}</Text>
              </Notice>
            </View>
          ) : null}

          <View className="mt-4">
            <Notice icon="information-circle-outline" tone="amber">
              <Text className="text-sm font-bold text-ink">Tips for a good read</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Keep fingers together, pointing up, pads facing the camera, about 10 to 15 cm away so the tips fill the
                width. Use bright, even light, clean dry fingers, and hold still for about three seconds.
              </Text>
            </Notice>
          </View>

          <Text className="mt-4 text-xs leading-5 text-white/55">
            Camera fingerprints are a demo and are far less reliable than a dedicated sensor. Do not use them as a
            security boundary. Only the minutiae template is stored; no fingertip images are kept.
          </Text>
        </ScrollView>
      </View>
    </Page>
  );
}
