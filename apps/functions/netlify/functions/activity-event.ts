import type { Handler } from "@netlify/functions";
import type { ActivityEvent } from "@aquarium/shared/events";
import { appendActivity } from "./_store";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const payload = JSON.parse(event.body ?? "{}") as ActivityEvent;
  if (!payload.id || !payload.message) return { statusCode: 400, body: "Invalid activity event" };
  appendActivity(payload);
  return { statusCode: 202, body: "Accepted" };
};

