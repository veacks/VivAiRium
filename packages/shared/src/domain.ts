import type { AgentId, ModelId, EntityId, EvolutionId, PatchId, Id } from "./ids";

export type { AgentId, ModelId, EntityId, EvolutionId, PatchId, Id };

export type Vec3 = readonly [number, number, number];

export type EntityArchetype = "flora" | "fauna" | "rock" | "structure" | "ambient";

export type EntityProvenance = {
  creator_agent_id: AgentId;
  creator_model_id: ModelId;
  originating_evolution_id: EvolutionId;
};

export type EntityLifecycleStage = "seed" | "active" | "unstable" | "decay" | "dead";

export type WorldEntity = {
  id: EntityId;
  archetype: EntityArchetype;
  provenance: EntityProvenance;

  chunk_id: string;
  position: Vec3;
  rotationY: number;
  scale: number;

  lifecycle_stage: EntityLifecycleStage;
  lifecycle_t: number; // 0..1 within stage
  visible_hint: boolean;

  created_at_ms: number;
  updated_at_ms: number;
};

export type EvolutionStage = {
  name: string;
  duration_ms: number;
};

export type EvolutionTarget =
  | { kind: "entity"; entity_id: EntityId }
  | { kind: "chunk"; chunk_id: string }
  | { kind: "agent"; agent_id: AgentId };

export type Evolution = {
  id: EvolutionId;
  source_agent_id: AgentId;
  source_model_id: ModelId;
  intent: string;

  start_time_ms: number;
  duration_ms: number;
  stages: readonly EvolutionStage[];
  progress_t: number;

  canceled: boolean;
  target: EvolutionTarget;
  expected_final: Record<string, unknown>;
  history: readonly { at_ms: number; msg: string }[];
};

export type AgentRole =
  | "biome_builder"
  | "flora_builder"
  | "fauna_builder"
  | "structure_builder"
  | "ambience_builder"
  | "mutation_builder"
  | "meta_agent"
  | "moderation_agent";

export type AgentProfile = {
  id: AgentId;
  role: AgentRole;
  rules: string[];
  skills: string[];
  assigned_model_id: ModelId;
  mutation_rate: number; // 0..1
  frozen_until_ms?: number;
  influence_weights: Record<string, number>;
  memory: { at_ms: number; note: string }[];
};

export type EntityFeedback = {
  entity_id: EntityId;
  provenance: EntityProvenance;
  at_ms: number;
  visibility: { last_seen_ms?: number; is_visible_hint: boolean };
  lifecycle: { stage: EntityLifecycleStage; t: number };
  activity: { health: number; instability: number };
};

