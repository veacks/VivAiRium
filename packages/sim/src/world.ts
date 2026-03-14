import type {
  AgentProfile,
  EntityBehaviorMode,
  EntityBehaviorProfile,
  EntityShaderProfile,
  EntityShaderStyle,
  EntityShapeKind,
  EntityShapeProfile,
  Evolution,
  EvolutionExpectedFinal,
  WorldEntity
} from "@aquarium/shared/domain";
import type { WorldPatchEnvelope } from "@aquarium/shared/events";
import { asId, newId } from "@aquarium/shared/ids";
import { advanceEvolution, stageIndexForEvolution } from "./scheduler";
import { applyPatchToAgents, applyPatchToEntities, applyPatchToEvolutions, type WorldPatch } from "./patches";

export type World = {
  now_ms: number;
  entities: Map<string, WorldEntity>;
  evolutions: Map<string, Evolution>;
  agents: Map<string, AgentProfile>;

  last_effect_ms: number;
};

const CHUNK_SIZE = 32;
function chunkId(x: number, z: number) {
  return `${Math.floor(x / CHUNK_SIZE)}:${Math.floor(z / CHUNK_SIZE)}`;
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function defaultShapeProfile(archetype: WorldEntity["archetype"]): EntityShapeProfile {
  switch (archetype) {
    case "flora":
      return { kind: "frond", stretch: 1.2, taper: 0.65, wobble: 0.12, ridges: 6 };
    case "fauna":
      return { kind: "orb", stretch: 0.9, taper: 0.35, wobble: 0.22, ridges: 5 };
    case "rock":
      return { kind: "crystal", stretch: 0.85, taper: 0.25, wobble: 0.05, ridges: 7 };
    case "structure":
      return { kind: "fan", stretch: 1.05, taper: 0.5, wobble: 0.04, ridges: 4 };
    case "ambient":
      return { kind: "pod", stretch: 0.95, taper: 0.45, wobble: 0.18, ridges: 8 };
  }
}

function defaultBehaviorProfile(archetype: WorldEntity["archetype"]): EntityBehaviorProfile {
  switch (archetype) {
    case "flora":
      return { mode: "pulse", amplitude: 0.28, frequency: 0.9, phase: 0, drift: 0.08 };
    case "fauna":
      return { mode: "glide", amplitude: 1.25, frequency: 0.55, phase: 0.4, drift: 0.4 };
    case "rock":
      return { mode: "rooted", amplitude: 0.04, frequency: 0.3, phase: 0.2, drift: 0 };
    case "structure":
      return { mode: "orbit", amplitude: 0.35, frequency: 0.25, phase: 0.6, drift: 0.04 };
    case "ambient":
      return { mode: "wander", amplitude: 0.8, frequency: 0.45, phase: 1.1, drift: 0.24 };
  }
}

function defaultShaderProfile(archetype: WorldEntity["archetype"]): EntityShaderProfile {
  switch (archetype) {
    case "flora":
      return { style: "biolume", hue_shift: 0.02, pulse: 0.45, distortion: 0.08, fresnel: 1.25 };
    case "fauna":
      return { style: "caustic", hue_shift: 0.12, pulse: 0.35, distortion: 0.14, fresnel: 1 };
    case "rock":
      return { style: "glass", hue_shift: -0.08, pulse: 0.12, distortion: 0.03, fresnel: 1.65 };
    case "structure":
      return { style: "electric", hue_shift: 0.18, pulse: 0.28, distortion: 0.1, fresnel: 1.4 };
    case "ambient":
      return { style: "ember", hue_shift: 0.22, pulse: 0.55, distortion: 0.18, fresnel: 1.15 };
  }
}

function buildEntity(id: string, archetype: WorldEntity["archetype"], position: readonly [number, number, number], nowMs: number, evolutionId: string): WorldEntity {
  return {
    id: asId(id),
    archetype,
    provenance: {
      creator_agent_id: asId("agent_biome"),
      creator_model_id: asId("model_ollama_default"),
      originating_evolution_id: asId(evolutionId)
    },
    chunk_id: chunkId(position[0], position[2]),
    anchor_position: position,
    position,
    rotationY: Math.random() * Math.PI * 2,
    scale: archetype === "fauna" ? 0.7 : 0.55,
    shape_profile: defaultShapeProfile(archetype),
    behavior_profile: defaultBehaviorProfile(archetype),
    shader_profile: defaultShaderProfile(archetype),
    lifecycle_stage: "active",
    lifecycle_t: Math.random(),
    visible_hint: true,
    created_at_ms: nowMs,
    updated_at_ms: nowMs
  };
}

function normalizeEntity(entity: WorldEntity) {
  const current = entity as WorldEntity & Partial<Pick<WorldEntity, "anchor_position" | "shape_profile" | "behavior_profile" | "shader_profile">>;
  current.anchor_position ??= entity.position;
  current.shape_profile = { ...defaultShapeProfile(entity.archetype), ...current.shape_profile };
  current.behavior_profile = { ...defaultBehaviorProfile(entity.archetype), ...current.behavior_profile };
  current.shader_profile = { ...defaultShaderProfile(entity.archetype), ...current.shader_profile };
}

function resolveShapeKind(current: EntityShapeKind, finalProfile?: EvolutionExpectedFinal["shape_profile"], progressT?: number) {
  if (!finalProfile?.kind) return current;
  return (progressT ?? 0) < 0.45 ? current : finalProfile.kind;
}

function resolveBehaviorMode(current: EntityBehaviorMode, finalProfile?: EvolutionExpectedFinal["behavior_profile"], progressT?: number) {
  if (!finalProfile?.mode) return current;
  return (progressT ?? 0) < 0.3 ? current : finalProfile.mode;
}

function resolveShaderStyle(current: EntityShaderStyle, finalProfile?: EvolutionExpectedFinal["shader_profile"], progressT?: number) {
  if (!finalProfile?.style) return current;
  return (progressT ?? 0) < 0.25 ? current : finalProfile.style;
}

function applyBehaviorMotion(entity: WorldEntity, nowMs: number, driftStrength = 1) {
  const t = nowMs / 1000 + entity.behavior_profile.phase;
  const [ax, ay, az] = entity.anchor_position;
  const amplitude = entity.behavior_profile.amplitude * driftStrength;
  const frequency = entity.behavior_profile.frequency;
  const drift = entity.behavior_profile.drift * driftStrength;

  let x = ax;
  let y = ay;
  let z = az;

  switch (entity.behavior_profile.mode) {
    case "rooted":
      y = ay + Math.sin(t * frequency * 2.4) * amplitude * 0.08;
      break;
    case "pulse":
      y = ay + Math.sin(t * frequency * 3.4) * amplitude * 0.18;
      x = ax + Math.cos(t * frequency) * drift * 0.08;
      z = az + Math.sin(t * frequency * 1.2) * drift * 0.08;
      break;
    case "orbit":
      x = ax + Math.cos(t * frequency * 2 + entity.rotationY) * amplitude;
      z = az + Math.sin(t * frequency * 2 + entity.rotationY) * amplitude;
      y = ay + Math.sin(t * frequency * 1.7) * amplitude * 0.12;
      break;
    case "wander":
      x = ax + Math.sin(t * frequency * 1.1 + entity.rotationY) * amplitude + Math.cos(t * 0.8) * drift * 0.25;
      z = az + Math.cos(t * frequency * 1.3 + entity.rotationY * 0.5) * amplitude + Math.sin(t * 0.6) * drift * 0.25;
      y = ay + Math.sin(t * frequency * 2.2) * amplitude * 0.1;
      break;
    case "glide":
      x = ax + Math.cos(t * frequency + entity.rotationY) * amplitude;
      z = az + Math.sin(t * frequency * 0.9 + entity.rotationY) * amplitude * 0.7;
      y = ay + Math.cos(t * frequency * 2.6) * amplitude * 0.15;
      break;
  }

  entity.position = [x, y, z];
  entity.chunk_id = chunkId(x, z);
}

export function createInitialWorld(): World {
  const now = 0;
  const agents = new Map<string, AgentProfile>();
  agents.set(
    "agent_biome",
    {
      id: asId("agent_biome"),
      role: "biome_builder",
      rules: ["Prefer calm bioluminescent ambience.", "Avoid crowded visuals in XR."],
      skills: ["chunking", "lod", "instancing"],
      assigned_model_id: asId("model_ollama_default"),
      mutation_rate: 0.2,
      influence_weights: { calm: 1 },
      memory: []
    }
  );
  agents.set(
    "agent_meta",
    {
      id: asId("agent_meta"),
      role: "meta_agent",
      rules: ["Adjust other agents to improve stability and moderation."],
      skills: ["agent_mutation"],
      assigned_model_id: asId("model_ollama_default"),
      mutation_rate: 0.15,
      influence_weights: {},
      memory: []
    }
  );

  const entities = new Map<string, WorldEntity>();
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * 120;
    const z = (Math.random() - 0.5) * 120;
    const archetype = i % 3 === 0 ? "flora" : i % 3 === 1 ? "fauna" : "rock";
    const id = `entity_${i}`;
    const entity = buildEntity(id, archetype, [x, archetype === "fauna" ? 1.2 : 0.4, z], now, "evo_bootstrap");
    entity.behavior_profile.phase = i * 0.13;
    entities.set(id, entity);
  }

  const evolutions = new Map<string, Evolution>();
  evolutions.set("evo_bootstrap", {
    id: asId("evo_bootstrap"),
    source_agent_id: asId("agent_biome"),
    source_model_id: asId("model_ollama_default"),
    intent: "Bootstrap aquarium drift motion.",
    start_time_ms: 0,
    duration_ms: 60_000,
    stages: [
      { name: "seed", duration_ms: 10_000 },
      { name: "drift", duration_ms: 40_000 },
      { name: "settle", duration_ms: 10_000 }
    ],
    progress_t: 0,
    canceled: false,
    target: { kind: "chunk", chunk_id: "0:0" },
    expected_final: { stable: true },
    history: []
  });

  return { now_ms: now, entities, evolutions, agents, last_effect_ms: 0 };
}

