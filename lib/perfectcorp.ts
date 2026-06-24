// Perfect Corp (YouCam) AI API client.
//
// Auth: `Authorization: Bearer <PERFECTCORP_CLIENT_ID>` (the API key).
//
// Skin analysis (face), all verified live:
//   1. POST {base}/s2s/v2.1/file/skin-analysis  {files:[{content_type,file_name,file_size}]}
//        -> data.files[0].{file_id, requests:[{method,url,headers}]}
//   2. PUT the JPEG bytes to that presigned url with the given headers
//   3. POST {base}/s2s/v2.1/task/skin-analysis  {src_file_id, dst_actions, ...} -> data.task_id
//   4. GET  {base}/s2s/v2.1/task/skin-analysis/{task_id} until data.task_status==="success"
// We upload bytes directly (not an S3 URL) — the provider stores the image and
// deletes it within 24h, so we never persist the photo ourselves.
//
// Output items: { type:"hd_*", ui_score:0..100, region } plus { type:"all",
// score } (overall) and { type:"skin_age", score }. ui_score is a HEALTH score
// (higher = better skin) — Perfect Corp's standard format — kept as 0..1.
//
// Hair analysis is a separate contract (4 features) — pending wiring.

import type { AnalysisKind, AnalysisResult, Issue } from "@/lib/analysis";

const SKIN_FILE_PATH = "/s2s/v2.1/file/skin-analysis";
const SKIN_TASK_PATH = "/s2s/v2.1/task/skin-analysis";

const SKIN_DST_ACTIONS = [
  "tear_trough",
  "skin_type",
  "wrinkle",
  "texture",
  "redness",
  "age_spot",
  "radiance",
  "pore",
  "moisture",
  "oiliness",
  "eye_bag",
  "firmness",
  "droopy_upper_eyelid",
  "droopy_lower_eyelid",
  "acne",
  "dark_circle_v2",
];

const SKIN_CONCERN_MAP: Record<string, string> = {
  acne: "acne",
  wrinkle: "wrinkles",
  pore: "pores",
  texture: "texture",
  redness: "redness",
  oiliness: "oiliness",
  moisture: "moisture",
  radiance: "radiance",
  firmness: "firmness",
  dark_circle_v2: "dark_circle",
  eye_bag: "eye_bag",
  tear_trough: "tear_trough",
  droopy_upper_eyelid: "droopy_upper_eyelid",
  droopy_lower_eyelid: "droopy_lower_eyelid",
  age_spot: "age_spot",
};

export function isPerfectCorpConfigured(): boolean {
  return Boolean(
    process.env.PERFECTCORP_CLIENT_ID && process.env.PERFECTCORP_API_BASE,
  );
}

function apiBase(): string {
  return process.env.PERFECTCORP_API_BASE!.replace(/\/+$/, "");
}

function authHeader(): string {
  return `Bearer ${process.env.PERFECTCORP_CLIENT_ID}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Register a file, PUT the bytes, return the provider file_id. */
async function uploadFile(filePath: string, jpeg: Buffer): Promise<string> {
  const reg = await fetch(`${apiBase()}${filePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      files: [
        { content_type: "image/jpeg", file_name: "image.jpg", file_size: jpeg.length },
      ],
    }),
  });
  if (!reg.ok) throw new Error(`perfectcorp_file_register_${reg.status}`);

  const json: unknown = await reg.json();
  const file =
    isRecord(json) && isRecord(json.data) && Array.isArray(json.data.files)
      ? json.data.files[0]
      : undefined;
  if (
    !isRecord(file) ||
    typeof file.file_id !== "string" ||
    !Array.isArray(file.requests) ||
    !isRecord(file.requests[0]) ||
    typeof file.requests[0].url !== "string"
  ) {
    throw new Error("perfectcorp_file_register_bad_response");
  }

  const upReq = file.requests[0];
  const put = await fetch(upReq.url as string, {
    method: typeof upReq.method === "string" ? upReq.method : "PUT",
    headers: isRecord(upReq.headers)
      ? (upReq.headers as Record<string, string>)
      : {},
    body: new Uint8Array(jpeg),
  });
  if (!put.ok) throw new Error(`perfectcorp_file_put_${put.status}`);

  return file.file_id;
}

