import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ quiet: true });

export interface Config {
  apiKey: string;
  port: number;
  host: string;
  storageDir: string;
  videoModel: string;
  imageModel: string;
  authToken: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  imageUrlHosts: string[];
  imageInputDir: string;
  deadlineMs: number;
  pollMs: number;
  maxMediaBytes: number;
}
const integer = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error("Invalid numeric configuration");
  return n;
};
const list = (v?: string) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const storageDir = path.resolve(env.STORAGE_DIR ?? "./generated-videos");
  const model = (v: string) => {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(v))
      throw new Error("Invalid model identifier");
    return v;
  };
  return {
    apiKey: env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY ?? "",
    port: integer(env.PORT, 3000, 0, 65535),
    host: env.HOST ?? "127.0.0.1",
    storageDir,
    videoModel: model(env.VIDEO_MODEL ?? "veo-3.1-generate-preview"),
    imageModel: model(env.IMAGE_MODEL ?? "gemini-3.1-flash-image"),
    authToken: env.MCP_AUTH_TOKEN ?? "",
    allowedHosts: list(env.ALLOWED_HOSTS),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    imageUrlHosts: list(env.IMAGE_URL_HOSTS),
    imageInputDir: path.resolve(
      env.IMAGE_INPUT_DIR ?? path.join(storageDir, "images"),
    ),
    deadlineMs: integer(env.GENERATION_TIMEOUT_MS, 600000, 1000, 1800000),
    pollMs: integer(env.POLL_INTERVAL_MS, 10000, 10, 60000),
    maxMediaBytes: integer(
      env.MAX_MEDIA_BYTES,
      64 * 1024 * 1024,
      1024,
      128 * 1024 * 1024,
    ),
  };
}
