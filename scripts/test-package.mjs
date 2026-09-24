import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { stdioSmoke } from "../test/helpers.mjs";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "veo-package-"));
try {
  const pack = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", dir],
      { encoding: "utf8" },
    ),
  )[0];
  assert.ok(pack.files.some((f) => f.path === "dist/index.js"));
  assert.ok(
    !pack.files.some(
      (f) =>
        f.path.startsWith("src/") ||
        f.path.includes("generated-videos") ||
        f.path === ".env",
    ),
  );
  await fs.writeFile(path.join(dir, "package.json"), '{"private":true}');
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      path.join(dir, pack.filename),
    ],
    { cwd: dir, stdio: "pipe", timeout: 120000 },
  );
  const entry = path.join(
    dir,
    "node_modules/mcp-video-generation-veo2/dist/index.js",
  );
  await stdioSmoke(entry, dir);
  console.log(
    "Packed production install: modern + legacy protocol, catalog, errors, resources and EOF passed",
  );
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
