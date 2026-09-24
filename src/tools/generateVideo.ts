import {
  McpServer,
  type CallToolResult,
  type ServerContext,
  type ContentBlock,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Config } from "../config.js";
import {
  MediaStore,
  VeoClient,
  type Kind,
  type Media,
} from "../services/veoClient.js";

const bool = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");
const videoFields = {
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  durationSeconds: z
    .union([z.literal(4), z.literal(6), z.literal(8)])
    .default(8),
  numberOfVideos: z.literal(1).default(1),
  personGeneration: z.enum(["allow_all", "allow_adult"]).optional(),
  resolution: z.enum(["720p", "1080p", "4k"]).default("720p"),
  negativePrompt: z.string().max(2000).optional(),
  enhancePrompt: bool
    .pipe(z.literal(false))
    .default(false)
    .describe("Deprecated; only false is accepted"),
  autoDownload: bool
    .pipe(z.literal(true))
    .default(true)
    .describe("Media must be downloaded server-side; only true is accepted"),
  includeFullData: bool.default(false),
};
const prompt = z.string().min(1).max(4000);
export async function mediaResult(
  store: MediaStore,
  kind: Kind,
  item: Media,
  inline: boolean,
): Promise<CallToolResult> {
  const content: ContentBlock[] = [
    {
      type: "resource_link",
      uri: item.resourceUri,
      name: item.id,
      mimeType: item.mimeType,
    },
  ];
  if (inline) {
    const { bytes } = await store.bytes(kind, item.id, 8 * 1024 * 1024);
    content.push(
      kind === "images"
        ? {
            type: "image",
            mimeType: item.mimeType,
            data: bytes.toString("base64"),
          }
        : {
            type: "resource",
            resource: {
              uri: item.resourceUri,
              mimeType: item.mimeType,
              blob: bytes.toString("base64"),
            },
          },
    );
  }
  content.push({ type: "text", text: JSON.stringify(item) });
  return { content, structuredContent: { ...item } };
}
export function registerTools(
  server: McpServer,
  config: Config,
  store: MediaStore,
  provider: VeoClient,
) {
  function register(
    name: string,
    description: string,
    schema: z.ZodType,
    run: (args: any, signal: AbortSignal) => Promise<CallToolResult>,
    readOnly = false,
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: false,
          idempotentHint: readOnly,
          openWorldHint: !readOnly,
        },
      },
      async (args: any, ctx: ServerContext) => {
        const signal = AbortSignal.any([
          ctx.mcpReq.signal,
          AbortSignal.timeout(config.deadlineMs),
        ]);
        try {
          return await run(args, signal);
        } catch (error) {
          // Provider bodies, URLs and original Error objects can contain credentials.
          const message = signal.aborted
            ? "Operation cancelled or generation deadline exceeded. Provider work may still incur charges."
            : error instanceof Error &&
                !error.message.includes(config.apiKey || "\u0000") &&
                !/https?:|[\\/](?:workspace|home|Users)/i.test(error.message)
              ? error.message
              : "Media operation failed; check server configuration and provider access";
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      },
    );
  }
  function validateVideo(args: any, image: boolean) {
    if (args.resolution !== "720p" && args.durationSeconds !== 8)
      throw new Error("1080p and 4k require durationSeconds=8");
    if (
      args.personGeneration &&
      args.personGeneration !== (image ? "allow_adult" : "allow_all")
    )
      throw new Error(
        image
          ? "Image-to-video requires personGeneration=allow_adult"
          : "Text-to-video requires personGeneration=allow_all",
      );
  }
  register(
    "generateVideoFromText",
    "Generate one video using the configured Google Veo model. This incurs provider charges.",
    z.object({ prompt, ...videoFields }).strict(),
    async (args, signal) => {
      validateVideo(args, false);
      const item = await provider.generateVideo(args.prompt, args, signal);
      return mediaResult(store, "videos", item, args.includeFullData);
    },
  );
  register(
    "generateVideoFromImage",
    "Animate an image using Veo. URLs require IMAGE_URL_HOSTS; files must be inside IMAGE_INPUT_DIR.",
    z
      .object({
        prompt: prompt.default("Animate this image"),
        image: z.union([
          z
            .string()
            .min(1)
            .max(14 * 1024 * 1024),
          z.object({
            type: z.literal("image").optional(),
            data: z.string().max(14 * 1024 * 1024),
            mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
          }),
        ]),
        ...videoFields,
      })
      .strict(),
    async (args, signal) => {
      validateVideo(args, true);
      const item = await provider.generateVideo(
        args.prompt,
        args,
        signal,
        args.image,
      );
      return mediaResult(store, "videos", item, args.includeFullData);
    },
  );
  register(
    "generateImage",
    "Generate one image using the configured Gemini image model. This incurs provider charges.",
    z
      .object({
        prompt,
        numberOfImages: z.literal(1).default(1),
        includeFullData: bool.default(false),
      })
      .strict(),
    async (args, signal) =>
      mediaResult(
        store,
        "images",
        await provider.generateImage(args.prompt, signal),
        args.includeFullData,
      ),
  );
  register(
    "generateVideoFromGeneratedImage",
    "Generate one Gemini image then animate it with Veo. Both steps incur provider charges.",
    z
      .object({
        prompt,
        videoPrompt: prompt.optional(),
        numberOfImages: z.literal(1).default(1),
        ...videoFields,
      })
      .strict(),
    async (args, signal) => {
      validateVideo(args, true);
      const image = await provider.generateImage(args.prompt, signal);
      const { bytes } = await store.bytes("images", image.id, 10 * 1024 * 1024);
      const video = await provider.generateVideo(
        args.videoPrompt ?? args.prompt,
        args,
        signal,
        { data: bytes.toString("base64"), mimeType: image.mimeType },
      );
      const result = await mediaResult(
        store,
        "videos",
        video,
        args.includeFullData,
      );
      result.content.unshift({
        type: "resource_link",
        uri: image.resourceUri,
        name: image.id,
        mimeType: image.mimeType,
      });
      result.structuredContent = { ...video, image };
      return result;
    },
  );
  for (const kind of ["videos", "images"] as const)
    register(
      kind === "videos" ? "listGeneratedVideos" : "listGeneratedImages",
      "List saved " + kind,
      z.object({}).strict(),
      async () => {
        const items = await store.list(kind);
        const data = { count: items.length, [kind]: items };
        return {
          content: [{ type: "text", text: JSON.stringify(data) }],
          structuredContent: data,
        };
      },
      true,
    );
  register(
    "getImage",
    "Read a saved image by UUID.",
    z
      .object({ id: z.string().uuid(), includeFullData: bool.default(true) })
      .strict(),
    async (args) =>
      mediaResult(
        store,
        "images",
        await store.metadata("images", args.id),
        args.includeFullData,
      ),
    true,
  );
}