async function startSkinTask(fileId: string): Promise<string> {
  const res = await fetch(`${apiBase()}${SKIN_TASK_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      src_file_id: fileId,
      dst_actions: SKIN_DST_ACTIONS,
      miniserver_args: { enable_mask_overlay: true },
      format: "json",
      pf_camera_kit: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (/CreditInsufficiency/i.test(body)) throw new Error("provider_credits");
    throw new Error(`perfectcorp_skin_start_${res.status}: ${body.slice(0, 200)}`);
  }
  const json: unknown = await res.json();
  const taskId =
    isRecord(json) && isRecord(json.data) && typeof json.data.task_id === "string"
      ? json.data.task_id
      : null;
  if (!taskId) throw new Error("perfectcorp_no_task_id");
  return taskId;
}

async function pollSkinTask(taskId: string): Promise<unknown> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(
      `${apiBase()}${SKIN_TASK_PATH}/${encodeURIComponent(taskId)}`,
      { headers: { Authorization: authHeader() } },
    );
    if (!res.ok) throw new Error(`perfectcorp_skin_poll_${res.status}`);
    const json: unknown = await res.json();
    const data = isRecord(json) && isRecord(json.data) ? json.data : undefined;
    const status = data?.task_status;
    if (status === "success") return json;
    if (status === "error") {
      const detail =
        data && typeof data.error === "string" ? data.error : "unknown";
      // Surface common capture problems with friendly, fixable messages.
      if (/lighting|dark|bright|exposure/i.test(detail))
        throw new Error("low_quality");
      if (/face|subject/i.test(detail)) throw new Error("no_subject");
      throw new Error(`perfectcorp_task_${detail}`);
    }
    await sleep(2000);
  }
  throw new Error("perfectcorp_skin_timeout");
}

function firstMask(item: Record<string, unknown>): string | null {
  return Array.isArray(item.mask_urls) && typeof item.mask_urls[0] === "string"
    ? item.mask_urls[0]
    : null;
}

/** Map a raw skin-analysis poll payload into our normalized issues. */
export function parseSkin(raw: unknown): Issue[] {
  if (
    !isRecord(raw) ||
    !isRecord(raw.data) ||
    !isRecord(raw.data.results) ||
    !Array.isArray(raw.data.results.output)
  ) {
    return [];
  }

  const byType = new Map<string, Issue>();
  const prefersWhole = (region: unknown) =>
    region === "whole" || region === undefined || region === null;

  for (const item of raw.data.results.output) {
    if (!isRecord(item) || typeof item.type !== "string") continue;
    const type = item.type;

    if (type === "skin_type") {
      // Multiple zones (whole / t_zone / u_zone) — keep the "whole" one.
      const existing = byType.get("skin_type");
      if (!existing || item.region === "whole") {
        byType.set("skin_type", {
          issueType: "skin_type",
          score: null,
          confidence: null,
          image: firstMask(item),
          details: {
            type:
              typeof item.skin_type === "string"
                ? item.skin_type.toLowerCase()
                : undefined,
          },
        });
      }
      continue;
    }

    // The analyzed (resized) photo — used as the base image in the viewer.
    if (type === "resize_image") {
      byType.set("resize_image", {
        issueType: "resize_image",
        score: null,
        confidence: null,
        image: firstMask(item),
      });
      continue;
    }

    // Overall skin score and skin age use `score` (not ui_score).
    if (type === "all" && typeof item.score === "number") {
      byType.set("overall", {
        issueType: "overall",
        score: Math.min(1, Math.max(0, item.score / 100)),
        confidence: null,
      });
      continue;
    }
    if (type === "skin_age" && typeof item.score === "number") {
      byType.set("skin_age", {
        issueType: "skin_age",
        score: null,
        confidence: null,
        details: { type: String(Math.round(item.score)) },
      });
      continue;
    }

    const mapped = SKIN_CONCERN_MAP[type];
    if (!mapped || typeof item.ui_score !== "number") continue;

    // Standard format: keep the health score as-is (higher = better skin).
    const score = Math.min(1, Math.max(0, item.ui_score / 100));
    const existing = byType.get(mapped);
    if (!existing || prefersWhole(item.region)) {
      byType.set(mapped, {
        issueType: mapped,
        score,
        confidence: score,
        image: firstMask(item),
      });
    }
  }

  return [...byType.values()];
}

// Strip the (expiring, face-bearing) image URLs before we persist the raw JSON.
function sanitizeRaw(raw: unknown): unknown {
  try {
    const clone = JSON.parse(JSON.stringify(raw));
    const out = clone?.data?.results?.output;
    if (Array.isArray(out)) {
      for (const it of out) {
        if (it && typeof it === "object") {
          delete it.mask_urls;
          delete it.url;
        }
      }
    }
    return clone;
  } catch {
    return null;
  }
}

export async function analyzeWithPerfectCorp(
  kind: AnalysisKind,
  jpeg: Buffer,
): Promise<AnalysisResult> {
  if (kind === "face") {
    const fileId = await uploadFile(SKIN_FILE_PATH, jpeg);
    const taskId = await startSkinTask(fileId);
    const raw = await pollSkinTask(taskId);
    const issues = parseSkin(raw);
    // Persist the raw JSON without the (expiring) face-image URLs.
    return { requestId: taskId, raw: sanitizeRaw(raw), issues };
  }
  // Hair contract not wired yet (4 separate features).
  throw new Error("perfectcorp_hair_pending");
}
