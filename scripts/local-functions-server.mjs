import { createServer } from "node:http";

const functionsHost = process.env.VIVAIRIUM_FUNCTIONS_HOST ?? "127.0.0.1";
const functionsPort = Number.parseInt(process.env.VIVAIRIUM_FUNCTIONS_PORT ?? "9999", 10);

const handlerModuleUrls = {
  "activity-event": new URL("../apps/functions/netlify/functions/activity-event.ts", import.meta.url),
  "activity-feed": new URL("../apps/functions/netlify/functions/activity-feed.ts", import.meta.url),
  "deploy-webhook": new URL("../apps/functions/netlify/functions/deploy-webhook.ts", import.meta.url),
  "history-feed": new URL("../apps/functions/netlify/functions/history-feed.ts", import.meta.url),
  "human-mood": new URL("../apps/functions/netlify/functions/human-mood.ts", import.meta.url),
  "human-vote": new URL("../apps/functions/netlify/functions/human-vote.ts", import.meta.url),
  "patch-feed": new URL("../apps/functions/netlify/functions/patch-feed.ts", import.meta.url),
  "patch-webhook": new URL("../apps/functions/netlify/functions/patch-webhook.ts", import.meta.url),
};

const handlerCache = new Map();

function getFunctionName(pathname) {
  const localPath = pathname.startsWith("/.netlify/functions/")
    ? pathname.slice("/.netlify/functions/".length)
    : pathname.startsWith("/api/")
      ? pathname.slice("/api/".length)
      : null;

  if (!localPath) return null;
  return localPath.split("/")[0] || null;
}

async function getHandler(functionName) {
  const moduleUrl = handlerModuleUrls[functionName];
  if (!moduleUrl) return null;

  let handlerPromise = handlerCache.get(functionName);
  if (!handlerPromise) {
    handlerPromise = import(moduleUrl.href).then((mod) => mod.handler);
    handlerCache.set(functionName, handlerPromise);
  }

  return handlerPromise;
}

function toHeadersObject(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = Array.isArray(value) ? value.join(", ") : value ?? "";
  }
  return out;
}

function writeResponse(res, response) {
  const statusCode = response?.statusCode ?? 200;
  const headers = response?.headers ?? {};
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) {
      res.setHeader(key, value);
    }
  }
  res.statusCode = statusCode;
  res.end(response?.body ?? "");
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${functionsHost}:${functionsPort}`}`);
  const functionName = getFunctionName(url.pathname);

  if (method === "OPTIONS") {
    writeResponse(res, {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    });
    return;
  }

  if (!functionName) {
    writeResponse(res, { statusCode: 404, body: "Not Found" });
    return;
  }

  const handler = await getHandler(functionName);
  if (!handler) {
    writeResponse(res, { statusCode: 404, body: "Unknown function" });
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;

  try {
    const response = await handler({
      httpMethod: method,
      path: url.pathname,
      headers: toHeadersObject(req.headers),
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body,
    });
    writeResponse(res, response);
  } catch (error) {
    console.error(`[functions:local] ${functionName} failed`, error);
    writeResponse(res, { statusCode: 500, body: "Internal Server Error" });
  }
});

server.listen(functionsPort, functionsHost, () => {
  console.error(`[functions:local] listening on http://${functionsHost}:${functionsPort}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
