import { create } from "zustand";
import type { WorldEntity, Evolution } from "@aquarium/shared/domain";

export type RenderWorldState = {
  now_ms: number;
  entities: Record<string, WorldEntity>;
  evolutions: Record<string, Evolution>;
  stats: { entityCount: number; evolutionCount: number; tickHz: number };

  ingestSnapshot: (snap: { now_ms: number; entities: WorldEntity[]; evolutions: Evolution[]; tickHz: number }) => void;
};

export const useWorldStore = create<RenderWorldState>((set) => ({
  now_ms: 0,
  entities: {},
  evolutions: {},
  stats: { entityCount: 0, evolutionCount: 0, tickHz: 60 },

  ingestSnapshot: (snap) =>
    set(() => {
      const entities: Record<string, WorldEntity> = {};
      for (const e of snap.entities) entities[e.id] = e;
      const evolutions: Record<string, Evolution> = {};
      for (const evo of snap.evolutions) evolutions[evo.id] = evo;
      return {
        now_ms: snap.now_ms,
        entities,
        evolutions,
        stats: { entityCount: snap.entities.length, evolutionCount: snap.evolutions.length, tickHz: snap.tickHz }
      };
    })
}));

