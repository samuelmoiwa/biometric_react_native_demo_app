import type { HybridObject } from "react-native-nitro-modules";
import type { Frame } from "react-native-vision-camera";

export interface HandLandmarks
  extends HybridObject<{ android: "kotlin" }> {
  readonly isReady: boolean;
  readonly errorMessage: string;
  detect(frame: Frame): number[];
  capture(frame: Frame): string;
}
