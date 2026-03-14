import type { EntityFeedback, WorldEntity } from "@aquarium/shared/domain";

export function computeEntityFeedback(nowMs: number, entity: WorldEntity): EntityFeedback {
  const health = entity.lifecycle_stage === "dead" ? 0 : 1 - (entity.lifecycle_stage === "decay" ? 0.4 : 0);
  const instability = entity.lifecycle_stage === "unstable" ? 0.7 : 0.1;
  return {
    entity_id: entity.id,
    provenance: entity.provenance,
    at_ms: nowMs,
    visibility: { is_visible_hint: entity.visible_hint },
    lifecycle: { stage: entity.lifecycle_stage, t: entity.lifecycle_t },
    activity: { health, instability }
  };
}

