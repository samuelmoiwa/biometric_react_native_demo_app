/**
 * Camera-based fingerprint engine for Biomatic.
 *
 * Two halves:
 *  1. Frame-thread ("worklet") helpers: find fingers in a camera frame, measure
 *     focus/exposure, check for a pulse (liveness) and cut out normalized
 *     fingertip crops.
 *  2. JS-thread helpers: turn a crop into a minutiae template (ridge
 *     enhancement -> thinning -> minutiae) and match two templates.
 *
 * Everything is tunable through the constants below. The values are sensible
 * starting points; tune them on real captures from your target phones.
 */
import type { FingerprintTemplate } from "../types";

/* ------------------------------------------------------------------ */
/* Tunable constants                                                   */
/* ------------------------------------------------------------------ */

export const CROP_W = 224;
export const CROP_H = 272;
export const CROP_SIZE = CROP_W * CROP_H;

/** Score (matched^2 / (nA * nB)) a live finger must reach against an enrolled finger. */
export const FINGERPRINT_MATCH_THRESHOLD = 0.2;
export const FINGERPRINT_MIN_PAIRS = 8;
/** Templates with fewer minutiae are rejected at enrollment. */
export const FINGERPRINT_MIN_MINUTIAE = 12;
export const FINGERPRINT_MIN_QUALITY = 35;

/** Normalised ridge-detail measure a fingertip must reach to count as in focus. */
export const FOCUS_MIN = 0.2;
/** Length of the sliding window used for the pulse (liveness) check. */
export const LIVE_WINDOW_MS = 3200;
export const LIVE_MIN_SAMPLES = 20;
/** Peak-to-noise-floor power ratio the heartbeat peak must reach. */
export const PULSE_MIN_RATIO = 10;
export const PULSE_MIN_AMPLITUDE = 0.04;
export const PULSE_MAX_AMPLITUDE = 4;

const MIN_FINGER_PX = 150;
const GRID = 8;

/* ------------------------------------------------------------------ */
/* Frame-thread helpers (all marked 'worklet')                          */
/* ------------------------------------------------------------------ */

export type DetectedFinger = {
  left: number;
  right: number;
  tipX: number;
  tipY: number;
  width: number;
};

export type DetectionStatus =
  | "noHand"
  | "wrongCount"
  | "tooFar"
  | "tooClose"
  | "ok";

export type Detection = {
  status: DetectionStatus;
  fingers: DetectedFinger[];
};

/**
 * Finds up to `expected` fingers (fingers pointing up, pads facing the camera)
 * in an RGBA/BGRA frame. Works on a coarse grid, so it is cheap enough to run
 * on every frame.
 */
