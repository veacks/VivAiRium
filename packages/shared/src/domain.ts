import type { AgentId, ModelId, EntityId, EvolutionId, PatchId, Id } from "./ids";

export type { AgentId, ModelId, EntityId, EvolutionId, PatchId, Id };

export type Vec3 = readonly [number, number, number];

export type EntityArchetype = "flora" | "fauna" | "rock" | "structure" | "ambient";
export type EntityShapeKind = "frond" | "pod" | "crystal" | "orb" | "fan";
export type EntityBehaviorMode = "rooted" | "pulse" | "orbit" | "wander" | "glide";
export type EntityShaderStyle = "biolume" | "caustic" | "glass" | "ember" | "electric";
export type TerrainType = "loam" | "reef" | "marsh" | "basalt" | "dune";
export type SpeciesGuild = "plant" | "animal" | "terrain" | "fungal";
export type GeometryGenerator = "canopy" | "spine" | "crest" | "shell" | "plate";
export type TextureGenerator = "veins" | "bands" | "spots" | "strata" | "territory";
export type BehaviorPattern = "heliotrope" | "canopy_wrestle" | "territorial_pack" | "burrower" | "ridge_runner";

export type EntityShapeProfile = {
  kind: EntityShapeKind;
  stretch: number;
  taper: number;
  wobble: number;
  ridges: number;
};

export type EntityBehaviorProfile = {
  mode: EntityBehaviorMode;
  amplitude: number;
  frequency: number;
  phase: number;
  drift: number;
};

export type EntityShaderProfile = {
  style: EntityShaderStyle;
  hue_shift: number;
  pulse: number;
  distortion: number;
  fresnel: number;
};

export type GeometryAsset = {
  asset_id: string;
  generator: GeometryGenerator;
  profile: readonly number[];
  radial_segments: number;
  rings: number;
  twist: number;
  flare: number;
  asymmetry: number;
  canopy: number;
};

export type TextureAsset = {
  asset_id: string;
  generator: TextureGenerator;
  palette: readonly string[];
  bands: number;
  spots: number;
  grain: number;
  contrast: number;
  emissive_bias: number;
};

export type BehaviorAsset = {
  asset_id: string;
  pattern: BehaviorPattern;
  tempo: number;
  reach: number;
  aggression: number;
  cohesion: number;
  adaptability: number;
};

export type EcologyTraits = {
  guild: SpeciesGuild;
  sunlight_demand: number;
  shade_cast: number;
  territory_radius: number;
  terrain_affinity: TerrainType;
  mobility: number;
  resilience: number;
};

export type SpeciesBlueprint = {
  species_id: string;
  lineage: string;
  label: string;
  geometry: GeometryAsset;
  texture: TextureAsset;
  behavior: BehaviorAsset;
  ecology: EcologyTraits;
  reasoning?: readonly string[];
};

export type TerrainCell = {
  id: string;
  column: number;
  row: number;
  x: number;
  z: number;
  elevation: number;
  moisture: number;
  fertility: number;
  sunlight: number;
  terrain_type: TerrainType;
  dominant_species_id?: string;
  updated_at_ms: number;
};

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
  anchor_position: Vec3;
  position: Vec3;
  rotationY: number;
  scale: number;
  species: SpeciesBlueprint;
  shape_profile: EntityShapeProfile;
  behavior_profile: EntityBehaviorProfile;
  shader_profile: EntityShaderProfile;

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

export type EvolutionExpectedFinal = {
  stable?: boolean;
  archetype?: EntityArchetype;
  species_blueprint?: SpeciesBlueprint;
  shape_profile?: Partial<EntityShapeProfile>;
  behavior_profile?: Partial<EntityBehaviorProfile>;
  shader_profile?: Partial<EntityShaderProfile>;
  scale?: number;
  reasoning_summary?: string;
  reasoning_steps?: readonly string[];
  assigned_role_models?: Record<string, string>;
  source_model_name?: string | null;
};

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
  expected_final: EvolutionExpectedFinal;
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
