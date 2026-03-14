import type { Handler } from "@netlify/functions";
import { votes } from "./_store";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const body = JSON.parse(event.body ?? "{}") as { value?: string; weight?: number };
  if (!body.value) return { statusCode: 400, body: "Missing value" };

  votes.push({ at_ms: Date.now(), value: body.value, weight: typeof body.weight === "number" ? body.weight : 1 });
  return { statusCode: 200, body: "OK" };
};

