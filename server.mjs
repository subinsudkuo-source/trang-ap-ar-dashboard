import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = resolve(__dirname, "webapp");
const PORT = Number(process.env.PORT || 8080);
const DEFAULT_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwoBZYkXTRDKhjBA5a6c5JIK34d4tWCc5mmMPG9ItxGms3yideRMqP_YSmlnyC7wjJs/exec";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const REWRITES = new Map([
  ["/", "/index.html"],
  ["/app.js", "/app.js"],
  ["/monthly-refresh-hotfix.js", "/monthly-refresh-hotfix.js"],
  ["/styles.css", "/styles.css"],
  ["/data.js", "/data.example.js"],
  ["/data.example.js", "/data.example.js"],
]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/config") {
      response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
      sendJson(response, 200, {
        appsScriptUrl: process.env.APPS_SCRIPT_WEB_APP_URL || DEFAULT_APPS_SCRIPT_WEB_APP_URL,
      });
      return;
    }

    if (url.pathname === "/api/apps-script") {
      await handleAppsScriptProxy(request, response);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message || String(error) });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Trang AP/AR dashboard listening on port ${PORT}`);
});

async function handleAppsScriptProxy(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  const body = await readBody(request);
  const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL || DEFAULT_APPS_SCRIPT_WEB_APP_URL;
  const upstream = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: body || "{}",
  });
  const text = await upstream.text();

  try {
    sendJson(response, upstream.ok ? 200 : upstream.status, JSON.parse(text));
  } catch {
    sendJson(response, upstream.ok ? 200 : upstream.status, {
      ok: false,
      error: text || "Apps Script response was not JSON",
    });
  }
}

async function serveStatic(pathname, response) {
  const rewrittenPath = REWRITES.get(pathname) || pathname;
  const cleanPath = normalize(decodeURIComponent(rewrittenPath)).replace(/^([/\\])+/, "");
  const filePath = resolve(join(WEB_ROOT, cleanPath));

  if (!filePath.startsWith(WEB_ROOT)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    await readFile(filePath);
  } catch {
    sendText(response, 404, "Not found");
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", MIME_TYPES[extname(filePath)] || "application/octet-stream");
  response.setHeader("Cache-Control", "no-cache");
  createReadStream(filePath).pipe(response);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        request.destroy(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolveBody(body));
    request.on("error", rejectBody);
  });
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(text);
}
