import type { Handler } from "@netlify/functions";
import { moods } from "./_store.ts";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const body = JSON.parse(event.body ?? "{}") as { tag?: string; weight?: number };
  if (!body.tag) return { statusCode: 400, body: "Missing tag" };

  moods.push({ at_ms: Date.now(), tag: body.tag, weight: typeof body.weight === "number" ? body.weight : 1 });
  return { statusCode: 200, body: "OK" };
};
