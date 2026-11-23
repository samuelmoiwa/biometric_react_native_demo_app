import * as FileSystem from "expo-file-system/legacy";
import { SpeakerId } from "@siteed/sherpa-onnx.rn";

export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MATCH_THRESHOLD = 0.5;
export const VOICE_MIN_DURATION_MS = 3_000;

const MODEL_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx";
const MODEL_FILE = "campplus-en-voxceleb-16k.onnx";
const MODEL_DIRECTORY_NAME = "biometric-models/speaker";

let speakerEmbeddingDimension = 0;
let initialization: Promise<number> | undefined;

export async function initializeSpeakerId(
  onProgress: (progress: number | null) => void
): Promise<number> {
  if (speakerEmbeddingDimension > 0) return speakerEmbeddingDimension;
  if (initialization) return initialization;

  const pendingInitialization = (async () => {
    const documentDirectory = FileSystem.documentDirectory;
    if (!documentDirectory) {
      throw new Error("The app cannot access local storage for the voice model.");
    }

    const modelDirectory = `${documentDirectory}${MODEL_DIRECTORY_NAME}/`;
    const modelPath = `${modelDirectory}${MODEL_FILE}`;
    await FileSystem.makeDirectoryAsync(modelDirectory, { intermediates: true });

    const existingModel = await FileSystem.getInfoAsync(modelPath);
    if (!existingModel.exists || !("size" in existingModel) || existingModel.size === 0) {
      const download = FileSystem.createDownloadResumable(
        MODEL_URL,
        modelPath,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          onProgress(
            totalBytesExpectedToWrite > 0
              ? Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)
              : null
          );
        }
      );
      const result = await download.downloadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        throw new Error("The on-device voice model could not be downloaded.");
      }

      const downloadedModel = await FileSystem.getInfoAsync(modelPath);
      if (!downloadedModel.exists || !("size" in downloadedModel) || downloadedModel.size === 0) {
        throw new Error("The downloaded on-device voice model is empty.");
      }
    }

    const result = await SpeakerId.init({
      modelDir: modelDirectory,
      modelFile: MODEL_FILE,
      sampleRate: VOICE_SAMPLE_RATE,
      numThreads: 2,
      provider: "cpu",
    });
    if (!result.success || result.embeddingDim <= 0) {
      throw new Error(result.error ?? "The on-device voice model could not be initialized.");
    }

    speakerEmbeddingDimension = result.embeddingDim;
    onProgress(1);
    return speakerEmbeddingDimension;
  })();

  initialization = pendingInitialization;
  try {
    return await pendingInitialization;
  } catch (error) {
    initialization = undefined;
    throw error;
  }
}

export async function releaseSpeakerId(): Promise<void> {
  if (initialization) await initialization;
  if (speakerEmbeddingDimension === 0) return;

  const result = await SpeakerId.release();
  if (!result.released) {
    throw new Error("The on-device voice model could not be released.");
  }
  speakerEmbeddingDimension = 0;
  initialization = undefined;
}

export function toFloatSamples(data: unknown): number[] {
  if (data instanceof Float32Array) return Array.from(data);
  if (Array.isArray(data) && data.every((value) => typeof value === "number")) {
    return data.map((value) => {
      if (!Number.isFinite(value)) {
        throw new Error("The microphone returned invalid audio samples.");
      }
      return value;
    });
  }
  throw new Error("The microphone returned an unsupported audio sample format.");
}
