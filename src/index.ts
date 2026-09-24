#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { MediaStore } from "./services/veoClient.js";
import { createServer } from "./server.js";
import { startHttp } from "./http.js";

async function main() {
  const config = loadConfig();
  const store = new MediaStore(config);
  await store.initialize();
  const mode = process.argv[2] ?? "stdio";
  if (!["stdio", "http", "sse"].includes(mode))
    throw new Error("Usage: mcp-video-generation-veo2 [stdio|http|sse]");
  const handle =
    mode === "stdio"
      ? serveStdio(() => createServer(config, store), {
          onerror: () => console.error("MCP transport error"),
        })
      : await startHttp(config, store);
  if ("port" in handle)
    console.error(
      "MCP HTTP listening on port " +
        handle.port +
        "; open / for the browser connection check",
    );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await handle.close();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  if (mode === "stdio")
    process.stdin.once("end", () => {
      void close();
    });
}
main().catch(() => {
  console.error(
    "Startup failed: check transport, numeric settings, storage permissions and MCP_AUTH_TOKEN (24+ characters for HTTP)",
  );
  process.exitCode = 1;
});
