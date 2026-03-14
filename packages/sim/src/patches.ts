import type { AgentId, EntityId, EvolutionId, ModelId } from "@aquarium/shared/ids";
import type { AgentProfile, Evolution, WorldEntity } from "@aquarium/shared/domain";

export type EntityCreatePatch = { kind: "entity.create"; entity: WorldEntity };
export type EntityUpdatePatch = { kind: "entity.update"; entity_id: EntityId; changes: Partial<WorldEntity> };
export type EntityDeletePatch = { kind: "entity.delete"; entity_id: EntityId };

export type EvolutionSchedulePatch = { kind: "evolution.schedule"; evolution: Evolution };
export type EvolutionCancelPatch = { kind: "evolution.cancel"; evolution_id: EvolutionId };

export type AgentMutationPatch =
  | { kind: "agent.rule.add"; agent_id: AgentId; rule: string }
  | { kind: "agent.rule.remove"; agent_id: AgentId; rule: string }
  | { kind: "agent.skill.add"; agent_id: AgentId; skill: string }
  | { kind: "agent.skill.remove"; agent_id: AgentId; skill: string }
  | { kind: "agent.model.swap"; agent_id: AgentId; model_id: ModelId }
  | { kind: "agent.mutation_rate.set"; agent_id: AgentId; mutation_rate: number }
  | { kind: "agent.freeze"; agent_id: AgentId; until_ms: number }
  | { kind: "agent.unfreeze"; agent_id: AgentId };

export type WorldPatch =
  | EntityCreatePatch
  | EntityUpdatePatch
  | EntityDeletePatch
  | EvolutionSchedulePatch
  | EvolutionCancelPatch
  | AgentMutationPatch;

export function applyPatchToEntities(entities: Map<string, WorldEntity>, patch: WorldPatch, nowMs: number) {
  if (patch.kind === "entity.create") {
    entities.set(patch.entity.id, patch.entity);
    return;
  }
  if (patch.kind === "entity.update") {
    const prev = entities.get(patch.entity_id);
    if (!prev) return;
    entities.set(patch.entity_id, { ...prev, ...patch.changes, updated_at_ms: nowMs });
    return;
  }
  if (patch.kind === "entity.delete") {
    entities.delete(patch.entity_id);
    return;
  }
}

export function applyPatchToEvolutions(evolutions: Map<string, Evolution>, patch: WorldPatch) {
  if (patch.kind === "evolution.schedule") {
    evolutions.set(patch.evolution.id, patch.evolution);
    return;
  }
  if (patch.kind === "evolution.cancel") {
    const prev = evolutions.get(patch.evolution_id);
    if (!prev) return;
    evolutions.set(patch.evolution_id, { ...prev, canceled: true });
    return;
  }
}

export function applyPatchToAgents(agents: Map<string, AgentProfile>, patch: WorldPatch) {
  const get = (id: string) => agents.get(id);
  const set = (id: string, a: AgentProfile) => agents.set(id, a);

  if (!patch.kind.startsWith("agent.")) return;
  const a = get((patch as any).agent_id);
  if (!a) return;

  switch (patch.kind) {
    case "agent.rule.add":
      if (!a.rules.includes(patch.rule)) set(a.id, { ...a, rules: [...a.rules, patch.rule] });
      return;
    case "agent.rule.remove":
      set(a.id, { ...a, rules: a.rules.filter((r) => r !== patch.rule) });
      return;
    case "agent.skill.add":
      if (!a.skills.includes(patch.skill)) set(a.id, { ...a, skills: [...a.skills, patch.skill] });
      return;
    case "agent.skill.remove":
      set(a.id, { ...a, skills: a.skills.filter((s) => s !== patch.skill) });
      return;
    case "agent.model.swap":
      set(a.id, { ...a, assigned_model_id: patch.model_id });
      return;
    case "agent.mutation_rate.set":
      set(a.id, { ...a, mutation_rate: Math.max(0, Math.min(1, patch.mutation_rate)) });
      return;
    case "agent.freeze":
      set(a.id, { ...a, frozen_until_ms: patch.until_ms });
      return;
    case "agent.unfreeze":
      set(a.id, { ...a, frozen_until_ms: undefined });
      return;
  }
}

