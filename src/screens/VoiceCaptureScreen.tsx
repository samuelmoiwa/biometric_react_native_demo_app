import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioStudioModule,
  useAudioRecorder,
  type AudioDataEvent,
} from "@siteed/audio-studio";
import { SpeakerId } from "@siteed/sherpa-onnx.rn";
import { IconTile, Notice, Page, PrimaryButton } from "../components/UI";
import {
  initializeSpeakerId,
  releaseSpeakerId,
  toFloatSamples,
  VOICE_MATCH_THRESHOLD,
  VOICE_MIN_DURATION_MS,
  VOICE_SAMPLE_RATE,
} from "../biometrics/voice";

type Props =
  | {
      mode: "enroll";
      onComplete: (embedding: number[]) => void;
      onCancel: () => void;
    }
  | {
      mode: "verify";
      profileId: string;
      expectedEmbedding: number[];
      onVerified: () => void;
      onCancel: () => void;
    };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function VoiceCaptureScreen(props: Props) {
  const recorder = useAudioRecorder();
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const sampleCountRef = useRef(0);
  const streamErrorRef = useRef<Error | null>(null);
  const finalizingRef = useRef(false);
  const cancellingRef = useRef(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [embeddingDimension, setEmbeddingDimension] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void initializeSpeakerId((progress) => {
      if (active) setModelProgress(progress);
    })
      .then((dimension) => {
        if (!active) return;
        setEmbeddingDimension(dimension);
        setModelReady(true);
      })
      .catch((modelError: unknown) => {
        if (active) setError(getErrorMessage(modelError));
      });

    return () => {
      active = false;
      const currentRecorder = recorderRef.current;
      if (currentRecorder.isRecording) {
        void currentRecorder.stopRecording().catch((stopError: unknown) => {
          console.error("Could not stop the voice recorder during cleanup.", stopError);
        });
      }
      void releaseSpeakerId().catch((releaseError: unknown) => {
        console.error("Could not release the voice model during cleanup.", releaseError);
      });
    };
  }, []);

  async function finishRecording() {
    if (finalizingRef.current || cancellingRef.current) return;
    finalizingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (streamErrorRef.current) throw streamErrorRef.current;
      if (sampleCountRef.current < (VOICE_SAMPLE_RATE * VOICE_MIN_DURATION_MS) / 1000) {
        await SpeakerId.resetStream();
        throw new Error("Speak for at least three seconds, then try again.");
      }

      const result = await SpeakerId.computeEmbedding();
      if (!result.success || result.embedding.length !== embeddingDimension) {
        throw new Error(result.error ?? "A voice template could not be created.");
      }

      if (props.mode === "enroll") {
        await releaseSpeakerId();
        props.onComplete(result.embedding);
        return;
      }

      const registration = await SpeakerId.registerSpeaker(
        props.profileId,
        props.expectedEmbedding
      );
      if (!registration.success) {
        throw new Error(registration.error ?? "The saved voice template could not be loaded.");
      }

      let verified = false;
      try {
        const verification = await SpeakerId.verifySpeaker(
          props.profileId,
          result.embedding,
          VOICE_MATCH_THRESHOLD
        );
        if (!verification.success) {
          throw new Error(verification.error ?? "Voice matching could not be completed.");
        }
        verified = verification.verified;
      } finally {
        const removal = await SpeakerId.removeSpeaker(props.profileId);
        if (!removal.success) {
          throw new Error(removal.error ?? "The temporary voice template could not be cleared.");
        }
      }

      if (verified) {
        await releaseSpeakerId();
        props.onVerified();
      } else {
        setError("The voice sample did not match this profile. Try again in a quiet place.");
      }
    } catch (processingError) {
      setError(getErrorMessage(processingError));
    } finally {
      finalizingRef.current = false;
      setBusy(false);
    }
  }

  async function startRecording() {
    if (!modelReady || busy || recorder.isRecording) return;
    setBusy(true);
    setError(null);
    sampleCountRef.current = 0;
    streamErrorRef.current = null;
    try {
      const permission = await AudioStudioModule.requestPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error("Microphone permission was not granted.");
      }

      const reset = await SpeakerId.resetStream();
      if (!reset.success) {
        throw new Error(reset.error ?? "The voice matcher could not be prepared.");
      }

      await recorder.startRecording({
        sampleRate: VOICE_SAMPLE_RATE,
        channels: 1,
        encoding: "pcm_32bit",
        streamFormat: "float32",
        interval: 100,
        keepFullAnalysis: false,
        maxDurationMs: 6_000,
        autoStopOnMaxDuration: true,
        output: { primary: { enabled: false } },
        onAudioStream: async (event: AudioDataEvent) => {
          try {
            const samples = toFloatSamples(event.data);
            if (samples.length === 0) return;
            const processed = await SpeakerId.processSamples(
              VOICE_SAMPLE_RATE,
              samples
            );
            if (!processed.success) {
              throw new Error(processed.error ?? "The voice sample could not be processed.");
            }
            sampleCountRef.current += samples.length;
          } catch (streamError) {
            streamErrorRef.current =
              streamError instanceof Error
                ? streamError
                : new Error("The audio stream could not be processed.");
            throw streamErrorRef.current;
          }
        },
        onRecordingStopped: async () => finishRecording(),
      });
    } catch (recordingError) {
      setError(getErrorMessage(recordingError));
    } finally {
      setBusy(false);
    }
  }

  async function stopRecording() {
    if (!recorder.isRecording) return;
    setBusy(true);
    try {
      await recorder.stopRecording();
    } catch (stopError) {
      setError(getErrorMessage(stopError));
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy && !recorder.isRecording) return;
    cancellingRef.current = true;
    setBusy(true);
    try {
      if (recorder.isRecording) await recorder.stopRecording();
      if (modelReady) {
        const reset = await SpeakerId.resetStream();
        if (!reset.success) {
          throw new Error(reset.error ?? "The voice sample could not be cleared.");
        }
      }
      await releaseSpeakerId();
      props.onCancel();
    } catch (cancelError) {
      cancellingRef.current = false;
      setBusy(false);
      setError(getErrorMessage(cancelError));
    }
  }

  const isVerifying = props.mode === "verify";

  return (
    <Page>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => void cancel()}
          accessibilityRole="button"
          accessibilityLabel="Cancel voice capture"
          className="mb-5 h-10 w-10 items-center justify-center rounded-full bg-white"
        >
          <Ionicons name="close" size={20} color="#14211F" />
        </Pressable>

        <Text className="text-2xl font-extrabold text-ink">
          {isVerifying ? "Verify with voice" : "Enroll voice"}
        </Text>
        <Text className="mt-2 text-sm leading-5 text-muted">
          {isVerifying
            ? "Speak naturally for at least three seconds. Your voice is compared on this device."
            : "Record a short natural voice sample to create an on-device speaker template."}
        </Text>

        <View className="mt-6 items-center rounded-[28px] border border-line bg-white px-6 py-8">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-mint">
            <Ionicons
              name={recorder.isRecording ? "mic" : "mic-outline"}
              size={36}
              color="#176B57"
            />
          </View>
          <Text className="mt-5 text-xl font-extrabold text-ink">
            {recorder.isRecording
              ? `${(recorder.durationMs / 1000).toFixed(1)} seconds`
              : modelReady
                ? "Ready when you are"
                : "Preparing voice matcher"}
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-muted">
            {recorder.isRecording
              ? "Speak clearly in a quiet place. Recording stops automatically after six seconds."
              : "The model runs offline after its first download."}
          </Text>

          {!modelReady ? (
            <View className="mt-5 items-center">
              <ActivityIndicator size="large" color="#176B57" />
              <Text className="mt-3 text-xs text-muted">
                {modelProgress === null
                  ? "Loading the voice model…"
                  : `Downloading voice model… ${Math.round(modelProgress * 100)}%`}
              </Text>
            </View>
          ) : (
            <View className="mt-6 w-full">
              {recorder.isRecording ? (
                <PrimaryButton
                  title="Stop and verify"
                  icon="checkmark"
                  onPress={() => void stopRecording()}
                  loading={busy}
                />
              ) : (
                <PrimaryButton
                  title={isVerifying ? "Record voice sample" : "Record voice sample"}
                  icon="mic"
                  onPress={() => void startRecording()}
                  loading={busy}
                />
              )}
            </View>
          )}
        </View>

        {error ? (
          <View className="mt-4">
            <Notice icon="alert-circle-outline" tone="amber">
              <Text className="text-sm font-bold text-ink">Voice matching unavailable</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">{error}</Text>
            </Notice>
          </View>
        ) : null}

        <View className="mt-4">
          <Notice icon="shield-checkmark-outline">
            <Text className="text-sm font-bold text-ink">Only the voice template is kept</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">
              Raw audio output is disabled. A {embeddingDimension || "local"}-value speaker embedding is stored in the encrypted profile database.
            </Text>
          </Notice>
        </View>

        <View className="mt-4 flex-row items-center">
          <IconTile icon="lock-closed-outline" size={34} />
          <Text className="ml-3 flex-1 text-xs leading-5 text-muted">
            Speaker matching is a demo and is not suitable as a production security boundary.
          </Text>
        </View>
      </ScrollView>
    </Page>
  );
}
