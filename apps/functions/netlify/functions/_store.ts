import type { WorldPatchEnvelope } from "@aquarium/shared/events";

// MVP-only in-memory stores. Replace with Netlify KV / durable store in production.
export const patchLog: WorldPatchEnvelope[] = [];
export const seenIdempotency = new Set<string>();

export const votes: Array<{ at_ms: number; value: string; weight: number }> = [];
export const moods: Array<{ at_ms: number; tag: string; weight: number }> = [];
export const deployEvents: Array<{ at_ms: number; status: "succeeded" | "failed"; payload: unknown }> = [];