export function detectFingers(
  data: Uint8Array,
  width: number,
  height: number,
  stride: number,
  bgra: boolean,
  expected: number
): Detection {
  "worklet";
  const gw = Math.floor(width / GRID);
  const gh = Math.floor(height / GRID);
  const cells = gw * gh;
  const skin = new Uint8Array(cells);
  const ro = bgra ? 2 : 0;
  const bo = bgra ? 0 : 2;

  for (let gy = 0; gy < gh; gy++) {
    const rowBase = (gy * GRID + GRID / 2) * stride;
    for (let gx = 0; gx < gw; gx++) {
      const p = rowBase + (gx * GRID + GRID / 2) * 4;
      const r = data[p + ro];
      const g = data[p + 1];
      const b = data[p + bo];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (y > 40 && cr > 134 && cr < 186 && cb > 68 && cb < 134 && r > g) {
        skin[gy * gw + gx] = 1;
      }
    }
  }

  // Connected components (4-neighbour). Keep every component that is big
  // enough relative to the largest one, so separated fingers still count.
  const visited = new Uint8Array(cells);
  const stack = new Int32Array(cells);
  const starts: number[] = [];
  const areas: number[] = [];
  let largest = 0;
  for (let i = 0; i < cells; i++) {
    if (!skin[i] || visited[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    visited[i] = 1;
    let area = 0;
    while (sp > 0) {
      const c = stack[--sp];
      area++;
      const cx = c % gw;
      const cy = (c - cx) / gw;
      if (cx > 0 && skin[c - 1] && !visited[c - 1]) {
        visited[c - 1] = 1;
        stack[sp++] = c - 1;
      }
      if (cx < gw - 1 && skin[c + 1] && !visited[c + 1]) {
        visited[c + 1] = 1;
        stack[sp++] = c + 1;
      }
      if (cy > 0 && skin[c - gw] && !visited[c - gw]) {
        visited[c - gw] = 1;
        stack[sp++] = c - gw;
      }
      if (cy < gh - 1 && skin[c + gw] && !visited[c + gw]) {
        visited[c + gw] = 1;
        stack[sp++] = c + gw;
      }
    }
    starts.push(i);
    areas.push(area);
    if (area > largest) largest = area;
  }
  if (largest < cells * 0.04) return { status: "noHand", fingers: [] };

  const blob = new Uint8Array(cells);
  for (let k = 0; k < starts.length; k++) {
    if (areas[k] < largest * 0.2) continue;
    let sp = 0;
    stack[sp++] = starts[k];
    blob[starts[k]] = 1;
    while (sp > 0) {
      const c = stack[--sp];
      const cx = c % gw;
      const cy = (c - cx) / gw;
      if (cx > 0 && skin[c - 1] && !blob[c - 1]) {
        blob[c - 1] = 1;
        stack[sp++] = c - 1;
      }
      if (cx < gw - 1 && skin[c + 1] && !blob[c + 1]) {
        blob[c + 1] = 1;
        stack[sp++] = c + 1;
      }
      if (cy > 0 && skin[c - gw] && !blob[c - gw]) {
        blob[c - gw] = 1;
        stack[sp++] = c - gw;
      }
      if (cy < gh - 1 && skin[c + gw] && !blob[c + gw]) {
        blob[c + gw] = 1;
        stack[sp++] = c + gw;
      }
    }
  }

  // Upper contour of the hand: for each column, the first row that is skin.
  const top = new Float32Array(gw);
  let xmin = gw;
  let xmax = -1;
  for (let x = 0; x < gw; x++) {
    top[x] = gh;
    for (let y = 0; y < gh - 1; y++) {
      if (blob[y * gw + x] && blob[(y + 1) * gw + x]) {
        top[x] = y;
        break;
      }
    }
    if (top[x] < gh) {
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
    }
  }
  if (xmax < 0) return { status: "noHand", fingers: [] };

  const sm = new Float32Array(gw);
  for (let x = 0; x < gw; x++) {
    const a = x > 0 ? top[x - 1] : gh;
    const b = x < gw - 1 ? top[x + 1] : gh;
    sm[x] = (a + 2 * top[x] + b) / 4;
  }

  // Fingertips are the local minima of the contour (smallest y).
  const R = 5;
  const peaks: number[] = [];
  for (let x = xmin; x <= xmax; x++) {
    const v = sm[x];
    if (v >= gh - 1) continue;
    let ok = true;
    for (let k = 1; k <= R && ok; k++) {
      if (x - k >= 0 && sm[x - k] <= v) ok = false;
      if (x + k < gw && sm[x + k] < v) ok = false;
    }
    if (ok) peaks.push(x);
  }

  // Rounded tips have a flat apex: use the middle of it, not its left edge.
  for (let k = 0; k < peaks.length; k++) {
    const v = sm[peaks[k]];
    let l = peaks[k];
    let r2 = peaks[k];
    while (l > 0 && sm[l - 1] <= v + 0.75) l--;
    while (r2 < gw - 1 && sm[r2 + 1] <= v + 0.75) r2++;
    peaks[k] = Math.round((l + r2) / 2);
  }

  const valleyBetween = (a: number, b: number): number => {
    let vv = -1;
    for (let x = a; x <= b; x++) if (sm[x] > vv) vv = sm[x];
    let first = a;
    let last = b;
    for (let x = a; x <= b; x++) {
      if (sm[x] >= vv - 1e-6) {
        first = x;
        break;
      }
    }
    for (let x = b; x >= a; x--) {
      if (sm[x] >= vv - 1e-6) {
        last = x;
        break;
      }
    }
    return Math.round((first + last) / 2);
  };

  // Merge tips that are not separated by a real notch.
  let merged = true;
  while (merged && peaks.length > 1) {
    merged = false;
    for (let k = 0; k < peaks.length - 1; k++) {
      const a = peaks[k];
      const b = peaks[k + 1];
      const v = valleyBetween(a, b);
      const prominence = Math.min(sm[v] - sm[a], sm[v] - sm[b]);
      if (prominence < 3) {
        peaks.splice(sm[a] <= sm[b] ? k + 1 : k, 1);
        merged = true;
        break;
      }
    }
  }

  // Drop clearly lower tips (for example the thumb next to four fingers).
  while (peaks.length > expected && peaks.length > 1) {
    let minTop = gh;
    let worst = 0;
    let worstValue = -1;
    for (let k = 0; k < peaks.length; k++) {
      const v = sm[peaks[k]];
      if (v < minTop) minTop = v;
      if (v > worstValue) {
        worstValue = v;
        worst = k;
      }
    }
    const gaps: number[] = [];
    for (let k = 0; k < peaks.length - 1; k++) gaps.push(peaks[k + 1] - peaks[k]);
    gaps.sort((a, b) => a - b);
    const spacing = gaps[Math.floor(gaps.length / 2)];
    if (worstValue - minTop > 0.8 * spacing) peaks.splice(worst, 1);
    else break;
  }

  const n = peaks.length;
  if (n === 0) return { status: "noHand", fingers: [] };

  const edges: number[] = new Array(n + 1);
  let cutOff = false;
  if (n === 1) {
    const px = peaks[0];
    const row = Math.min(gh - 1, Math.round(sm[px]) + 14);
    let l = px;
    let r = px;
    while (l > 0 && blob[row * gw + l - 1]) l--;
    while (r < gw - 1 && blob[row * gw + r + 1]) r++;
    edges[0] = l;
    edges[1] = r + 1;
  } else {
    for (let k = 1; k < n; k++) edges[k] = valleyBetween(peaks[k - 1], peaks[k]);
    const e0 = peaks[0] - (edges[1] - peaks[0]);
    const en = peaks[n - 1] + (peaks[n - 1] - edges[n - 1]);
    if (e0 < 0 || en > gw) cutOff = true;
    edges[0] = Math.max(0, e0);
    edges[n] = Math.min(gw, en);
  }

  const fingers: DetectedFinger[] = [];
  let widthSum = 0;
  let lowest = 0;
  for (let i = 0; i < n; i++) {
    const left = edges[i] * GRID;
    const right = edges[i + 1] * GRID;
    const w = right - left;
    const tipY = sm[peaks[i]] * GRID;
    fingers.push({ left, right, tipX: peaks[i] * GRID + GRID / 2, tipY, width: w });
    widthSum += w;
    if (tipY + 1.25 * w > lowest) lowest = tipY + 1.25 * w;
  }
  const avg = widthSum / n;

  if (n !== expected) return { status: "wrongCount", fingers };
  if (avg < MIN_FINGER_PX) return { status: "tooFar", fingers };
  const maxFrac = expected > 1 ? 0.3 : 0.6;
  if (avg > maxFrac * width || cutOff || lowest > height) {
    return { status: "tooClose", fingers };
  }
  return { status: "ok", fingers };
}

/** Rectangle (frame pixels) of the distal pad that is cut out for one finger. */
export function padRect(f: DetectedFinger): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  "worklet";
  const w = f.width * 0.84;
  return { x: f.left + f.width * 0.08, y: f.tipY + f.width * 0.06, w, h: (w * CROP_H) / CROP_W };
}

/**
 * Mean green level (used as the pulse sample) and a normalised ridge-detail
 * score (focus) for one fingertip pad.
 */
export function fingerMetrics(
  data: Uint8Array,
  stride: number,
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number }
): { mean: number; focus: number } {
  "worklet";
  const x0 = Math.max(2, Math.floor(rect.x));
  const y0 = Math.max(2, Math.floor(rect.y));
  const x1 = Math.min(width - 3, Math.floor(rect.x + rect.w));
  const y1 = Math.min(height - 3, Math.floor(rect.y + rect.h));
  if (x1 <= x0 + 8 || y1 <= y0 + 8) return { mean: 0, focus: 0 };

  const step = Math.max(2, Math.floor((x1 - x0) / 64));
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += step) {
    const base = y * stride;
    for (let x = x0; x < x1; x += step) {
      sum += data[base + x * 4 + 1];
      count++;
    }
  }
  const mean = count > 0 ? sum / count : 0;

  // Focus on a central 80x80 patch at full resolution.
  const cx = Math.floor((x0 + x1) / 2);
  const cy = Math.floor((y0 + y1) / 2);
  const px0 = Math.max(2, cx - 40);
  const py0 = Math.max(2, cy - 40);
  const px1 = Math.min(width - 3, cx + 40);
  const py1 = Math.min(height - 3, cy + 40);
  let s = 0;
  let s2 = 0;
  let ge = 0;
  let m = 0;
  for (let y = py0; y < py1; y++) {
    const base = y * stride;
    for (let x = px0; x < px1; x++) {
      const i = base + x * 4 + 1;
      const v = data[i];
      const gx = data[i + 4] - data[i - 4];
      const gy = data[i + stride] - data[i - stride];
      s += v;
      s2 += v * v;
      ge += gx * gx + gy * gy;
      m++;
    }
  }
  if (m === 0) return { mean, focus: 0 };
  const mu = s / m;
  const variance = s2 / m - mu * mu;
  // gx/gy span two pixels, hence the 1/4.
  const focus = (ge / m / 4) / (variance + 1);
  return { mean, focus };
}

