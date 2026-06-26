// Client-side face detection (MediaPipe) used to guide capture and auto-snap a
// well-framed photo. Loaded lazily in the browser only.

import type { Detection, FaceDetector } from "@mediapipe/tasks-vision";

// Self-hosted from our own origin (see scripts/copy-mediapipe.mjs + public/models)
// — no third-party CDN dependency, and cacheable with the app.
const WASM_URL = "/mediapipe/wasm";
const MODEL_URL = "/models/blaze_face_short_range.tflite";

let detectorPromise: Promise<FaceDetector> | null = null;

export function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, FaceDetector } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
      });
    })();
  }
  return detectorPromise;
}

// Portrait capture (Perfect Corp recommends portrait over landscape).
export const CAPTURE_AR = 3 / 4; // width / height

export type Crop = { x: number; y: number; w: number; h: number };

/** Largest centered crop of the given aspect ratio inside a W×H frame. */
export function computeCrop(W: number, H: number, ar = CAPTURE_AR): Crop {
  let w: number;
  let h: number;
  if (W / H >= ar) {
    h = H;
    w = H * ar;
  } else {
    w = W;
    h = W / ar;
  }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export type FaceQuality = { ok: boolean; message: string; score: number };

// Framing thresholds, relative to the portrait crop. Face size is judged by
// HEIGHT so the head can't be pushed out the top/bottom of the frame.
const MIN_HEIGHT_RATIO = 0.46; // face height / crop height
const MAX_HEIGHT_RATIO = 0.66; // leave headroom for forehead/hair + chin
const IDEAL_HEIGHT_RATIO = 0.56;
const MAX_OFFSET_X = 0.14;
const MAX_OFFSET_Y = 0.16;
const MAX_TILT = 0.18; // |eye y diff| / interocular distance
const MAX_NOSE = 0.32; // |nose x − eye midpoint| / interocular distance
const DARK = 70; // avg luma (0–255) below this is too dark
const BRIGHT = 215; // above this is over-exposed
// Sharpness = variance of the Laplacian on a 64px face-box sample. Absolute
// scale is device-dependent — tune if auto-capture feels too eager / too strict.
const SHARP_GATE = 16; // below this the face is clearly blurry → block capture
const SHARP_IDEAL = 180; // at/above this it's crisp (full sub-score)

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Judge whether the detected face is well-framed (within the crop), and produce
 * a live 0–100 quality estimate. `brightness` is the average luma (0–255) of the
 * face region, or null if not sampled.
 */
export function evaluateFace(
  detections: Detection[],
  crop: Crop,
  W: number,
  H: number,
  brightness: number | null = null,
  sharpness: number | null = null,
): FaceQuality {
  if (detections.length === 0)
    return { ok: false, message: "Looking for your face…", score: 0 };
  if (detections.length > 1)
    return { ok: false, message: "Only one face in frame, please", score: 0 };

  const d = detections[0];
  const bb = d.boundingBox;
  if (!bb) return { ok: false, message: "Looking for your face…", score: 0 };

  const fcx = bb.originX + bb.width / 2;
  const fcy = bb.originY + bb.height / 2;
  const rx = (fcx - crop.x) / crop.w; // 0..1 within the crop
  const ry = (fcy - crop.y) / crop.h;
  const heightRatio = bb.height / crop.h;

  // Pose from keypoints (0 right eye, 1 left eye, 2 nose), in pixels.
  let tilt = 0;
  let nose = 0;
  const kp = d.keypoints;
  if (kp && kp.length >= 3) {
    const re = { x: kp[0].x * W, y: kp[0].y * H };
    const le = { x: kp[1].x * W, y: kp[1].y * H };
    const nt = { x: kp[2].x * W, y: kp[2].y * H };
    const eyeDist = Math.hypot(re.x - le.x, re.y - le.y) || 1;
    tilt = Math.abs(re.y - le.y) / eyeDist;
    nose = Math.abs(nt.x - (re.x + le.x) / 2) / eyeDist;
  }

  const conf = d.categories?.[0]?.score ?? 1;

  // Continuous 0–1 sub-scores for the live estimate.
  const sizeS = clamp01(1 - Math.abs(heightRatio - IDEAL_HEIGHT_RATIO) / 0.18);
  const centerS = clamp01(
    1 - (Math.abs(rx - 0.5) / 0.18 + Math.abs(ry - 0.5) / 0.2) / 2,
  );
  const tiltS = clamp01(1 - tilt / 0.22);
  const frontalS = clamp01(1 - nose / 0.4);
  const confS = clamp01(conf);
  const brightS =
    brightness == null
      ? 1
      : brightness < DARK
        ? clamp01(brightness / DARK)
        : brightness > BRIGHT
          ? clamp01((255 - brightness) / 40)
          : 1;
  const sharpS =
    sharpness == null
      ? 1
      : clamp01((sharpness - SHARP_GATE) / (SHARP_IDEAL - SHARP_GATE));
  // Weights favour what Face++ facequality actually penalises: blur + lighting +
  // framing. Detection confidence is near-constant for any face, so it's minor.
  const score = Math.round(
    100 *
      (0.22 * sizeS +
        0.15 * centerS +
        0.16 * frontalS +
        0.12 * tiltS +
        0.2 * sharpS +
        0.12 * brightS +
        0.03 * confS),
  );

  // Hard checks decide whether we can capture, and which hint to show.
  let message = "Hold still…";
  let ok = true;
  if (heightRatio < MIN_HEIGHT_RATIO) (ok = false), (message = "Move closer");
  else if (heightRatio > MAX_HEIGHT_RATIO)
    (ok = false), (message = "Move back a little");
  else if (Math.abs(rx - 0.5) > MAX_OFFSET_X || Math.abs(ry - 0.5) > MAX_OFFSET_Y)
    (ok = false), (message = "Center your face");
  else if (tilt > MAX_TILT) (ok = false), (message = "Keep your head level");
  else if (nose > MAX_NOSE)
    (ok = false), (message = "Look straight at the camera");
  else if (sharpness != null && sharpness < SHARP_GATE)
    (ok = false), (message = "Hold steady — stay in focus");
  else if (brightness != null && brightness < DARK)
    (ok = false), (message = "Find brighter light");
  else if (brightness != null && brightness > BRIGHT)
    (ok = false), (message = "Too bright — reduce glare");

  return { ok, message, score };
}
