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
