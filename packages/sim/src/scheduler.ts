import type { Evolution } from "@aquarium/shared/domain";

export function advanceEvolution(nowMs: number, evo: Evolution): Evolution {
  if (evo.canceled) return evo;
  const elapsed = Math.max(0, nowMs - evo.start_time_ms);
  const progress_t = evo.duration_ms > 0 ? Math.min(1, elapsed / evo.duration_ms) : 1;
  return { ...evo, progress_t };
}

export function stageIndexForEvolution(evo: Evolution): number {
  if (evo.stages.length === 0) return 0;
  const total = evo.stages.reduce((a, s) => a + Math.max(0, s.duration_ms), 0);
  const tMs = total === 0 ? 0 : evo.progress_t * total;
  let acc = 0;
  for (let i = 0; i < evo.stages.length; i++) {
    acc += Math.max(0, evo.stages[i].duration_ms);
    if (tMs <= acc) return i;
  }
  return evo.stages.length - 1;
}

