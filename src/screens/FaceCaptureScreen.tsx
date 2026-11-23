import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput } from "react-native-vision-camera";
import {
  FaceRecognition,
  type FaceRecognizer,
  type FaceRecognizerOptions,
} from "react-native-vision-camera-face-recognizer";
import { scheduleOnRN } from "react-native-worklets";
import { Ionicons } from "@expo/vector-icons";
import { useSharedValue } from "react-native-reanimated";
import { Notice, Page } from "../components/UI";

type Props =
  | {
      mode: "enroll";
      onComplete: (template: ArrayBuffer) => void;
      onCancel: () => void;
    }
  | {
      mode: "verify";
      profileId: string;
      expectedTemplate: Uint8Array;
      onVerified: () => void;
      onCancel: () => void;
    };

const REQUIRED_FACE_SAMPLES = 3;
const FACE_RECOGNIZER_OPTIONS: FaceRecognizerOptions = {
  provider: "cpu",
  threads: 2,
  detection: {
    maxFaces: 1,
    threshold: 0.55,
    minFaceSize: 80,
    inputSize: 320,
  },
  recognition: {
    candidateRetrieval: "templateMax",
    threshold: 0.55,
    minimumMargin: 0.08,
    samplesPerDecision: 3,
    interval: 3,
    matchedInterval: 5,
    minFaceSize: 80,
  },
  tracking: {
    enabled: true,
    detectionInterval: 4,
  },
  liveness: {
    enabled: true,
    threshold: 0.8,
  },
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function FaceCaptureScreen(props: Props) {
  const [cameraPosition, setCameraPosition] = useState<"front" | "back">("front");
  const [recognizer, setRecognizer] = useState<FaceRecognizer | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [guidance, setGuidance] = useState(
    props.mode === "enroll"
      ? "Center your face, then slowly turn your head to capture different angles."
      : "Center your face in the frame and hold still while matching runs."
  );
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(cameraPosition);
  const recognizerRef = useRef<FaceRecognizer | null>(null);
  const completedRef = useRef(false);
  const permissionRequestedRef = useRef(false);
  const completed = useSharedValue(false);
  const enrollmentSamples = useSharedValue(0);
  const lastReportedStatus = useSharedValue("");
  const verificationSent = useSharedValue(false);
  const spoofSent = useSharedValue(false);
  const processingErrorSent = useSharedValue(false);
  const mode = props.mode;
  const profileId = mode === "verify" ? props.profileId : "new-profile";
  const expectedTemplate = mode === "verify" ? props.expectedTemplate : null;
  const onComplete = mode === "enroll" ? props.onComplete : undefined;
  const onVerified = mode === "verify" ? props.onVerified : undefined;
  const matchThreshold = FACE_RECOGNIZER_OPTIONS.recognition.threshold;

  const onEnrollmentProgress = useCallback((count: number) => {
    setCaptureProgress(count);
    setGuidance(
      count < REQUIRED_FACE_SAMPLES
        ? "Turn your head slightly to capture another face angle."
        : "Face enrollment complete."
    );
  }, []);

  const onEnrollmentStatus = useCallback((status: string) => {
    switch (status) {
      case "spoof":
        setGuidance("A live face is required. Remove photos or screens from view.");
        break;
      case "multipleFaces":
        setGuidance("Only one person should be visible during face enrollment.");
        break;
      case "lowQuality":
        setGuidance("Move closer to the camera and improve the lighting.");
        break;
      case "noFace":
        setGuidance("Center one face in the camera frame.");
        break;
      case "redundant":
        setGuidance("Turn your head slightly to capture a different angle.");
        break;
      default:
        break;
    }
  }, []);

  const onFaceVerified = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setGuidance("Face matched this saved profile.");
    onVerified?.();
  }, [onVerified]);

  const onSpoofDetected = useCallback(() => {
    setGuidance("The live-face check failed. Use a live face in clear lighting.");
  }, []);

  const onProcessingError = useCallback((message: string) => {
    setCaptureError(message);
  }, []);

  const onEnrollmentComplete = useCallback(() => {
    if (completedRef.current || !onComplete) return;
    const activeRecognizer = recognizerRef.current;
    if (!activeRecognizer) {
      completed.value = false;
      enrollmentSamples.value = 0;
      setCaptureProgress(0);
      setCaptureError("The face matcher is no longer available. Try again.");
      return;
    }
    try {
      const enrollment = activeRecognizer.getEnrollment(profileId);
      if (enrollment.byteLength === 0) {
        throw new Error("The face matcher returned an empty template.");
      }
      completedRef.current = true;
      onComplete(enrollment);
    } catch (error) {
      completed.value = false;
      enrollmentSamples.value = 0;
      setCaptureProgress(0);
      setCaptureError(getErrorMessage(error));
    }
  }, [completed, enrollmentSamples, onComplete, profileId]);

  useEffect(() => {
    if (hasPermission || permissionRequestedRef.current) return;
    permissionRequestedRef.current = true;
    void requestPermission()
      .then((granted) => {
        if (!granted) setCameraError("Camera permission was not granted.");
      })
      .catch((error: unknown) => setCameraError(getErrorMessage(error)));
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    let active = true;
    let createdRecognizer: FaceRecognizer | null = null;
    setModelLoading(true);
    setModelError(null);
    void FaceRecognition.create(FACE_RECOGNIZER_OPTIONS)
      .then((engine) => {
        createdRecognizer = engine;
        if (!active) {
          engine.dispose();
          return;
        }
        try {
          if (expectedTemplate) {
            engine.addEnrollment(profileId, toArrayBuffer(expectedTemplate));
          }
        } catch (error) {
          engine.dispose();
          createdRecognizer = null;
          setModelError(getErrorMessage(error));
          return;
        }
        recognizerRef.current = engine;
        setRecognizer(engine);
      })
      .catch((error: unknown) => {
        if (active) setModelError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setModelLoading(false);
      });

    return () => {
      active = false;
      recognizerRef.current = null;
      createdRecognizer?.dispose();
    };
  }, [expectedTemplate, profileId]);

  const frameOutput = useFrameOutput({
    targetResolution: { width: 640, height: 480 },
    pixelFormat: "yuv",
    dropFramesWhileBusy: true,
    onFrame(frame) {
      "worklet";
      const activeRecognizer = recognizer;
      if (!activeRecognizer || completed.value) {
        frame.dispose();
        return;
      }

      try {
        if (mode === "enroll") {
          if (enrollmentSamples.value >= REQUIRED_FACE_SAMPLES) {
            frame.dispose();
            return;
          }
          const result = activeRecognizer.enrollFace(profileId, frame);
          if (result.status === "enrolled") {
            enrollmentSamples.value += 1;
            scheduleOnRN(onEnrollmentProgress, enrollmentSamples.value);
            if (enrollmentSamples.value >= REQUIRED_FACE_SAMPLES) {
              completed.value = true;
              scheduleOnRN(onEnrollmentComplete);
            }
          } else if (lastReportedStatus.value !== result.status) {
            lastReportedStatus.value = result.status;
            scheduleOnRN(onEnrollmentStatus, result.status);
          }
        } else {
          const results = activeRecognizer.recognizeFaces(frame);
          const spoofed = results.some((face) => face.status === "spoofed");
          if (spoofed && !spoofSent.value) {
            spoofSent.value = true;
            scheduleOnRN(onSpoofDetected);
          }
          const matched = results.find(
            (face) =>
              face.status === "matched" &&
              face.enrollmentId === profileId &&
              face.similarity >= matchThreshold
          );
          if (matched && !verificationSent.value) {
            verificationSent.value = true;
            completed.value = true;
            scheduleOnRN(onFaceVerified);
          }
        }
      } catch (error) {
        if (!processingErrorSent.value) {
          processingErrorSent.value = true;
          scheduleOnRN(
            onProcessingError,
            error instanceof Error ? error.message : "The face frame could not be processed."
          );
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const isVerifying = props.mode === "verify";
  const screenError = captureError ?? cameraError ?? modelError;

  return (
    <Page>
      <View className="flex-1 overflow-hidden bg-[#10231F]">
        {device && hasPermission && recognizer ? (
          <Camera
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            device={device}
            isActive
            outputs={[frameOutput]}
            onError={(error) => setCameraError(error.message)}
          />
        ) : null}

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={props.onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel face capture"
              className="h-10 w-10 items-center justify-center rounded-full bg-black/35"
            >
              <Ionicons name="close" size={20} color="white" />
            </Pressable>
            <Pressable
              onPress={() => setCameraPosition((current) => current === "front" ? "back" : "front")}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${cameraPosition === "front" ? "back" : "front"} camera`}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/35"
            >
              <Ionicons name="camera-reverse-outline" size={21} color="white" />
            </Pressable>
          </View>

          <View className="mt-5">
            <Text className="text-2xl font-extrabold text-white">
              {isVerifying ? "Verify with face" : "Enroll face"}
            </Text>
            <Text className="mt-2 text-sm leading-5 text-white/75">
              {isVerifying
                ? "Live frames are matched to this profile's saved face template."
                : "A few live camera frames create a compact on-device template. No video is saved."}
            </Text>
          </View>

          <View className="mt-5 min-h-64 flex-1 items-center justify-center rounded-[28px] border border-white/20 bg-black/20">
            {modelLoading ? (
              <View className="items-center px-6">
                <ActivityIndicator size="large" color="white" />
                <Text className="mt-4 text-sm font-semibold text-white">Loading on-device face models…</Text>
              </View>
            ) : !hasPermission ? (
              <View className="items-center px-6">
                <Ionicons name="camera-outline" size={34} color="#BEE9D2" />
                <Text className="mt-3 text-center text-sm font-semibold text-white">
                  Camera access is required
                </Text>
              </View>
            ) : !device ? (
              <View className="items-center px-6">
                <Ionicons name="phone-portrait-outline" size={34} color="#BEE9D2" />
                <Text className="mt-3 text-center text-sm font-semibold text-white">
                  This device has no {cameraPosition} camera
                </Text>
              </View>
            ) : !recognizer ? (
              <View className="items-center px-6">
                <ActivityIndicator size="large" color="white" />
                <Text className="mt-4 text-sm font-semibold text-white">Preparing face matcher…</Text>
              </View>
            ) : (
              <View className="items-center px-6">
                <View className="h-48 w-40 items-center justify-center rounded-[45%] border-2 border-[#BEE9D2]/80">
                  <Ionicons name="person-outline" size={46} color="#BEE9D2" />
                </View>
                <Text className="mt-4 text-sm font-semibold text-white">
                  {isVerifying
                    ? "Center one face in the outline"
                    : `Face angles captured: ${captureProgress}/${REQUIRED_FACE_SAMPLES}`}
                </Text>
              </View>
            )}
          </View>

          <View className="mt-4 rounded-2xl bg-black/40 p-4">
            <View className="flex-row items-start">
              <Ionicons
                name={screenError ? "alert-circle-outline" : "scan-outline"}
                size={20}
                color={screenError ? "#F6C67A" : "#BEE9D2"}
              />
              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold text-white">
                  {screenError ? "Face capture unavailable" : "Live face guidance"}
                </Text>
                <Text className="mt-1 text-sm leading-5 text-white/75">
                  {screenError ?? guidance}
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-3 flex-row items-center">
            <Ionicons name="shield-checkmark-outline" size={17} color="#BEE9D2" />
            <Text className="ml-2 flex-1 text-xs leading-5 text-white/70">
              Passive liveness checks help reject likely photos or screens. This demo is not certified for security use.
            </Text>
          </View>

          {modelError ? (
            <View className="mt-3">
              <Notice icon="alert-circle-outline" tone="amber">
                <Text className="text-sm text-ink">
                  Face model initialization failed: {modelError}
                </Text>
              </Notice>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Page>
  );
}
