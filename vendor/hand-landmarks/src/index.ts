import { NitroModules } from "react-native-nitro-modules";
import type { HandLandmarks } from "./HandLandmarks.nitro";

export type { HandLandmarks };

export function createHandLandmarks(): HandLandmarks {
  return NitroModules.createHybridObject<HandLandmarks>("HandLandmarks");
}