/**
 * Cuts a normalised grayscale (green channel) crop of one fingertip pad out of
 * the frame, resampled to CROP_W x CROP_H.
 */
export function extractCrop(
  data: Uint8Array,
  stride: number,
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number },
  out: Uint8Array,
  offset: number
): void {
  "worklet";
  const sx = rect.w / CROP_W;
  const sy = rect.h / CROP_H;
  for (let oy = 0; oy < CROP_H; oy++) {
    let fy = rect.y + (oy + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    if (fy > height - 2) fy = height - 2;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const r0 = y0 * stride;
    const r1 = r0 + stride;
    for (let ox = 0; ox < CROP_W; ox++) {
      let fx = rect.x + (ox + 0.5) * sx - 0.5;
      if (fx < 0) fx = 0;
      if (fx > width - 2) fx = width - 2;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const i = x0 * 4 + 1;
      const top = data[r0 + i] * (1 - tx) + data[r0 + i + 4] * tx;
      const bottom = data[r1 + i] * (1 - tx) + data[r1 + i + 4] * tx;
      out[offset + oy * CROP_W + ox] = top * (1 - ty) + bottom * ty;
    }
  }
}

/**
 * Looks for a heartbeat in the mean-brightness signal of a still fingertip.
 * A printed photo or a screen has no such signal.
 */
export function analyzePulse(
  values: number[],
  times: number[]
): { ratio: number; amp: number; bpm: number } {
  "worklet";
  const n = values.length;
  if (n < 8) return { ratio: 0, amp: 0, bpm: 0 };
  const t: number[] = new Array(n);
  for (let i = 0; i < n; i++) t[i] = (times[i] - times[0]) / 1000;
  if (t[n - 1] < 1) return { ratio: 0, amp: 0, bpm: 0 };

  let st = 0;
  let sv = 0;
  for (let i = 0; i < n; i++) {
    st += t[i];
    sv += values[i];
  }
  const mt = st / n;
  const mv = sv / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (t[i] - mt) * (values[i] - mv);
    den += (t[i] - mt) * (t[i] - mt);
  }
  const slope = den > 0 ? num / den : 0;

  const x: number[] = new Array(n);
  let sw = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    x[i] = (values[i] - mv - slope * (t[i] - mt)) * w;
    sw += w;
  }

  const power = (f: number): number => {
    let c = 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * f * t[i];
      c += x[i] * Math.cos(a);
      s += x[i] * Math.sin(a);
    }
    return c * c + s * s;
  };
  let best = 0;
  let bestF = 0;
  for (let f = 0.7; f <= 3.5; f += 0.05) {
    const p = power(f);
    if (p > best) {
      best = p;
      bestF = f;
    }
  }
  // Noise floor: median power on a grid whose bins are roughly independent.
  const coarse: number[] = [];
  const binWidth = Math.max(0.2, 1 / t[n - 1]);
  for (let f = 0.7; f <= 3.5; f += binWidth) coarse.push(power(f));
  coarse.sort((a, b) => a - b);
  const floor = coarse[Math.floor(coarse.length / 2)];
  return {
    ratio: best / (floor + 1e-9),
    amp: sw > 0 ? (2 * Math.sqrt(best)) / sw : 0,
    bpm: bestF * 60,
  };
}

