import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { SSEServerTransport } from "@modelcontextprotocol/server-legacy/sse";
import type { Config } from "./config.js";
import { createServer } from "./server.js";
import { MediaStore, VeoClient } from "./services/veoClient.js";

const browserPage = `<!doctype html><meta charset="utf-8"><title>Veo MCP connection</title>
<h1>Veo MCP connection</h1><p>Enter the server MCP token to list generated media. The token stays in this page's memory.</p>
<label>Token <input id="token" type="password" autocomplete="off"></label>
<button id="videos">List videos</button><button id="images">List images</button><pre id="result"></pre>
<script>
for (const kind of ['videos','images']) document.getElementById(kind).onclick = async () => {
 const name = kind === 'videos' ? 'listGeneratedVideos' : 'listGeneratedImages';
 const out = document.getElementById('result');
 try {
  const response = await fetch('/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream',
   'authorization':'Bearer '+document.getElementById('token').value,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}}})});
  out.textContent = await response.text();
 } catch { out.textContent = 'Connection failed'; }
};
</script>`;
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function origin(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid allowed origin");
  return url.origin;
}
async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function startHttp(
  config: Config,
  store: MediaStore,
  provider = new VeoClient(config, store),
) {
  if (config.authToken.length < 24)
    throw new Error("HTTP requires MCP_AUTH_TOKEN with at least 24 characters");
  const factory = () => createServer(config, store, provider);
  const handler = createMcpHandler(factory, { legacy: "stateless" });
  const nodeHandler = toNodeHandler(handler);
  const sessions = new Map<
    string,
    {
      transport: SSEServerTransport;
      server: ReturnType<typeof factory>;
      lastUsed: number;
    }
  >();
  const origins = new Set(config.allowedOrigins.map(origin));
  const hosts = new Set(config.allowedHosts);
  for (const host of hosts)
    if (!/^(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(:[0-9]{1,5})?$/.test(host))
      throw new Error("Invalid allowed host");
  let port = config.port;
  const server = http.createServer(async (req, res) => {
    const reject = (status: number, message: string) => {
      res.writeHead(status, {
        "content-type": "text/plain",
        "cache-control": "no-store",
      });
      res.end(message);
    };
    try {
      const bindHost = config.host.includes(":")
        ? "[" + config.host + "]"
        : config.host;
      const localHosts = ["127.0.0.1", "localhost", "[::1]", bindHost];
      const trustedHosts = new Set([
        ...hosts,
        ...localHosts.map((h) => h + ":" + port),
        ...(port === 80 ? localHosts : []),
      ]);
      if (!trustedHosts.has(req.headers.host ?? ""))
        return reject(421, "Invalid Host");
      const browserOrigin = req.headers.origin;
      const trustedOrigins = new Set([
        ...origins,
        ...localHosts.map((h) => origin("http://" + h + ":" + port)),
      ]);
      if (browserOrigin && !trustedOrigins.has(browserOrigin))
        return reject(403, "Invalid Origin");
      if (browserOrigin) {
        res.setHeader("Access-Control-Allow-Origin", browserOrigin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id",
        });
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        return res.end(browserPage);
      }
      if (!equal(req.headers.authorization ?? "", "Bearer " + config.authToken))
        return reject(401, "Bearer authentication required");
      if (url.pathname === "/mcp") {
        if (
          req.method === "POST" &&
          !(req.headers["content-type"] ?? "")
            .toLowerCase()
            .startsWith("application/json")
        )
          return reject(415, "Expected application/json");
        const parsed = req.method === "POST" ? await body(req) : undefined;
        return await nodeHandler(req, res, parsed);
      }
      if (url.pathname === "/sse" && req.method === "GET") {
        if (sessions.size >= 32) return reject(503, "Session limit reached");
        const transport = new SSEServerTransport("/messages", res);
        const mcp = factory();
        sessions.set(transport.sessionId, {
          transport,
          server: mcp,
          lastUsed: Date.now(),
        });
        res.on("close", () => {
          sessions.delete(transport.sessionId);
          void mcp.close();
        });
        return await mcp.connect(transport);
      }
      if (url.pathname === "/messages" && req.method === "POST") {
        const session = sessions.get(url.searchParams.get("sessionId") ?? "");
        if (!session) return reject(404, "Unknown session");
        session.lastUsed = Date.now();
        // The SDK receives the parsed object and never rereads the consumed body.
        return await session.transport.handlePostMessage(
          req,
          res,
          await body(req),
        );
      }
      return reject(
        404,
        "Use MCP tools/call at /mcp; /sse/tool/* and public storage routes are not supported",
      );
    } catch {
      if (!res.headersSent) reject(400, "Invalid request");
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP address unavailable");
  port = address.port;
  const timer = setInterval(() => {
    for (const [id, s] of sessions)
      if (Date.now() - s.lastUsed > 600000) {
        sessions.delete(id);
        void s.server.close();
      }
  }, 30000);
  timer.unref();
  return {
    server,
    port,
    async close() {
      clearInterval(timer);
      await Promise.all([...sessions.values()].map((s) => s.server.close()));
      sessions.clear();
      await handler.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
