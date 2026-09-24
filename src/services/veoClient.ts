import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Config } from "../config.js";

export type Kind = "videos" | "images";
export interface Media {
  id: string;
  createdAt: string;
  prompt: string;
  mimeType: string;
  size: number;
  resourceUri: string;
}
export interface VideoOptions {
  aspectRatio?: string;
  durationSeconds?: number;
  personGeneration?: string;
  negativePrompt?: string;
  resolution?: string;
}
const api = "https://generativelanguage.googleapis.com/v1beta";
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = {
  "video/mp4": ".mp4",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function validateMedia(bytes: Buffer, mime: string): void {
  const valid =
    mime === "video/mp4"
      ? bytes.subarray(4, 8).toString() === "ftyp"
      : mime === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : mime === "image/webp"
            ? bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP"
            : false;
  if (!valid) throw new Error("Unsupported or invalid media bytes");
}
export async function boundedBody(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("Media exceeds size limit");
  }
  if (!response.body) throw new Error("Empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error("Media exceeds size limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class MediaStore {
  constructor(readonly config: Config) {}
  directory(kind: Kind) {
    return kind === "videos"
      ? this.config.storageDir
      : path.join(this.config.storageDir, "images");
  }
  private clean(value: string): string {
    return this.config.apiKey
      ? value.split(this.config.apiKey).join("[redacted]")
      : value;
  }
  async initialize() {
    for (const kind of ["videos", "images"] as const) {
      await fs.mkdir(this.directory(kind), { recursive: true, mode: 0o700 });
      // Rewrite legacy metadata through an allowlist: discard key-bearing URLs,
      // absolute paths and arbitrary fields. No media file is deleted or moved.
      for (const file of await fs.readdir(this.directory(kind))) {
        if (!file.endsWith(".json") || !idPattern.test(file.slice(0, -5)))
          continue;
        try {
          const item = await this.metadata(kind, file.slice(0, -5));
          await this.writeMetadata(kind, item);
        } catch {
          /* Invalid historical records are not exposed. */
        }
      }
    }
  }
  async writeMetadata(kind: Kind, item: Media) {
    const target = path.join(this.directory(kind), item.id + ".json");
    const temp = target + "." + randomUUID() + ".tmp";
    try {
      await fs.writeFile(temp, JSON.stringify(item), {
        mode: 0o600,
        flag: "wx",
      });
      await fs.rename(temp, target);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }
  async metadata(kind: Kind, id: string): Promise<Media> {
    if (!idPattern.test(id)) throw new Error("Invalid media ID");
    const file = path.join(this.directory(kind), id + ".json");
    const handle = await fs.open(file, "r");
    let data;
    try {
      if ((await handle.stat()).size > 65536)
        throw new Error("Invalid metadata");
      try {
        data = JSON.parse(await handle.readFile("utf8"));
      } catch {
        throw new Error("Invalid media metadata");
      }
    } finally {
      await handle.close();
    }
    if (
      data.id !== id ||
      !extensions[data.mimeType] ||
      !Number.isSafeInteger(data.size) ||
      data.size < 0
    )
      throw new Error("Invalid metadata");
    return {
      id,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
      prompt: this.clean(typeof data.prompt === "string" ? data.prompt : ""),
      mimeType: data.mimeType,
      size: data.size,
      resourceUri: kind + "://" + id,
    };
  }
  async list(kind: Kind): Promise<Media[]> {
    const items: Media[] = [];
    for (const file of (await fs.readdir(this.directory(kind))).sort()) {
      if (!file.endsWith(".json")) continue;
      try {
        items.push(await this.metadata(kind, file.slice(0, -5)));
      } catch {
        /* Skip malformed legacy records. */
      }
    }
    return items;
  }
  async save(
    kind: Kind,
    bytes: Buffer,
    mimeType: string,
    prompt: string,
  ): Promise<Media> {
    if (bytes.length > this.config.maxMediaBytes)
      throw new Error("Media exceeds size limit");
    validateMedia(bytes, mimeType);
    const id = randomUUID();
    const item = {
      id,
      createdAt: new Date().toISOString(),
      prompt: this.clean(prompt),
      mimeType,
      size: bytes.length,
      resourceUri: kind + "://" + id,
    };
    const file = path.join(this.directory(kind), id + extensions[mimeType]);
    await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    try {
      await this.writeMetadata(kind, item);
    } catch (error) {
      await fs.unlink(file);
      throw error;
    }
    return item;
  }
  async bytes(
    kind: Kind,
    id: string,
    limit = this.config.maxMediaBytes,
  ): Promise<{ item: Media; bytes: Buffer }> {
    const item = await this.metadata(kind, id);
    const file = path.join(
      this.directory(kind),
      id + extensions[item.mimeType],
    );
    const handle = await fs.open(file, "r");
    let bytes: Buffer;
    try {
      if ((await handle.stat()).size > limit)
        throw new Error(
          "Media exceeds inline size limit; use a smaller generation",
        );
      bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
    validateMedia(bytes, item.mimeType);
    return { item, bytes };
  }
}
export class VeoClient {
  constructor(
    readonly config: Config,
    readonly store: MediaStore,
    readonly fetcher: typeof fetch = fetch,
  ) {}
  async request(
    url: string,
    signal: AbortSignal,
    body?: unknown,
  ): Promise<any> {
    if (!this.config.apiKey)
      throw new Error("GOOGLE_API_KEY is required for generation");
    const response = await this.fetcher(url, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      headers: {
        "x-goog-api-key": this.config.apiKey,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        "Google API request failed (HTTP " +
          response.status +
          "); check model access, quota and billing",
      );
    }
    const bytes = await boundedBody(
      response,
      this.config.maxMediaBytes * 2,
      signal,
    );
    try {
      return JSON.parse(bytes.toString());
    } catch {
      throw new Error("Invalid Google API response");
    }
  }
  async download(
    rawUrl: string,
    signal: AbortSignal,
    provider = true,
  ): Promise<Buffer> {
    let url = new URL(rawUrl);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const host = url.hostname;
      const trusted = provider
        ? host === "generativelanguage.googleapis.com" ||
          host === "storage.googleapis.com" ||
          host.endsWith(".googleusercontent.com")
        : this.config.imageUrlHosts.includes(host);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        !trusted
      )
        throw new Error("Media URL host is not allowed");
      for (const key of [...url.searchParams.keys()])
        if (/^(key|api_key|apikey)$/i.test(key)) url.searchParams.delete(key);
      const headers: Record<string, string> = {};
      if (provider && host === "generativelanguage.googleapis.com")
        headers["x-goog-api-key"] = this.config.apiKey;
      const response = await this.fetcher(url, {
        headers,
        signal,
        redirect: "manual",
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const next = response.headers.get("location");
        if (!next) throw new Error("Invalid media redirect");
        url = new URL(next, url);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Media download failed (HTTP " + response.status + ")");
      }
      return boundedBody(response, this.config.maxMediaBytes, signal);
    }
    throw new Error("Too many media redirects");
  }
  async imageInput(
    input: string | { data: string; mimeType: string },
    signal: AbortSignal,
  ) {
    let bytes: Buffer;
    let mimeType = typeof input === "string" ? "image/png" : input.mimeType;
    const value = typeof input === "string" ? input : input.data;
    if (/^https?:/.test(value)) {
      bytes = await this.download(value, signal, false);
      mimeType =
        bytes[0] === 255
          ? "image/jpeg"
          : bytes.subarray(0, 4).toString() === "RIFF"
            ? "image/webp"
            : "image/png";
    } else if (
      typeof input === "string" &&
      (path.isAbsolute(value) || value.startsWith("./"))
    ) {
      const root = await fs.realpath(this.config.imageInputDir);
      const file = await fs.realpath(path.resolve(value));
      if (
        path.relative(root, file).startsWith("..") ||
        path.isAbsolute(path.relative(root, file))
      )
        throw new Error("Image file is outside IMAGE_INPUT_DIR");
      const handle = await fs.open(file, "r");
      try {
        if ((await handle.stat()).size > 10 * 1024 * 1024)
          throw new Error("Input image exceeds 10 MiB");
        bytes = await handle.readFile();
      } finally {
        await handle.close();
      }
      mimeType =
        bytes[0] === 255
          ? "image/jpeg"
          : bytes.subarray(0, 4).toString() === "RIFF"
            ? "image/webp"
            : "image/png";
    } else {
      if (
        value.length > 14 * 1024 * 1024 ||
        !/^[a-zA-Z0-9+/]*={0,2}$/.test(value) ||
        value.length % 4
      )
        throw new Error("Invalid base64 image");
      bytes = Buffer.from(value, "base64");
    }
    if (bytes.length > 10 * 1024 * 1024)
      throw new Error("Input image exceeds 10 MiB");
    validateMedia(bytes, mimeType);
    return { bytesBase64Encoded: bytes.toString("base64"), mimeType };
  }
  async generateVideo(
    prompt: string,
    options: VideoOptions,
    signal: AbortSignal,
    input?: string | { data: string; mimeType: string },
  ): Promise<Media> {
    const image =
      input === undefined ? undefined : await this.imageInput(input, signal);
    const instance = { prompt, ...(image ? { image } : {}) };
    let operation = await this.request(
      api + "/models/" + this.config.videoModel + ":predictLongRunning",
      signal,
      {
        instances: [instance],
        parameters: {
          sampleCount: 1,
          aspectRatio: options.aspectRatio ?? "16:9",
          durationSeconds: options.durationSeconds ?? 8,
          personGeneration:
            options.personGeneration ?? (image ? "allow_adult" : "allow_all"),
          ...(options.negativePrompt
            ? { negativePrompt: options.negativePrompt }
            : {}),
          resolution: options.resolution ?? "720p",
        },
      },
    );
    while (!operation.done) {
      if (
        typeof operation.name !== "string" ||
        !/^(models\/[a-zA-Z0-9._-]+\/)?operations\/[a-zA-Z0-9._-]+$/.test(
          operation.name,
        )
      )
        throw new Error("Invalid Google operation identifier");
      await delay(this.config.pollMs, undefined, { signal });
      operation = await this.request(api + "/" + operation.name, signal);
    }
    if (operation.error)
      throw new Error(
        "Google video generation failed; check provider safety and quota settings",
      );
    const uri =
      operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video
        ?.uri;
    if (typeof uri !== "string")
      throw new Error(
        "Google returned no video; generation may have been filtered",
      );
    const bytes = await this.download(uri, signal);
    return this.store.save("videos", bytes, "video/mp4", prompt);
  }
  async generateImage(prompt: string, signal: AbortSignal): Promise<Media> {
    // generateContent remains supported; no provider-side conversation is stored.
    const result = await this.request(
      api + "/models/" + this.config.imageModel + ":generateContent",
      signal,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      },
    );
    const part = result.candidates
      ?.flatMap((c: any) => c.content?.parts ?? [])
      .find((p: any) => p.inlineData)?.inlineData;
    if (typeof part?.data !== "string" || typeof part?.mimeType !== "string")
      throw new Error(
        "Google returned no image; generation may have been filtered",
      );
    if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(part.data))
      throw new Error("Invalid generated image");
    return this.store.save(
      "images",
      Buffer.from(part.data, "base64"),
      part.mimeType,
      prompt,
    );
  }
}
