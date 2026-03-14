import type { Handler } from "@netlify/functions";
import { appendActivity, deployEvents } from "./_store";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const payload = JSON.parse(event.body ?? "{}") as { status?: string };

  const status = payload.status === "failed" ? "failed" : "succeeded";
  deployEvents.push({ at_ms: Date.now(), status, payload });
  appendActivity({
    id: `activity_deploy_${Date.now()}`,
    at_ms: Date.now(),
    source: "functions",
    scope: "webhook",
    level: status === "failed" ? "error" : "info",
    message: `deploy ${status}`,
    details: payload as Record<string, unknown>,
  });

  return { statusCode: 200, body: "OK" };
};
