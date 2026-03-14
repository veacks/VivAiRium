import type { Handler } from "@netlify/functions";
import { getHistoryMeta, getHistorySlice } from "./_store.ts";

export const handler: Handler = async (event) => {
  const mode = event.queryStringParameters?.mode;
  if (mode === "meta") {
    return {
      statusCode: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json",
      },
      body: JSON.stringify(getHistoryMeta()),
    };
  }

  const startCursor = Math.max(0, Number.parseInt(event.queryStringParameters?.start_cursor ?? "0", 10) || 0);
  const endCursor = Math.max(startCursor, Number.parseInt(event.queryStringParameters?.end_cursor ?? `${Number.MAX_SAFE_INTEGER}`, 10) || 0);

  return {
    statusCode: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
    body: JSON.stringify(getHistorySlice(startCursor, endCursor)),
  };
};
