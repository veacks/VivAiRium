import type { Handler } from "@netlify/functions";
import { deployEvents } from "./_store";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const payload = JSON.parse(event.body ?? "{}") as { status?: string };

  const status = payload.status === "failed" ? "failed" : "succeeded";
  deployEvents.push({ at_ms: Date.now(), status, payload });

  return { statusCode: 200, body: "OK" };
};

