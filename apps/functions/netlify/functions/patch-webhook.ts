import type { Handler } from "@netlify/functions";
import type { WorldPatchEnvelope } from "@aquarium/shared/events";
import { appendActivity, patchLog, seenIdempotency } from "./_store";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const env = JSON.parse(event.body ?? "{}") as WorldPatchEnvelope;
  if (!env.idempotency_key) return { statusCode: 400, body: "Missing idempotency_key" };

  if (seenIdempotency.has(env.idempotency_key)) return { statusCode: 200, body: "OK (deduped)" };
  seenIdempotency.add(env.idempotency_key);

  patchLog.push(env);
  appendActivity({
    id: `activity_patch_${env.patch_id}`,
    at_ms: Date.now(),
    source: "functions",
    scope: "webhook",
    level: "info",
    message: "patch ingested",
    details: {
      patch_id: env.patch_id,
      source: env.source,
    },
  });
  return { statusCode: 202, body: "Accepted" };
};
