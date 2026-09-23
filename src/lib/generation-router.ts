import type { ProviderId } from "./providers";
import { PROVIDERS } from "./providers";

// Server-side router for real image + video generation. Routes over the same
// provider API keys the chat uses (decrypted on the client, sent per request)
// so keys never leave the server.

export interface VaultPayload {
  key?: string;
  connected?: boolean;
  endpoint?: string;
}

export interface GenerationCall {
  provider: ProviderId;
  model: string;
  prompt: string;
  apiKey: string;
  baseUrl?: string;
  size?: string;       // OpenAI-style "1024x1024" / "1024x1792" / "1792x1024"
  duration?: string;   // Sora seconds: "5" | "10" | "15"
  resolution?: string; // Sora: "480p" | "720p" | "1080p"
}

export interface GeneratedMedia {
  src: string;          // data: URL when we could inline the bytes, else the upstream URL
  url?: string;         // original upstream URL (set when src is NOT a data URL)
  mime?: string;
  filename?: string;
}

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_INLINE_BYTES = 18_000_000; // inline under ~18MB so chat history stays sane

function providerBase(provider: ProviderId, override?: string): string {
  return (override || PROVIDERS.find(p => p.id === provider)?.baseUrl || "").replace(/\/+$/, "");
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(bin);
}

// Fetch a remote media URL (often an expiring signed URL the user can't reuse
// later) and inline it as a data URL when it is small enough.
async function inlineIfSmall(url: string, apiKey?: string, limit = MAX_INLINE_BYTES): Promise<{ src: string; mime?: string } | null> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const ctype = r.headers.get("content-type") || "video/mp4";
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > limit) return null;
    return { src: `data:${ctype};base64,${toB64(buf)}`, mime: ctype };
  } catch {
    return null;
  }
}

/* --------------------------------- IMAGES --------------------------------- */

interface ImgData {
  b64_json?: string;
  url?: string;
}
interface ImageGenJson {
  data?: ImgData[];
  model?: string;
}
interface GenPart {
  text?: string;
  inlineData?: { data?: string; mimeType?: string };
}
interface GenCandidate {
  content?: { parts?: GenPart[] };
  modelVersion?: string;
}
interface ImagenPrediction {
  bytesBase64Encoded?: string;
  bytesBase64?: string;
  b64_json?: string;
}

