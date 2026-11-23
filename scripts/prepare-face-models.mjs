import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = path.join(
  projectRoot,
  "node_modules",
  "react-native-vision-camera-face-recognizer"
);
const modelRoot = path.join(moduleRoot, "models");
const requiredModels = [
  "sface.onnx",
  "minifasnet_v2.onnx",
  "minifasnet_v1se.onnx",
  "yunet.onnx",
];
const runtimeLibrary = path.join(
  moduleRoot,
  "third_party",
  "onnxruntime",
  "android",
  "arm64-v8a",
  "libonnxruntime.so"
);
const sherpaRoot = path.join(projectRoot, "node_modules", "@siteed", "sherpa-onnx.rn");
const sherpaRuntimeLibrary = path.join(
  sherpaRoot,
  "android",
  "src",
  "main",
  "jniLibs",
  "arm64-v8a",
  "libonnxruntime.so"
);
const sherpaRuntimeMetadata = path.join(
  sherpaRoot,
  "prebuilt",
  "android",
  "build-metadata.json"
);
const handLandmarksModel = path.join(
  projectRoot,
  "node_modules",
  "biometric-demo-hand-landmarks",
  "android",
  "src",
  "main",
  "assets",
  "hand_landmarker.task"
);
const handLandmarksModelUrl =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

async function isPresent(filePath) {
  try {
    return (await stat(filePath)).size > 0;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function ensureAndroidRuntimeLibrary() {
  const metadata = JSON.parse(await readFile(sherpaRuntimeMetadata, "utf8"));
  const runtimeVersion = metadata.onnxRuntimeVersion;
  if (
    typeof runtimeVersion !== "string" ||
    metadata.arm64ImportedOrtSymbolVersion !== runtimeVersion ||
    metadata.arm64ExportedOrtSymbolVersion !== runtimeVersion
  ) {
    throw new Error("The Sherpa Android ONNX Runtime version metadata is missing or inconsistent.");
  }

  const contents = await readFile(sherpaRuntimeLibrary);
  let faceRuntime;
  try {
    faceRuntime = await readFile(runtimeLibrary);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (!faceRuntime?.equals(contents)) {
    await mkdir(path.dirname(runtimeLibrary), { recursive: true });
    await writeFile(runtimeLibrary, contents);
    console.log(`Aligned the Android face runtime with Sherpa ONNX Runtime ${runtimeVersion}.`);
  }
}

await ensureAndroidRuntimeLibrary();

const missingModels = [];
for (const model of requiredModels) {
  if (!(await isPresent(path.join(modelRoot, model)))) {
    missingModels.push(model);
  }
}

if (missingModels.length === 0) {
  console.log("Face recognition models are already available.");
} else {
  const fetchScript = path.join(moduleRoot, "scripts", "fetch-models.sh");
  try {
    await access(fetchScript);
  } catch (error) {
    throw new Error(
      `The face-recognition module is missing its model fetch script at ${fetchScript}. Reinstall dependencies and try again.`,
      { cause: error }
    );
  }

  const sfacePath = path.join(modelRoot, "sface.onnx");
  const existingSface = (await isPresent(sfacePath)) ? await readFile(sfacePath) : null;
  try {
    execFileSync("bash", [fetchScript], { cwd: moduleRoot, stdio: "inherit" });
  } finally {
    if (existingSface) {
      await writeFile(sfacePath, existingSface);
    }
  }

  for (const model of requiredModels) {
    if (!(await isPresent(path.join(modelRoot, model)))) {
      throw new Error(`Face recognition model download did not produce ${model}.`);
    }
  }
}

if (!(await isPresent(handLandmarksModel))) {
  const response = await fetch(handLandmarksModelUrl, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Hand landmark model download failed with HTTP ${response.status}.`);
  }
  const model = Buffer.from(await response.arrayBuffer());
  if (model.byteLength < 1_000_000) {
    throw new Error("The downloaded hand landmark model is unexpectedly small.");
  }
  await mkdir(path.dirname(handLandmarksModel), { recursive: true });
  await writeFile(handLandmarksModel, model);
  console.log("Downloaded the on-device MediaPipe hand landmark model.");
} else {
  console.log("The on-device MediaPipe hand landmark model is already available.");
}
