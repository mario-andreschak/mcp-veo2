# Google Veo and Gemini image MCP server

Generate videos with Google Veo and images with Gemini. The package name remains
`mcp-video-generation-veo2` for existing installations; version 2 uses maintained,
configurable models and MCP SDK 2.

## Install and run

Use Node.js 22 or 24. From this repository:

```sh
npm ci
npm run build
node dist/index.js
```

For an MCP host, launch **node directly** with the absolute `dist/index.js` path.
Do not launch `npm start` as the stdio child: npm's own banners can corrupt the
JSON-RPC stream. The installed package also provides `mcp-video-generation-veo2`.

```json
{
  "mcpServers": {
    "veo": {
      "command": "node",
      "args": ["/absolute/path/mcp-veo2/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "YOUR_GOOGLE_API_KEY",
        "VIDEO_MODEL": "veo-3.1-generate-preview",
        "IMAGE_MODEL": "gemini-3.1-flash-image"
      }
    }
  }
}
```

An API key is needed only for generation; discovery, templates, and saved-media
access work without one. Google model access, billing and quota must be enabled.
Generation may incur charges even if the MCP request is cancelled or times out.
The server never automatically retries a paid creation request.

## HTTP and existing SSE clients

Set `MCP_AUTH_TOKEN` to a random value of at least 24 characters, then run:

```sh
node dist/index.js http
```

Open `http://127.0.0.1:3000/` for the included browser connection check. It asks for
the MCP token, keeps it in memory, and lists saved media using real MCP requests.

- `/mcp`: MCP 2026-07-28 and stateless legacy Streamable HTTP.
- `/sse` plus `/messages?sessionId=...`: legacy SSE compatibility for existing
  clients such as LibreChat. Each connection owns its own MCP server; request
  bodies are parsed once. SSE sessions expire after 10 minutes without a POST.
- `node dist/index.js sse` remains an alias for the same HTTP listener.
- Send `Authorization: Bearer <MCP_AUTH_TOKEN>` on every MCP request, including the
  initial SSE GET. The Google API key is a separate, server-only credential.

The default bind address is loopback. To expose the service, configure `HOST`,
`ALLOWED_HOSTS` and `ALLOWED_ORIGINS` for the proxy deployment and terminate TLS at
that proxy. Only exact configured Host values and browser origins are trusted.
Each deployment and storage directory belongs to one operator; do not share its
bearer token/storage across untrusted tenants. This is static bearer deployment
authentication, not a complete OAuth authorization server.

Issue #5's `file://` frontend and `/sse/tool/listGeneratedVideos` URL were never an
MCP REST API. Use the included page or an MCP client. Opaque `Origin: null` and
hostile origins are rejected; no wildcard CORS is enabled. The old public
`/videos` directory server has been removed.

## Tools and media

All seven tool names are retained:

| Tool                              | Inputs                                              |
| --------------------------------- | --------------------------------------------------- |
| `generateVideoFromText`           | `prompt`, optional video settings                   |
| `generateVideoFromImage`          | `image`, optional `prompt` and video settings       |
| `generateImage`                   | `prompt`, optional `includeFullData`                |
| `generateVideoFromGeneratedImage` | `prompt`, optional `videoPrompt` and video settings |
| `listGeneratedVideos`             | No inputs                                           |
| `listGeneratedImages`             | No inputs                                           |
| `getImage`                        | Saved image UUID, optional `includeFullData`        |

Settings are **flat tool arguments**, for example:

```json
{
  "prompt": "A slow camera pan through a sunlit forest",
  "aspectRatio": "16:9",
  "durationSeconds": 8,
  "resolution": "720p"
}
```

Veo 3.1 accepts durations 4, 6, or 8 seconds; 1080p/4k requires 8 seconds. Text
generation uses `personGeneration=allow_all`; image animation uses
`allow_adult`, subject to Google's regional restrictions and filtering. One
video/image is generated per call. Explicit unsupported settings fail before
provider generation.

An image input can be a base64 string, an MCP image object
`{ "type": "image", "mimeType": "image/png", "data": "..." }`, an allowed HTTPS URL,
or an absolute file path beneath `IMAGE_INPUT_DIR`. PNG, JPEG and WebP are checked
by MIME type and file signature. Input images are limited to 10 MiB. URL imports
require an explicit `IMAGE_URL_HOSTS` allowlist controlled by the operator; redirects
must remain in that allowlist. Do not allow hosts you do not trust.

