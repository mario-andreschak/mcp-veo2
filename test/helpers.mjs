import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";
export const modernMeta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};
export async function stdioSmoke(entry, cwd) {
  for (const protocol of ["2026-07-28", "2025-11-25"]) {
    const child = spawn(process.execPath, [entry], {
      cwd,
      env: {
        ...process.env,
        GOOGLE_API_KEY: "",
        GEMINI_API_KEY: "",
        STORAGE_DIR: cwd + "/media-" + protocol,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = new Promise((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    let stderr = "";
    child.stderr.on("data", (x) => (stderr += x));
    const pending = new Map();
    const parsed = [];
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const data = JSON.parse(line);
        assert.equal(data.jsonrpc, "2.0");
        parsed.push(data);
        pending.get(data.id)?.(data);
      } catch (error) {
        for (const done of pending.values())
          done({ badLine: line, error: String(error) });
      }
    });
    let id = 0;
    const request = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const next = ++id;
        const timer = setTimeout(
          () => reject(new Error("Timed out: " + method + " " + stderr)),
          10000,
        );
        pending.set(next, (value) => {
          clearTimeout(timer);
          pending.delete(next);
          resolve(value);
        });
        const actual =
          protocol === "2026-07-28" ? { ...params, _meta: modernMeta } : params;
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id: next, method, params: actual }) +
            "\n",
        );
      });
    try {
      if (protocol === "2026-07-28") {
        const r = await request("server/discover");
        assert.equal(r.result.resultType, "complete");
      } else {
        const r = await request("initialize", {
          protocolVersion: protocol,
          capabilities: {},
          clientInfo: { name: "smoke", version: "1" },
        });
        assert.equal(r.result.protocolVersion, protocol);
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          }) + "\n",
        );
      }
      const catalog = await request("tools/list");
      assert.equal(catalog.result.tools.length, 7);
      const listed = await request("tools/call", {
        name: "listGeneratedVideos",
        arguments: {},
      });
      assert.ok(listed.result);
      assert.ok(!listed.result.isError);
      const invalid = await request("tools/call", {
        name: "generateVideoFromText",
        arguments: { prompt: "x", durationSeconds: 5 },
      });
      assert.ok(invalid.error || invalid.result?.isError);
      const unknown = await request("tools/call", {
        name: "does-not-exist",
        arguments: {},
      });
      assert.ok(unknown.error || unknown.result?.isError);
      const missingKey = await request("tools/call", {
        name: "generateImage",
        arguments: { prompt: "x" },
      });
      assert.equal(missingKey.result.isError, true);
      const resource = await request("resources/read", {
        uri: "videos://templates",
      });
      assert.ok(resource.result.contents[0].text);
      assert.ok(parsed.every((x) => x.jsonrpc === "2.0"));
      assert.ok(!stderr.includes("Error:"));
      child.stdin.end();
      const code = await Promise.race([
        exited,
        new Promise((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("EOF did not exit")),
            5000,
          );
          t.unref();
        }),
      ]);
      assert.equal(code, 0);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
}