export function isPulse(p: { ratio: number; amp: number; bpm: number }): boolean {
  "worklet";
  return (
    p.ratio >= PULSE_MIN_RATIO &&
    p.amp >= PULSE_MIN_AMPLITUDE &&
    p.amp <= PULSE_MAX_AMPLITUDE &&
    p.bpm >= 45 &&
    p.bpm <= 180
  );
}

/* ------------------------------------------------------------------ */
/* JS-thread helpers: template extraction                               */
/* ------------------------------------------------------------------ */

const BLOCK = 16;
const ORIENTATIONS = 16;

export type Extraction = {
  /** Flat [x, y, angleDeg] triples, angle in 0..179. */
  minutiae: number[];
  quality: number;
  count: number;
  coverage: number;
};

function localNormalize(gray: Uint8Array, W: number, H: number, radius: number, out: Float32Array) {
  const stride = W + 1;
  const sum = new Float64Array(stride * (H + 1));
  const sq = new Float64Array(stride * (H + 1));
  for (let y = 0; y < H; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < W; x++) {
      const v = gray[y * W + x];
      rs += v;
      rq += v * v;
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + rs;
      sq[(y + 1) * stride + x + 1] = sq[y * stride + x + 1] + rq;
    }
  }
  for (let y = 0; y < H; y++) {
    const ya = Math.max(0, y - radius);
    const yb = Math.min(H, y + radius + 1);
    for (let x = 0; x < W; x++) {
      const xa = Math.max(0, x - radius);
      const xb = Math.min(W, x + radius + 1);
      const area = (xb - xa) * (yb - ya);
      const s = sum[yb * stride + xb] - sum[ya * stride + xb] - sum[yb * stride + xa] + sum[ya * stride + xa];
      const q = sq[yb * stride + xb] - sq[ya * stride + xb] - sq[yb * stride + xa] + sq[ya * stride + xa];
      const mean = s / area;
      const std = Math.sqrt(Math.max(0, q / area - mean * mean));
      out[y * W + x] = (gray[y * W + x] - mean) / Math.max(std, 8);
    }
  }
}