export function applyWorldPatchEnvelope(world: World, env: WorldPatchEnvelope) {
  const nowMs = world.now_ms;
  const patch = env.patch as WorldPatch;
  applyPatchToAgents(world.agents, patch);
  applyPatchToEvolutions(world.evolutions, patch);
  applyPatchToEntities(world.entities, patch, nowMs);
  if (patch.kind === "entity.create") {
    const entity = world.entities.get(patch.entity.id);
    if (entity) normalizeEntity(entity);
  }
  if (patch.kind === "entity.update") {
    const entity = world.entities.get(patch.entity_id);
    if (entity) normalizeEntity(entity);
  }
}

export function stepWorld(world: World, nowMs: number) {
  world.now_ms = nowMs;

  // Advance evolutions and apply coarse effects at a budgeted cadence.
  const effectCadenceMs = 100;
  if (nowMs - world.last_effect_ms < effectCadenceMs) return;
  world.last_effect_ms = nowMs;

  for (const [id, evo] of world.evolutions) {
    const next = advanceEvolution(nowMs, evo);
    world.evolutions.set(id, next);
    if (next.canceled) continue;

    const stageIdx = stageIndexForEvolution(next);
    const driftStrength = stageIdx === 1 ? 1 : stageIdx === 0 ? 0.4 : 0.2;

    if (next.target.kind === "entity") {
      const target = world.entities.get(next.target.entity_id);
      if (target) {
        normalizeEntity(target);
        const stageName = next.stages[stageIdx]?.name ?? "active";
        const stageMap: Record<string, WorldEntity["lifecycle_stage"]> = {
          seed: "seed",
          sprout: "active",
          mature: "active",
          unstable: "unstable",
          decay: "decay",
        };
        const growth = next.expected_final.scale ?? (0.35 + next.progress_t * 1.4);
        target.lifecycle_stage = stageMap[stageName] ?? "active";
        target.lifecycle_t = next.progress_t;
        target.scale = lerp(target.scale, growth, 0.2);
        target.shape_profile = {
          kind: resolveShapeKind(target.shape_profile.kind, next.expected_final.shape_profile, next.progress_t),
          stretch: lerp(target.shape_profile.stretch, next.expected_final.shape_profile?.stretch ?? target.shape_profile.stretch, 0.18),
          taper: lerp(target.shape_profile.taper, next.expected_final.shape_profile?.taper ?? target.shape_profile.taper, 0.18),
          wobble: lerp(target.shape_profile.wobble, next.expected_final.shape_profile?.wobble ?? target.shape_profile.wobble, 0.18),
          ridges: Math.round(lerp(target.shape_profile.ridges, next.expected_final.shape_profile?.ridges ?? target.shape_profile.ridges, 0.18))
        };
        target.behavior_profile = {
          mode: resolveBehaviorMode(target.behavior_profile.mode, next.expected_final.behavior_profile, next.progress_t),
          amplitude: lerp(target.behavior_profile.amplitude, next.expected_final.behavior_profile?.amplitude ?? target.behavior_profile.amplitude, 0.16),
          frequency: lerp(target.behavior_profile.frequency, next.expected_final.behavior_profile?.frequency ?? target.behavior_profile.frequency, 0.16),
          phase: lerp(target.behavior_profile.phase, next.expected_final.behavior_profile?.phase ?? target.behavior_profile.phase, 0.16),
          drift: lerp(target.behavior_profile.drift, next.expected_final.behavior_profile?.drift ?? target.behavior_profile.drift, 0.16)
        };
        target.shader_profile = {
          style: resolveShaderStyle(target.shader_profile.style, next.expected_final.shader_profile, next.progress_t),
          hue_shift: lerp(target.shader_profile.hue_shift, next.expected_final.shader_profile?.hue_shift ?? target.shader_profile.hue_shift, 0.16),
          pulse: lerp(target.shader_profile.pulse, next.expected_final.shader_profile?.pulse ?? target.shader_profile.pulse, 0.16),
          distortion: lerp(target.shader_profile.distortion, next.expected_final.shader_profile?.distortion ?? target.shader_profile.distortion, 0.16),
          fresnel: lerp(target.shader_profile.fresnel, next.expected_final.shader_profile?.fresnel ?? target.shader_profile.fresnel, 0.16)
        };
        target.anchor_position = [
          target.anchor_position[0],
          0.2 + growth * 0.35,
          target.anchor_position[2]
        ];
        applyBehaviorMotion(target, nowMs, 1 + next.progress_t * 0.4);
        target.updated_at_ms = nowMs;
      }
      continue;
    }

    for (const ent of world.entities.values()) {
      normalizeEntity(ent);
      ent.lifecycle_t = (ent.lifecycle_t + 0.005 * driftStrength) % 1;
      applyBehaviorMotion(ent, nowMs, driftStrength);
      ent.updated_at_ms = nowMs;
    }
  }

  // Occasionally schedule a small evolution to demonstrate explicit lifecycle.
  if (Math.random() < 0.01) {
    const evoId = newId("evo");
    world.evolutions.set(evoId, {
      id: asId(evoId),
      source_agent_id: asId("agent_biome"),
      source_model_id: asId("model_ollama_default"),
      intent: "Spawn a flora cluster.",
      start_time_ms: nowMs,
      duration_ms: 12_000,
      stages: [
        { name: "seed", duration_ms: 3_000 },
        { name: "sprout", duration_ms: 4_000 },
        { name: "mature", duration_ms: 5_000 }
      ],
      progress_t: 0,
      canceled: false,
      target: { kind: "chunk", chunk_id: "0:0" },
      expected_final: {
        archetype: "flora",
        shape_profile: { kind: "fan", stretch: 1.6, taper: 0.4, wobble: 0.2, ridges: 9 },
        behavior_profile: { mode: "pulse", amplitude: 0.45, frequency: 1.1, drift: 0.14 },
        shader_profile: { style: "biolume", hue_shift: 0.14, pulse: 0.7, distortion: 0.16, fresnel: 1.45 },
        scale: 1.1,
        reasoning_summary: "Local biome seed opens into a wider fan silhouette with brighter bioluminescence.",
        reasoning_steps: [
          "Increase vertical spread to make the new flora readable at a distance.",
          "Raise pulse and distortion so lifecycle progress is visible without UI chrome.",
          "Keep locomotion rooted to preserve aquarium calm."
        ]
      },
      history: []
    });

    const x = (Math.random() - 0.5) * 120;
    const z = (Math.random() - 0.5) * 120;
    const id = newId("entity");
    const entity = buildEntity(id, "flora", [x, 0.35, z], nowMs, evoId);
    entity.lifecycle_stage = "seed";
    entity.lifecycle_t = 0;
    entity.scale = 0.5;
    world.entities.set(id, entity);
  }
}
