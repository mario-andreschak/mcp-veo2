import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../dist/config.js";
import {
  VeoClient,
  MediaStore,
  boundedBody,
} from "../dist/services/veoClient.js";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const mp4 = Buffer.from([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109]);
const key = "test-key-never-return-or-store";
const signal = () => AbortSignal.timeout(3000);
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "veo-unit-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const config = {
    ...loadConfig({ STORAGE_DIR: dir, GOOGLE_API_KEY: key }),
    pollMs: 10,
  };
  const store = new MediaStore(config);
  await store.initialize();
  return { config, store, dir };
}
test("current configurable video/image endpoints, header-only keys and valid stored media", async (t) => {
  const { config, store, dir } = await fixture(t);
  const calls = [];
  let polling = 0;
  const mock = async (url, options) => {
    const u = new URL(url);
    calls.push({ url: u.href, options });
    assert.ok(!u.href.includes(key));
    assert.equal(options.headers["x-goog-api-key"], key);
    if (u.pathname.endsWith(":predictLongRunning")) {
      const body = JSON.parse(options.body);
      assert.equal(body.parameters.durationSeconds, 8);
      return Response.json({
        name: "models/" + config.videoModel + "/operations/op1",
      });
    }
    if (u.pathname.includes("/operations/")) {
      polling++;
      return Response.json(
        polling === 1
          ? { name: "models/" + config.videoModel + "/operations/op1" }
          : {
              done: true,
              response: {
                generateVideoResponse: {
                  generatedSamples: [
                    {
                      video: {
                        uri:
                          "https://generativelanguage.googleapis.com/v1beta/files/video:download?key=" +
                          key,
                      },
                    },
                  ],
                },
              },
            },
      );
    }
    if (u.pathname.includes(":download")) return new Response(mp4);
    if (u.pathname.endsWith(":generateContent"))
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: png.toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      });
    throw new Error("unexpected API request");
  };
  const provider = new VeoClient(config, store, mock);
  const video = await provider.generateVideo("hello", {}, signal());
  const image = await provider.generateImage("hello", signal());
  assert.equal(video.mimeType, "video/mp4");
  assert.equal(image.mimeType, "image/png");
  assert.ok(calls.some((x) => x.url.includes(config.videoModel)));
  assert.ok(calls.some((x) => x.url.includes(config.imageModel)));
  assert.ok(
    !JSON.stringify([video, image, await store.list("videos")]).includes(key),
  );
  for (const file of await fs.readdir(dir))
    if (file.endsWith(".json"))
      assert.ok(
        !(await fs.readFile(path.join(dir, file), "utf8")).includes(key),
      );
  assert.deepEqual((await store.bytes("videos", video.id)).bytes, mp4);
});
test("downloads restrict hosts and redirects; credentials never follow cross-host redirects", async (t) => {
  const { config, store } = await fixture(t);
  const calls = [];
  const provider = new VeoClient(config, store, async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? new Response(null, {
          status: 302,
          headers: { location: "https://cdn.googleusercontent.com/video" },
        })
      : new Response(mp4);
  });
  assert.deepEqual(
    await provider.download(
      "https://generativelanguage.googleapis.com/file",
      signal(),
    ),
    mp4,
  );
  assert.equal(calls[1].options.headers["x-goog-api-key"], undefined);
  await assert.rejects(
    () => provider.download("http://127.0.0.1/private", signal()),
    /not allowed/,
  );
  await assert.rejects(
    () => provider.download("https://evil.example/private", signal()),
    /not allowed/,
  );
  await assert.rejects(
    () =>
      provider.download(
        "https://user:pass@generativelanguage.googleapis.com/x",
        signal(),
      ),
    /not allowed/,
  );
  const redirect = new VeoClient(
    config,
    store,
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest" },
      }),
  );
  await assert.rejects(
    () =>
      redirect.download(
        "https://generativelanguage.googleapis.com/x",
        signal(),
      ),
    /not allowed/,
  );
});
test("size limits work without content-length and cancel unread bodies", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(100));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(() => boundedBody(response, 10, signal()), /size limit/);
  assert.equal(cancelled, true);
});
test("polling aborts and never retries a paid creation", async (t) => {
  const { config, store } = await fixture(t);
  let starts = 0,
    polls = 0;
  const provider = new VeoClient(config, store, async (url) => {
    if (String(url).includes(":predict")) starts++;
    else polls++;
    return Response.json({ name: "operations/op" });
  });
  await assert.rejects(
    () => provider.generateVideo("x", {}, AbortSignal.timeout(45)),
    /abort/i,
  );
  assert.equal(starts, 1);
  assert.ok(polls > 0);
});
test("legacy key-bearing metadata is scrubbed and metadata paths cannot escape storage", async (t) => {
  const { config, store, dir } = await fixture(t);
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  await fs.writeFile(
    path.join(dir, id + ".json"),
    JSON.stringify({
      id,
      createdAt: "today",
      prompt: "key=" + key,
      mimeType: "video/mp4",
      size: mp4.length,
      filepath: "/etc/passwd",
      videoUrl: "https://x?key=" + key,
    }),
  );
  await fs.writeFile(path.join(dir, id + ".mp4"), mp4);
  await store.initialize();
  const raw = await fs.readFile(path.join(dir, id + ".json"), "utf8");
  assert.ok(!raw.includes(key));
  assert.ok(!raw.includes("videoUrl"));
  assert.ok(!raw.includes("/etc"));
  assert.deepEqual((await store.bytes("videos", id)).bytes, mp4);
  await assert.rejects(
    () => store.metadata("videos", "../../etc/passwd"),
    /Invalid/,
  );
  const provider = new VeoClient(config, store);
  await assert.rejects(
    () => provider.imageInput("/etc/passwd", signal()),
    /outside/,
  );
  await assert.rejects(
    () =>
      provider.imageInput(
        { data: "not base64", mimeType: "image/png" },
        signal(),
      ),
    /base64/,
  );
});
test("provider errors never echo provider bodies or keys", async (t) => {
  const { config, store } = await fixture(t);
  const provider = new VeoClient(
    config,
    store,
    async () => new Response("secret=" + key, { status: 403 }),
  );
  await assert.rejects(
    () => provider.generateImage("hello", signal()),
    (error) =>
      !error.message.includes(key) && error.message.includes("HTTP 403"),
  );
});

test("malformed provider JSON cannot leak response fragments through parse errors", async (t) => {
  const { config, store } = await fixture(t);
  const provider = new VeoClient(
    config,
    store,
    async () => new Response("malformed secret=" + key),
  );
  await assert.rejects(
    () => provider.generateImage("hello", signal()),
    (error) => error.message === "Invalid Google API response",
  );
});