function buildGabor(lambda: number): Float32Array[] {
  const sigma = 0.5 * lambda;
  const r = Math.ceil(2 * sigma);
  const size = 2 * r + 1;
  const kernels: Float32Array[] = [];
  for (let k = 0; k < ORIENTATIONS; k++) {
    const theta = (k * Math.PI) / ORIENTATIONS;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const kernel = new Float32Array(size * size);
    let mean = 0;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const across = -x * s + y * c;
        const v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma)) * Math.cos((2 * Math.PI * across) / lambda);
        kernel[(y + r) * size + x + r] = v;
        mean += v;
      }
    }
    mean /= size * size;
    for (let i = 0; i < kernel.length; i++) kernel[i] -= mean;
    kernels.push(kernel);
  }
  return kernels;
}

function thin(binary: Uint8Array, W: number, H: number): Uint8Array {
  const img = binary.slice();
  const clear: number[] = [];
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 40) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      clear.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!img[i]) continue;
          const p2 = img[i - W];
          const p3 = img[i - W + 1];
          const p4 = img[i + 1];
          const p5 = img[i + W + 1];
          const p6 = img[i + W];
          const p7 = img[i + W - 1];
          const p8 = img[i - 1];
          const p9 = img[i - W - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          let a = 0;
          if (!p2 && p3) a++;
          if (!p3 && p4) a++;
          if (!p4 && p5) a++;
          if (!p5 && p6) a++;
          if (!p6 && p7) a++;
          if (!p7 && p8) a++;
          if (!p8 && p9) a++;
          if (!p9 && p2) a++;
          if (a !== 1) continue;
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          clear.push(i);
        }
      }
      for (let k = 0; k < clear.length; k++) img[clear[k]] = 0;
      if (clear.length > 0) changed = true;
    }
  }
  return img;
}

