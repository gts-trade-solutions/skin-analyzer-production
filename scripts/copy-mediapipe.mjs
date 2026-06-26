// Copies the MediaPipe tasks-vision wasm runtime out of node_modules into
// public/mediapipe/wasm so it's served from our own origin (no third-party CDN).
// Runs automatically before `dev` and `build`. The model .tflite is committed
// separately under public/models.
import { mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("[copy-mediapipe] source not found, skipping:", src);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (f.endsWith(".js") || f.endsWith(".wasm")) {
    copyFileSync(join(src, f), join(dest, f));
    n++;
  }
}
console.log(`[copy-mediapipe] copied ${n} files → public/mediapipe/wasm`);
