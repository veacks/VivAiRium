import type { Handler } from "@netlify/functions";
import { patchLog } from "./_store";

export const handler: Handler = async (event) => {
  const cursorParam = event.queryStringParameters?.cursor ?? "0";
  const cursor = Math.max(0, Number.parseInt(cursorParam, 10) || 0);

  const patches = patchLog.slice(cursor);
  const next_cursor = patchLog.length;

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patches, next_cursor })
  };
};

