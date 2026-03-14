import type { PatchId } from "./ids";

export type EventType =
  | "patch.ingested"
  | "entity.created"
  | "entity.updated"
  | "entity.deleted"
  | "feedback.emitted"
  | "deploy.succeeded"
  | "deploy.failed";

export type IdempotencyKey = string;

export type WorldPatchEnvelope = {
  patch_id: PatchId;
  idempotency_key: IdempotencyKey;
  created_at_ms: number;
  source: { kind: "orchestrator"; run_id: string } | { kind: "human"; user_id?: string };
  patch: unknown;
};

export type HistoryEntry = {
  cursor: number;
  patch_id: PatchId;
  created_at_ms: number;
  patch_kind: string;
  entity_id?: string;
  evolution_id?: string;
  species_id?: string;
  summary: string;
};

export type HistoryFeedMeta = {
  total_patches: number;
  earliest_ms: number | null;
  latest_ms: number | null;
  entries: HistoryEntry[];
};

export type ActivityLevel = "debug" | "info" | "warn" | "error";

export type ActivityEvent = {
  id: string;
  at_ms: number;
  source: "orchestrator" | "agent" | "functions";
  scope: "orchestrator" | "biome_builder" | "meta_agent" | "mutation_builder" | "webhook";
  level: ActivityLevel;
  message: string;
  details?: Record<string, unknown>;
};
