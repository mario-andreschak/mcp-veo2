import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import type { Config } from "./config.js";
import { MediaStore, VeoClient } from "./services/veoClient.js";
import { registerTools } from "./tools/generateVideo.js";
import { videoPromptsResource } from "./resources/videos.js";
import { imagePromptsResource } from "./resources/images.js";

export function createServer(
  config: Config,
  store: MediaStore,
  provider = new VeoClient(config, store),
): McpServer {
  const server = new McpServer({
    name: "veo-video-generation",
    version: "2.0.0",
  });
  registerTools(server, config, store, provider);
  for (const kind of ["videos", "images"] as const) {
    server.registerResource(
      kind,
      new ResourceTemplate(kind + "://{id}", {
        list: async () => ({
          resources: (await store.list(kind)).map((item) => ({
            uri: item.resourceUri,
            name: item.id,
            mimeType: item.mimeType,
          })),
        }),
      }),
      { description: "Saved " + kind },
      async (_uri, variables) => {
        if (typeof variables.id !== "string")
          throw new Error("Invalid media ID");
        const { item, bytes } = await store.bytes(
          kind,
          variables.id,
          8 * 1024 * 1024,
        );
        return {
          contents: [
            {
              uri: item.resourceUri,
              mimeType: item.mimeType,
              blob: bytes.toString("base64"),
            },
          ],
        };
      },
    );
  }
  for (const resource of [videoPromptsResource, imagePromptsResource]) {
    server.registerResource(
      resource.name,
      resource.uri,
      { description: resource.description, mimeType: "application/json" },
      resource.read,
    );
  }
  return server;
}
