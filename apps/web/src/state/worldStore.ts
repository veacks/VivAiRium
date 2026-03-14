import { create } from "zustand";
import type { Evolution, TerrainCell, WorldEntity } from "@aquarium/shared/domain";
import type { HistoryEntry, HistoryFeedMeta } from "@aquarium/shared/events";

export type ReplayState = {
  mode: "live" | "replay";
  currentCursor: number | null;
  loading: boolean;
  meta: HistoryFeedMeta;
};

export type RenderWorldState = {
  now_ms: number;
  entities: Record<string, WorldEntity>;
  evolutions: Record<string, Evolution>;
  terrain: Record<string, TerrainCell>;
  stats: {
    entityCount: number;
    evolutionCount: number;
    terrainCount: number;
    speciesCount: number;
    tickHz: number;
    renderedEntityCount: number;
    renderVertexCount: number;
    renderEntityBudget: number;
    renderVertexBudget: number;
  };
  replay: ReplayState;

  ingestSnapshot: (snap: {
    now_ms: number;
    entities: WorldEntity[];
    evolutions: Evolution[];
    terrain: TerrainCell[];
    tickHz: number;
  }) => void;
  setHistoryMeta: (meta: HistoryFeedMeta) => void;
  appendHistoryEntries: (entries: HistoryEntry[]) => void;
  setReplayState: (changes: Partial<ReplayState>) => void;
  setRenderBudgetStats: (stats: {
    renderedEntityCount: number;
    renderVertexCount: number;
    renderEntityBudget: number;
    renderVertexBudget: number;
  }) => void;
};

export const useWorldStore = create<RenderWorldState>((set) => ({
  now_ms: 0,
  entities: {},
  evolutions: {},
  terrain: {},
  stats: {
    entityCount: 0,
    evolutionCount: 0,
    terrainCount: 0,
    speciesCount: 0,
    tickHz: 60,
    renderedEntityCount: 0,
    renderVertexCount: 0,
    renderEntityBudget: 0,
    renderVertexBudget: 0,
  },
  replay: {
    mode: "live",
    currentCursor: null,
    loading: false,
    meta: { total_patches: 0, earliest_ms: null, latest_ms: null, entries: [] },
  },

  ingestSnapshot: (snap) =>
    set((state) => {
      const entities: Record<string, WorldEntity> = {};
      for (const e of snap.entities) entities[e.id] = e;
      const evolutions: Record<string, Evolution> = {};
      for (const evo of snap.evolutions) evolutions[evo.id] = evo;
      const terrain: Record<string, TerrainCell> = {};
      for (const cell of snap.terrain) terrain[cell.id] = cell;
      const speciesCount = new Set(snap.entities.map((entity) => entity.species.species_id)).size;
      return {
        now_ms: snap.now_ms,
        entities,
        evolutions,
        terrain,
        stats: {
          entityCount: snap.entities.length,
          evolutionCount: snap.evolutions.length,
          terrainCount: snap.terrain.length,
          speciesCount,
          tickHz: snap.tickHz,
          renderedEntityCount: state.stats.renderedEntityCount,
          renderVertexCount: state.stats.renderVertexCount,
          renderEntityBudget: state.stats.renderEntityBudget,
          renderVertexBudget: state.stats.renderVertexBudget,
        },
      };
    }),
  setHistoryMeta: (meta) =>
    set((state) => ({
      replay: {
        ...state.replay,
        meta,
        currentCursor: state.replay.mode === "live" ? meta.total_patches : state.replay.currentCursor,
      },
    })),
  appendHistoryEntries: (entries) =>
    set((state) => {
      if (entries.length === 0) return state;
      const mergedByCursor = new Map(state.replay.meta.entries.map((entry) => [entry.cursor, entry] as const));
      for (const entry of entries) {
        mergedByCursor.set(entry.cursor, entry);
      }
      const merged = [...mergedByCursor.values()].sort((a, b) => a.cursor - b.cursor);
      const last = merged[merged.length - 1];
      return {
        replay: {
          ...state.replay,
          meta: {
            total_patches: Math.max(state.replay.meta.total_patches, last?.cursor ?? state.replay.meta.total_patches),
            earliest_ms: state.replay.meta.earliest_ms ?? entries[0]?.created_at_ms ?? null,
            latest_ms: last?.created_at_ms ?? state.replay.meta.latest_ms,
            entries: merged.slice(-240),
          },
          currentCursor:
            state.replay.mode === "live"
              ? Math.max(state.replay.currentCursor ?? 0, last?.cursor ?? 0)
              : state.replay.currentCursor,
        },
      };
    }),
  setReplayState: (changes) =>
    set((state) => ({
      replay: {
        ...state.replay,
        ...changes,
      },
    })),
  setRenderBudgetStats: (stats) =>
    set((state) => ({
      stats: {
        ...state.stats,
        ...stats,
      },
    })),
}));