export async function generateImage(call: GenerationCall): Promise<{ images: GeneratedMedia[]; meta?: unknown }> {
  if (call.provider === "google") return generateGoogleImage(call);

  const base = providerBase(call.provider, call.baseUrl);
  const isTogether = call.provider === "together";
  const body: Record<string, unknown> = {
    model: call.model,
    prompt: call.prompt,
    n: 1,
    response_format: "b64_json",
  };
  if (isTogether) {
    // Together uses width/height instead of OpenAI's `size` shorthand.
    const [w, h] = (call.size || "1024x1024").split("x").map(Number);
    body.width = w || 1024;
    body.height = h || 1024;
  } else if (call.size) {
    body.size = call.size;
  }

  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${call.apiKey}`,
      ...(call.provider === "openrouter" ? { "HTTP-Referer": "https://godeye.sandpgroup.com", "X-Title": "GodEye OS" } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`image ${call.provider}/${call.model} ${res.status}: ${txt.slice(0, 800)}`);
  }
  const json = (await res.json()) as ImageGenJson;
  const data: ImgData[] = Array.isArray(json.data) ? json.data : [];
  if (!data.length) throw new Error("Image provider returned no data");
  const stamp = Date.now();
  const images = data.map((d, i) => {
    if (typeof d?.b64_json === "string" && d.b64_json) {
      return { src: `data:image/png;base64,${d.b64_json}`, mime: "image/png", filename: `godeye-image-${stamp}-${i}.png` };
    }
    const url = String(d?.url || "").trim();
    if (url) return { src: url, url, mime: "image/png", filename: `godeye-image-${stamp}-${i}.png` };
    throw new Error("Image provider returned no data");
  });
  return { images, meta: { model: json.model } };
}

async function generateGoogleImage(call: GenerationCall): Promise<{ images: GeneratedMedia[]; meta?: unknown }> {
  const isImagen = /imagen/i.test(call.model);
  const isGemini = /gemini/i.test(call.model) || !isImagen;
  const stamp = Date.now();

  if (isGemini) {
    // Gemini native image output (responseModalities IMAGE) — works with
    // gemini-2.x-flash models that allow inline image output.
    const res = await fetch(
      `${GOOGLE_BASE}/models/${encodeURIComponent(call.model)}:generateContent?key=${encodeURIComponent(call.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: call.prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 1 },
        }),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`google ${call.model} ${res.status}: ${txt.slice(0, 800)}`);
    }
    const j = (await res.json()) as { candidates?: GenCandidate[] };
    const parts: GenPart[] = j.candidates?.[0]?.content?.parts ?? [];
    const images: GeneratedMedia[] = parts
      .filter(p => p?.inlineData?.data)
      .map((p, i) => ({
        src: `data:${p.inlineData?.mimeType || "image/png"};base64,${p.inlineData?.data}`,
        mime: p.inlineData?.mimeType || "image/png",
        filename: `godeye-image-${stamp}-${i}.png`,
      }));
    if (!images.length) throw new Error("Gemini returned no image");
    return { images, meta: { model: j.candidates?.[0]?.modelVersion } };
  }

  if (isImagen) {
    const ratio = call.size === "1792x1024" ? "16:9" : call.size === "1024x1792" ? "9:16" : "1:1";
    const res = await fetch(
      `${GOOGLE_BASE}/models/${encodeURIComponent(call.model)}:predict?key=${encodeURIComponent(call.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: call.prompt }],
          parameters: { sampleCount: 1, aspectRatio: ratio },
        }),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`imagen ${call.model} ${res.status}: ${txt.slice(0, 800)}`);
    }
    const j = (await res.json()) as { predictions?: ImagenPrediction[] };
    const pred = j.predictions?.[0];
    const b64 = pred?.bytesBase64Encoded ?? pred?.bytesBase64 ?? pred?.b64_json;
    if (!b64) throw new Error("Imagen returned no prediction bytes");
    return {
      images: [{ src: `data:image/png;base64,${b64}`, mime: "image/png", filename: `godeye-image-${stamp}.png` }],
      meta: { model: call.model },
    };
  }

  return { images: [] };
}

/* --------------------------------- VIDEOS --------------------------------- */

// Submit a video generation job. Returns an opaque `job` handle that is safe to
// pass back to the client so it can poll status without keeping the key in the
// URL. OpenAI: the /videos job id. Google: the long-running operation name.
export async function submitVideo(call: GenerationCall): Promise<{ job: string }> {
  if (call.provider === "google") {
    const res = await fetch(
      `${GOOGLE_BASE}/models/${encodeURIComponent(call.model)}:generateVideos?key=${encodeURIComponent(call.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: call.prompt }],
          parameters: {},
        }),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`veo ${call.model} ${res.status}: ${txt.slice(0, 800)}`);
    }
    const j = (await res.json()) as { name?: string };
    const name = String(j.name || "");
    if (!name) throw new Error("veo: provider returned no operation");
    return { job: name };
  }

  // OpenAI-compatible video job (Sora family via /v1/videos).
  const base = providerBase(call.provider, call.baseUrl || "https://api.openai.com/v1");
  const body: Record<string, unknown> = { model: call.model, input: [{ text: call.prompt }] };
  if (call.duration) body.duration = Number(call.duration);
  if (call.resolution) body.resolution = call.resolution;
  const res = await fetch(`${base}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${call.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`sora ${call.model} ${res.status}: ${txt.slice(0, 800)}`);
  }
  const j = (await res.json()) as { id?: string };
  const id = String(j.id || "");
  if (!id) throw new Error("sora: provider returned no job id");
  return { job: id };
}

export interface VideoPollResult {
  status: "pending" | "done" | "error";
  jobState?: string;
  error?: string;
  videos?: GeneratedMedia[];
}

const ERROR_STATES = ["failed", "error", "canceled", "cancelled"];

interface VeoGenVideo {
  video?: { uri?: string };
}
interface VeoOperation {
  done?: boolean;
  response?: { generatedVideos?: VeoGenVideo[] };
}
interface SoraJob {
  status?: string;
  error?: { message?: string };
  asset?: { video?: { url?: string } };
}

export async function pollVideo(call: GenerationCall, job: string): Promise<VideoPollResult> {
  if (call.provider === "google") {
    const opPath = job.replace(/^\/+/, "");
    const res = await fetch(`${GOOGLE_BASE}/${opPath}?key=${encodeURIComponent(call.apiKey)}`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { status: "error", error: `veo poll ${res.status}: ${txt.slice(0, 400)}` };
    }
    const j = (await res.json()) as VeoOperation;
    if (!j.done) return { status: "pending", jobState: "in_progress" };
    const vids: VeoGenVideo[] = Array.isArray(j.response?.generatedVideos) ? j.response.generatedVideos : [];
    if (!vids.length) return { status: "error", error: "Veo returned no generated videos" };
    const stamp = Date.now();
    const videos: GeneratedMedia[] = [];
    for (let i = 0; i < vids.length; i++) {
      const uri = String(vids[i]?.video?.uri || "").trim();
      if (!uri) continue;
      const inline = await inlineIfSmall(uri);
      videos.push(
        inline
          ? { ...inline, filename: `godeye-video-${stamp}-${i}.mp4` }
          : { src: uri, url: uri, mime: "video/mp4", filename: `godeye-video-${stamp}-${i}.mp4` }
      );
    }
    return videos.length ? { status: "done", videos } : { status: "error", error: "Veo returned no playable video" };
  }

  // OpenAI Sora: poll GET /v1/videos/{id}.
  const base = providerBase(call.provider, call.baseUrl || "https://api.openai.com/v1");
  const res = await fetch(`${base}/videos/${encodeURIComponent(job)}`, {
    headers: { Authorization: `Bearer ${call.apiKey}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { status: "error", error: `sora poll ${res.status}: ${txt.slice(0, 400)}` };
  }
  const j = (await res.json()) as SoraJob;
  const st = String(j.status || "in_progress").toLowerCase();
  if (ERROR_STATES.includes(st)) return { status: "error", error: j.error?.message || "Sora video generation failed" };
  if (st !== "completed" && st !== "succeeded") return { status: "pending", jobState: st };

  const url = String(j.asset?.video?.url || "").trim();
  if (!url) return { status: "error", error: "Sora completed but returned no video URL" };
  const inline = await inlineIfSmall(url, call.apiKey);
  const filename = `godeye-video-${Date.now()}.mp4`;
  return {
    status: "done",
    videos: inline
      ? [{ ...inline, filename, url }]
      : [{ src: url, url, mime: "video/mp4", filename }],
  };
}