/** Turns a CROP_W x CROP_H green-channel crop into a minutiae template. */
export function extractTemplate(gray: Uint8Array, W = CROP_W, H = CROP_H): Extraction {
  const n = W * H;
  const f = new Float32Array(n);
  localNormalize(gray, W, H, 10, f);

  // Gradients (Sobel).
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      gx[i] = f[i - W + 1] + 2 * f[i + 1] + f[i + W + 1] - f[i - W - 1] - 2 * f[i - 1] - f[i + W - 1];
      gy[i] = f[i + W - 1] + 2 * f[i + W] + f[i + W + 1] - f[i - W - 1] - 2 * f[i - W] - f[i - W + 1];
    }
  }

  // Orientation field per block (32x32 overlapping window).
  const bw = Math.floor(W / BLOCK);
  const bh = Math.floor(H / BLOCK);
  const c2 = new Float32Array(bw * bh);
  const s2 = new Float32Array(bw * bh);
  const valid = new Uint8Array(bw * bh);
  const coherenceMap = new Float32Array(bw * bh);
  const ridgeDir = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const xa = Math.max(1, bx * BLOCK - BLOCK / 2);
      const xb = Math.min(W - 1, (bx + 1) * BLOCK + BLOCK / 2);
      const ya = Math.max(1, by * BLOCK - BLOCK / 2);
      const yb = Math.min(H - 1, (by + 1) * BLOCK + BLOCK / 2);
      let gxx = 0;
      let gyy = 0;
      let gxy = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = y * W + x;
          gxx += gx[i] * gx[i];
          gyy += gy[i] * gy[i];
          gxy += gx[i] * gy[i];
        }
      }
      const area = (xb - xa) * (yb - ya);
      const mag = Math.sqrt((gxx - gyy) * (gxx - gyy) + 4 * gxy * gxy);
      const energy = (gxx + gyy) / area;
      const coh = gxx + gyy > 0 ? mag / (gxx + gyy) : 0;
      const b = by * bw + bx;
      coherenceMap[b] = coh;
      // Ridge direction = gradient direction + 90deg  ->  negate double-angle vector.
      c2[b] = -(gxx - gyy);
      s2[b] = -2 * gxy;
      ridgeDir[b] = mag > 0 ? 0.5 * Math.atan2(s2[b], c2[b]) : 0;
      if (coh >= 0.3 && energy >= 0.05) valid[b] = 1;
    }
  }

  // Ridge wavelength: x-signature on strongly oriented blocks, median.
  const periods: number[] = [];
  for (let by = 1; by < bh - 1; by++) {
    for (let bx = 1; bx < bw - 1; bx++) {
      const b = by * bw + bx;
      if (!valid[b] || coherenceMap[b] < 0.5) continue;
      const th = ridgeDir[b];
      const vx = Math.cos(th);
      const vy = Math.sin(th);
      const ux = -vy;
      const uy = vx;
      const cx = bx * BLOCK + BLOCK / 2;
      const cy = by * BLOCK + BLOCK / 2;
      const prof: number[] = [];
      for (let t = -16; t < 16; t++) {
        let acc = 0;
        for (let s = -8; s < 8; s++) {
          const px = Math.round(cx + t * ux + s * vx);
          const py = Math.round(cy + t * uy + s * vy);
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          acc += f[py * W + px];
        }
        prof.push(acc);
      }
      const sp = prof.map((v, i) => (i === 0 || i === prof.length - 1 ? v : (prof[i - 1] + 2 * v + prof[i + 1]) / 4));
      const peaks: number[] = [];
      for (let i = 1; i < sp.length - 1; i++) {
        if (sp[i] > sp[i - 1] && sp[i] >= sp[i + 1] && sp[i] > 0.5) peaks.push(i);
      }
      if (peaks.length >= 3) {
        const period = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1);
        if (period >= 4 && period <= 14) periods.push(period);
      }
    }
  }
  let lambda = 7;
  if (periods.length >= 5) {
    periods.sort((a, b) => a - b);
    lambda = Math.min(11, Math.max(5, periods[Math.floor(periods.length / 2)]));
  }

  // Per-pixel orientation by interpolating block double-angle vectors.
  const sc2 = new Float32Array(bw * bh);
  const ss2 = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let a = 0;
      let b2 = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = bx + dx;
          const yy = by + dy;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          const k = yy * bw + xx;
          if (!valid[k]) continue;
          a += c2[k];
          b2 += s2[k];
        }
      }
      sc2[by * bw + bx] = a;
      ss2[by * bw + bx] = b2;
    }
  }
  const theta = new Float32Array(n);
  const orient = new Uint8Array(n);
  const mask = new Uint8Array(n);
  const r = Math.ceil(2 * 0.5 * lambda);
  for (let y = r; y < H - r; y++) {
    const fy = Math.min(bh - 1, Math.max(0, (y - BLOCK / 2) / BLOCK));
    const y0 = Math.floor(fy);
    const y1 = Math.min(bh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = r; x < W - r; x++) {
      const fx = Math.min(bw - 1, Math.max(0, (x - BLOCK / 2) / BLOCK));
      const x0 = Math.floor(fx);
      const x1 = Math.min(bw - 1, x0 + 1);
      const tx = fx - x0;
      const blockValid = valid[Math.min(bh - 1, Math.floor(y / BLOCK)) * bw + Math.min(bw - 1, Math.floor(x / BLOCK))];
      const lerp = (a: Float32Array) =>
        (a[y0 * bw + x0] * (1 - tx) + a[y0 * bw + x1] * tx) * (1 - ty) +
        (a[y1 * bw + x0] * (1 - tx) + a[y1 * bw + x1] * tx) * ty;
      const a = lerp(sc2);
      const b2 = lerp(ss2);
      let th = 0.5 * Math.atan2(b2, a);
      if (th < 0) th += Math.PI;
      const i = y * W + x;
      theta[i] = th;
      orient[i] = Math.round((th / Math.PI) * ORIENTATIONS) % ORIENTATIONS;
      mask[i] = blockValid ? 1 : 0;
    }
  }

  // Gabor ridge enhancement + binarisation.
  const kernels = buildGabor(lambda);
  const kr = r;
  const ks = 2 * kr + 1;
  const binary = new Uint8Array(n);
  for (let y = kr; y < H - kr; y++) {
    for (let x = kr; x < W - kr; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const kernel = kernels[orient[i]];
      let acc = 0;
      for (let ky = -kr; ky <= kr; ky++) {
        const row = (y + ky) * W + x;
        const krow = (ky + kr) * ks + kr;
        for (let kx = -kr; kx <= kr; kx++) acc += f[row + kx] * kernel[krow + kx];
      }
      binary[i] = acc > 0 ? 1 : 0;
    }
  }
  // 3x3 majority clean-up.
  const cleaned = new Uint8Array(n);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += binary[i + dy * W + dx];
      cleaned[i] = c >= 5 ? 1 : 0;
    }
  }

  const skeleton = thin(cleaned, W, H);

  // Blocks whose whole 3x3 neighbourhood is valid are "safe" for minutiae.
  const safe = new Uint8Array(bw * bh);
  for (let by = 1; by < bh - 1; by++) {
    for (let bx = 1; bx < bw - 1; bx++) {
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (!valid[(by + dy) * bw + bx + dx]) ok = false;
      if (ok) safe[by * bw + bx] = 1;
    }
  }

  const neighbours = (i: number): number[] => {
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const j = i + dy * W + dx;
        if (skeleton[j]) out.push(j);
      }
    }
    return out;
  };

  type Candidate = { x: number; y: number; deg: number; score: number };
  const candidates: Candidate[] = [];
  const spurJunctions: number[][] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (!skeleton[i]) continue;
      const bi = Math.floor(y / BLOCK) * bw + Math.floor(x / BLOCK);
      if (!safe[bi]) continue;
      const p = [
        skeleton[i - W], skeleton[i - W + 1], skeleton[i + 1], skeleton[i + W + 1],
        skeleton[i + W], skeleton[i + W - 1], skeleton[i - 1], skeleton[i - W - 1],
      ];
      let cn = 0;
      for (let k = 0; k < 8; k++) cn += Math.abs(p[k] - p[(k + 1) % 8]);
      cn /= 2;
      if (cn !== 1 && cn !== 3) continue;
      if (cn === 1) {
        // Reject spurs: a very short branch that runs into a junction.
        let prev = i;
        let cur = neighbours(i)[0];
        let spur = false;
        let steps = 0;
        for (; steps < 8; steps++) {
          const next = neighbours(cur).filter((j) => j !== prev && j !== i);
          if (next.length === 0) {
            spur = true;
            break;
          }
          if (next.length >= 2) {
            spur = true;
            spurJunctions.push([x, y]);
            break;
          }
          prev = cur;
          cur = next[0];
        }
        if (spur) continue;
      }
      let deg = (theta[i] * 180) / Math.PI;
      deg = ((Math.round(deg) % 180) + 180) % 180;
      candidates.push({ x, y, deg, score: coherenceMap[bi] });
    }
  }

  const kept = candidates.filter((c) => !spurJunctions.some(([sx, sy]) => (c.x - sx) ** 2 + (c.y - sy) ** 2 < 36));
  const finalList = kept.filter((c, i) => {
    for (let j = 0; j < kept.length; j++) {
      if (i === j) continue;
      if ((c.x - kept[j].x) ** 2 + (c.y - kept[j].y) ** 2 < 49) return false;
    }
    return true;
  });
  finalList.sort((a, b) => b.score - a.score);
  const top = finalList.slice(0, 80);

  let validBlocks = 0;
  for (let b = 0; b < valid.length; b++) validBlocks += valid[b];
  const coverage = validBlocks / (bw * bh);
  const quality = Math.round(100 * (0.5 * Math.min(1, coverage / 0.55) + 0.5 * Math.min(1, top.length / 35)));

  const minutiae: number[] = [];
  for (const c of top) minutiae.push(c.x, c.y, c.deg);
  return { minutiae, quality, count: top.length, coverage };
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