Outputs contain metadata and `videos://<uuid>` or `images://<uuid>` resource links.
Resources return actual media blobs; video data is never mislabeled as an MCP
image. `includeFullData=true` additionally embeds media in the tool result, limited
to 8 MiB. Resources are likewise limited to 8 MiB for interoperability. Larger
assets remain in `STORAGE_DIR` for the operator to retrieve on the server.

Video downloads always run on the server. API keys are sent in headers, never in
returned or saved URLs. Redirects are bounded; cross-host redirects do not receive
the Google key. Downloaded bytes, metadata and API responses have size limits.
Provider error bodies and raw request arguments are not logged. Startup rewrites
valid historical metadata through an allowlist, dropping old key-bearing URLs and
absolute paths while preserving media files. Rotate keys previously exposed by an
older release and remove historical copies from any downstream logs/backups.

## Configuration

Copy `.env.example` or set environment variables:

| Variable                | Default / meaning                                         |
| ----------------------- | --------------------------------------------------------- |
| `GOOGLE_API_KEY`        | Provider key; `GEMINI_API_KEY` is an alias                |
| `VIDEO_MODEL`           | `veo-3.1-generate-preview`                                |
| `IMAGE_MODEL`           | `gemini-3.1-flash-image`                                  |
| `STORAGE_DIR`           | `./generated-videos`; images in its `images` subdirectory |
| `HOST`, `PORT`          | `127.0.0.1`, `3000`                                       |
| `MCP_AUTH_TOKEN`        | Required for HTTP/SSE, at least 24 characters             |
| `ALLOWED_HOSTS`         | Additional comma-separated exact `host[:port]` values     |
| `ALLOWED_ORIGINS`       | Additional comma-separated exact HTTP(S) origins          |
| `IMAGE_INPUT_DIR`       | `STORAGE_DIR/images`; real paths must remain beneath it   |
| `IMAGE_URL_HOSTS`       | Empty; comma-separated trusted HTTPS source hosts         |
| `GENERATION_TIMEOUT_MS` | 600000, maximum 1800000                                   |
| `POLL_INTERVAL_MS`      | 10000                                                     |
| `MAX_MEDIA_BYTES`       | 67108864; maximum 134217728                               |

Veo 2, Imagen 3 and Imagen 4 are not suitable defaults for the end of 2026.
Google's [Veo guide](https://ai.google.dev/gemini-api/docs/veo) documents the current
video interface; [image generation](https://ai.google.dev/gemini-api/docs/image-generation)
lists current Gemini image models. This implementation uses the supported
`generateContent` image API; Google's
[Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview)
confirms it remains supported. Recheck model availability and
[deprecations](https://ai.google.dev/gemini-api/docs/deprecations) before deployment.
Configurable model IDs permit compatible replacements; they do not guarantee that
a future model accepts the same parameters. Veo 3.1's current identifier is a
preview, so end-of-2026 availability cannot be promised.

## Version 2 migration

- MCP stdio and HTTP serve revision 2026-07-28 through SDK2's actual
  `serveStdio` / `createMcpHandler` entries. Legacy stdio/HTTP/SSE remains tested.
- Duration 5/7, `numberOfVideos=2`, `numberOfImages>1`, unsupported person modes,
  `enhancePrompt=true`, and `autoDownload=false` now fail explicitly.
- Media always downloads locally, and public storage directory access is removed.
- Use direct Node/package binary for MCP stdio. Missing generation credentials no
  longer prevent listing tools.
- Unsupported resource subscriptions are not advertised.

## Verification

```sh
npm run check
```

Tests use credential-free provider fixtures and actual stdio, Streamable HTTP,
legacy SSE and production-only packed installs. They cover schema errors,
cancellation, key handling, redirects, size limits, media types, path boundaries,
connection isolation, Host/Origin/auth checks, and clean EOF. CI runs on Node 22
and 24. No paid generation is performed in automated tests; a live account test is
still required to establish provider billing, regional access and visual quality.

MIT license. Original examples remain in `example-files/`.
