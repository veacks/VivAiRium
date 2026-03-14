import type { Handler } from "@netlify/functions";
import { activityLog } from "./_store.ts";

export const handler: Handler = async (event) => {
  const sinceParam = event.queryStringParameters?.since ?? "0";
  const since = Math.max(0, Number.parseInt(sinceParam, 10) || 0);
  const events = activityLog.filter((entry) => entry.at_ms > since);
  const next_since = events.length > 0 ? events[events.length - 1].at_ms : since;

  return {
    statusCode: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
    body: JSON.stringify({ events, next_since }),
  };
};