function wrap180(d: number): number {
  return ((((d + 90) % 180) + 180) % 180) - 90;
}

/**
 * Hough-style alignment (rotation + translation) followed by greedy
 * one-to-one pairing. Score = pairs^2 / (nA * nB).
 */
export function matchMinutiae(a: number[], b: number[]): { score: number; pairs: number } {
  const na = a.length / 3;
  const nb = b.length / 3;
  if (na < FINGERPRINT_MIN_PAIRS || nb < FINGERPRINT_MIN_PAIRS) return { score: 0, pairs: 0 };

  const CX = CROP_W / 2;
  const CY = CROP_H / 2;
  const ROT_BIN = 6;
  const ROT_MAX = 30;
  const T_BIN = 8;
  const T_MAX = 104;
  const nr = (2 * ROT_MAX) / ROT_BIN + 1;
  const nt = (2 * T_MAX) / T_BIN + 1;
  const rOff = ROT_MAX / ROT_BIN;
  const tOff = T_MAX / T_BIN;
  const acc = new Int32Array(nr * nt * nt);

  const params = (i: number, j: number) => {
    const d = wrap180(b[j * 3 + 2] - a[i * 3 + 2]);
    if (Math.abs(d) > ROT_MAX) return null;
    const rad = (d * Math.PI) / 180;
    const cs = Math.cos(rad);
    const sn = Math.sin(rad);
    const ax = a[i * 3] - CX;
    const ay = a[i * 3 + 1] - CY;
    const tx = b[j * 3] - (ax * cs - ay * sn + CX);
    const ty = b[j * 3 + 1] - (ax * sn + ay * cs + CY);
    if (Math.abs(tx) > T_MAX || Math.abs(ty) > T_MAX) return null;
    return { d, tx, ty };
  };

  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      const p = params(i, j);
      if (!p) continue;
      const ri = Math.round(p.d / ROT_BIN) + rOff;
      const xi = Math.round(p.tx / T_BIN) + tOff;
      const yi = Math.round(p.ty / T_BIN) + tOff;
      acc[(ri * nt + yi) * nt + xi]++;
    }
  }

  let bestVotes = 0;
  let br = 0;
  let bx = 0;
  let by = 0;
  for (let ri = 0; ri < nr; ri++) {
    for (let yi = 0; yi < nt; yi++) {
      for (let xi = 0; xi < nt; xi++) {
        let v = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const r2 = ri + dr;
              const y2 = yi + dy;
              const x2 = xi + dx;
              if (r2 < 0 || y2 < 0 || x2 < 0 || r2 >= nr || y2 >= nt || x2 >= nt) continue;
              v += acc[(r2 * nt + y2) * nt + x2];
            }
          }
        }
        if (v > bestVotes) {
          bestVotes = v;
          br = ri;
          bx = xi;
          by = yi;
        }
      }
    }
  }
  if (bestVotes < 3) return { score: 0, pairs: 0 };

  let sd = 0;
  let stx = 0;
  let sty = 0;
  let cnt = 0;
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      const p = params(i, j);
      if (!p) continue;
      const ri = Math.round(p.d / ROT_BIN) + rOff;
      const xi = Math.round(p.tx / T_BIN) + tOff;
      const yi = Math.round(p.ty / T_BIN) + tOff;
      if (Math.abs(ri - br) <= 1 && Math.abs(xi - bx) <= 1 && Math.abs(yi - by) <= 1) {
        sd += p.d;
        stx += p.tx;
        sty += p.ty;
        cnt++;
      }
    }
  }
  const d = sd / cnt;
  const tx = stx / cnt;
  const ty = sty / cnt;
  const rad = (d * Math.PI) / 180;
  const cs = Math.cos(rad);
  const sn = Math.sin(rad);

  const used = new Uint8Array(nb);
  let pairs = 0;
  for (let i = 0; i < na; i++) {
    const ax = a[i * 3] - CX;
    const ay = a[i * 3 + 1] - CY;
    const x = ax * cs - ay * sn + CX + tx;
    const y = ax * sn + ay * cs + CY + ty;
    const ang = a[i * 3 + 2] + d;
    let bestJ = -1;
    let bestDist = 12 * 12;
    for (let j = 0; j < nb; j++) {
      if (used[j]) continue;
      const dist = (x - b[j * 3]) ** 2 + (y - b[j * 3 + 1]) ** 2;
      if (dist < bestDist && Math.abs(wrap180(b[j * 3 + 2] - ang)) <= 18) {
        bestDist = dist;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      used[bestJ] = 1;
      pairs++;
    }
  }
  return { score: (pairs * pairs) / (na * nb), pairs };
}

export type FingerScore = { score: number; pairs: number };

export function verifyFingerprints(
  queries: { minutiae: number[] }[],
  enrolled: FingerprintTemplate[]
): { verified: boolean; matches: number; required: number; results: FingerScore[] } {
  const results: FingerScore[] = queries.map((q) => {
    let best: FingerScore = { score: 0, pairs: 0 };
    for (const e of enrolled) {
      const m = matchMinutiae(q.minutiae, e.minutiae);
      if (m.score > best.score) best = m;
    }
    return best;
  });
  const matches = results.filter(
    (r) => r.score >= FINGERPRINT_MATCH_THRESHOLD && r.pairs >= FINGERPRINT_MIN_PAIRS
  ).length;
  const required = Math.min(2, queries.length);
  return { verified: queries.length > 0 && matches >= required, matches, required, results };
}
