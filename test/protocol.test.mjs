import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../dist/config.js";
import { MediaStore, VeoClient } from "../dist/services/veoClient.js";
import { startHttp } from "../dist/http.js";
import { stdioSmoke, modernMeta } from "./helpers.mjs";
const token = "test-mcp-auth-token-with-32-characters";
async function fixture(t, createProvider) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "veo-protocol-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const config = {
    ...loadConfig({ STORAGE_DIR: dir, MCP_AUTH_TOKEN: token }),
    port: 0,
  };
  const store = new MediaStore(config);
  await store.initialize();
  const service = await startHttp(
    config,
    store,
    createProvider?.(config, store),
  );
  t.after(() => service.close());
  return { base: "http://127.0.0.1:" + service.port, dir, store };
}
async function rpc(base, method, params = {}, extra = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: "Bearer " + token,
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
    ...(params.name
      ? { "Mcp-Name": params.name }
      : params.uri
        ? { "Mcp-Name": params.uri }
        : {}),
    ...extra,
  };
  return fetch(base + "/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: { ...params, _meta: modernMeta },
    }),
  });
}
test("actual stdio process serves both eras with JSON-only stdout and exits on EOF", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "veo-stdio-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await stdioSmoke(path.resolve("dist/index.js"), dir);
});
test("real HTTP discovery, stateless results, media types and authenticated boundaries", async (t) => {
  const { base, store } = await fixture(t);
  const discovery = await rpc(base, "server/discover");
  assert.equal(discovery.status, 200);
  assert.equal(discovery.headers.get("mcp-session-id"), null);
  const discovered = await discovery.json();
  assert.equal(discovered.result.resultType, "complete");
  assert.ok(!discovered.result.capabilities.resources?.subscribe);
  const tools = await (await rpc(base, "tools/list")).json();
  assert.equal(tools.result.tools.length, 7);
  const unknown = await (
    await rpc(base, "tools/call", { name: "unknown", arguments: {} })
  ).json();
  assert.ok(unknown.error || unknown.result.isError);
  for (const [headers, status] of [
    [{ Authorization: "" }, 401],
    [{ Origin: "https://evil.example" }, 403],
    [{ Origin: "null" }, 403],
    [{ "Mcp-Method": "tools/call" }, 400],
  ]) {
    const r = await rpc(base, "tools/list", {}, headers);
    assert.equal(r.status, status);
  }
  assert.equal(
    (await rpc(base, "tools/list", {}, { Origin: base })).status,
    200,
  );
  const hostile = await new Promise((resolve) => {
    const req = http.get(
      base + "/",
      { headers: { Host: "attacker.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", () => resolve(0));
  });
  assert.equal(hostile, 421);
  assert.equal((await fetch(base + "/videos")).status, 401);
  assert.equal(
    (
      await fetch(base + "/sse/tool/listGeneratedVideos", {
        headers: { Authorization: "Bearer " + token },
      })
    ).status,
    404,
  );
  const ui = await (await fetch(base + "/")).text();
  assert.ok(ui.includes("fetch('/mcp'"));
  assert.ok(!ui.includes("localStorage"));
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const saved = await store.save("images", png, "image/png", "test");
  const resource = await (
    await rpc(base, "resources/read", { uri: saved.resourceUri })
  ).json();
  assert.equal(resource.result.contents[0].mimeType, "image/png");
  assert.equal(resource.result.contents[0].blob, png.toString("base64"));
});
async function events(response) {
  const reader = response.body.getReader();
  let buffer = "";
  return {
    async next() {
      while (true) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = event.split("\n").find((s) => s.startsWith("data: "));
          if (data) return data.slice(6);
          continue;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE ended");
        buffer += new TextDecoder()
          .decode(chunk.value)
          .replaceAll("\r\n", "\n");
      }
    },
    async close() {
      await reader.cancel().catch(() => {});
    },
  };
}
test("legacy SSE parses each body once and creates isolated servers per connection (#4)", async (t) => {
  const { base } = await fixture(t);
  const streams = [];
  for (let i = 0; i < 2; i++) {
    const response = await fetch(base + "/sse", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(response.status, 200);
    const stream = await events(response);
    const endpoint = await stream.next();
    streams.push({ stream, endpoint });
    const init = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "client-" + i, version: "1" },
      },
    };
    assert.equal(
      (
        await fetch(base + endpoint, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(init),
        })
      ).status,
      202,
    );
    assert.equal(
      JSON.parse(await stream.next()).result.protocolVersion,
      "2025-03-26",
    );
    await fetch(base + endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
  }
  assert.notEqual(streams[0].endpoint, streams[1].endpoint);
  await streams[0].stream.close();
  const { stream, endpoint } = streams[1];
  await fetch(base + endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(JSON.parse(await stream.next()).result.tools.length, 7);
  await stream.close();
});
test("legacy stateless Streamable HTTP remains available", async (t) => {
  const { base } = await fixture(t);
  const r = await fetch(base + "/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    }),
  });
  assert.equal(r.status, 200);
  const raw = await r.text();
  const data = raw.startsWith("event:")
    ? JSON.parse(
        raw
          .split("\n")
          .find((x) => x.startsWith("data: "))
          .slice(6),
      )
    : JSON.parse(raw);
  assert.equal(data.result.protocolVersion, "2025-11-25");
});

test("successful media tool results use video blobs, and unsupported flags do not generate", async (t) => {
  const { base } = await fixture(t, (config, store) => ({
    async generateVideo(prompt) {
      return store.save(
        "videos",
        Buffer.from([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109]),
        "video/mp4",
        prompt,
      );
    },
    async generateImage(prompt) {
      return store.save(
        "images",
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
        "image/png",
        prompt,
      );
    },
  }));
  const response = await (
    await rpc(base, "tools/call", {
      name: "generateVideoFromText",
      arguments: { prompt: "mock video", includeFullData: true },
    })
  ).json();
  assert.ok(!response.result.isError);
  assert.ok(
    response.result.content.some(
      (item) =>
        item.type === "resource" && item.resource.mimeType === "video/mp4",
    ),
  );
  assert.ok(
    !response.result.content.some(
      (item) => item.type === "image" && item.mimeType === "video/mp4",
    ),
  );
  const image = await (
    await rpc(base, "tools/call", {
      name: "generateImage",
      arguments: { prompt: "mock image", includeFullData: true },
    })
  ).json();
  assert.ok(
    image.result.content.some(
      (item) => item.type === "image" && item.mimeType === "image/png",
    ),
  );
  for (const invalid of [
    { autoDownload: false },
    { numberOfVideos: 2 },
    { enhancePrompt: true },
    { personGeneration: "dont_allow" },
  ]) {
    const result = await (
      await rpc(base, "tools/call", {
        name: "generateVideoFromText",
        arguments: { prompt: "invalid", ...invalid },
      })
    ).json();
    assert.ok(result.error || result.result.isError);
  }
});
test("modern HTTP client disconnect cancels provider work", async (t) => {
  let started, aborted;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const cancelled = new Promise((resolve) => {
    aborted = resolve;
  });
  const { base } = await fixture(t, () => ({
    async generateImage(_prompt, signal) {
      started();
      return new Promise((_, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted();
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });
    },
  }));
  const controller = new AbortController();
  const pending = fetch(base + "/mcp", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer " + token,
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": "generateImage",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "generateImage",
        arguments: { prompt: "abort" },
        _meta: modernMeta,
      },
    }),
  }).catch(() => null);
  await ready;
  controller.abort();
  await pending;
  await Promise.race([
    cancelled,
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Provider signal was not aborted")),
        2000,
      );
      timer.unref();
    }),
  ]);
});
