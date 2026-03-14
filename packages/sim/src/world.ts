import type { AgentProfile, Evolution, WorldEntity } from "@aquarium/shared/domain";
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
    entities.set(id, {
      id: asId(id),
      archetype,
      provenance: {
        creator_agent_id: asId("agent_biome"),
        creator_model_id: asId("model_ollama_default"),
        originating_evolution_id: asId("evo_bootstrap")
      },
      chunk_id: chunkId(x, z),
      position: [x, archetype === "fauna" ? 1.2 : 0.4, z],
      rotationY: Math.random() * Math.PI * 2,
      scale: archetype === "fauna" ? 0.7 : 0.55,
      lifecycle_stage: "active",
      lifecycle_t: Math.random(),
      visible_hint: true,
      created_at_ms: now,
      updated_at_ms: now
    });
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
        const stageName = next.stages[stageIdx]?.name ?? "active";
        const stageMap: Record<string, WorldEntity["lifecycle_stage"]> = {
          seed: "seed",
          sprout: "active",
          mature: "active",
          unstable: "unstable",
          decay: "decay",
        };
        const growth = 0.35 + next.progress_t * 1.4;
        target.lifecycle_stage = stageMap[stageName] ?? "active";
        target.lifecycle_t = next.progress_t;
        target.scale = growth;
        target.position = [target.position[0], 0.2 + growth * 0.35, target.position[2]];
        target.updated_at_ms = nowMs;
      }
      continue;
    }

    for (const ent of world.entities.values()) {
      if (ent.archetype !== "fauna") continue;
      const [x, y, z] = ent.position;
      const t = nowMs / 1000;
      const nx = x + Math.cos(t + ent.rotationY) * 0.03 * driftStrength;
      const nz = z + Math.sin(t + ent.rotationY) * 0.03 * driftStrength;
      ent.position = [nx, y, nz];
      ent.chunk_id = chunkId(nx, nz);
      ent.lifecycle_t = (ent.lifecycle_t + 0.005) % 1;
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
      expected_final: { archetype: "flora" },
      history: []
    });

    const x = (Math.random() - 0.5) * 120;
    const z = (Math.random() - 0.5) * 120;
    const id = newId("entity");
    world.entities.set(id, {
      id: asId(id),
      archetype: "flora",
      provenance: {
        creator_agent_id: asId("agent_biome"),
        creator_model_id: asId("model_ollama_default"),
        originating_evolution_id: asId(evoId)
      },
      chunk_id: chunkId(x, z),
      position: [x, 0.35, z],
      rotationY: Math.random() * Math.PI * 2,
      scale: 0.5,
      lifecycle_stage: "seed",
      lifecycle_t: 0,
      visible_hint: true,
      created_at_ms: nowMs,
      updated_at_ms: nowMs
    });
  }
}
