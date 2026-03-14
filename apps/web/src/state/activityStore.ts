import { create } from "zustand";
import type { ActivityEvent } from "@aquarium/shared/events";

export type ActivityStatus = {
  functionsConnected: boolean;
  orchestratorConnected: boolean;
  lastPatchSentAt: number | null;
  lastAgentActivityAt: number | null;
};

type ActivityState = {
  events: ActivityEvent[];
  nextSince: number;
  status: ActivityStatus;
  lastFeedSuccessAt: number | null;
  ingest: (events: ActivityEvent[], nextSince: number, fetchedAt: number) => void;
};

function deriveStatus(events: ActivityEvent[], lastFeedSuccessAt: number | null): ActivityStatus {
  const now = Date.now();
  const functionsConnected = lastFeedSuccessAt != null && now - lastFeedSuccessAt < 15_000;
  const orchestratorConnected = events.some(
    (event) => (event.source === "orchestrator" || event.source === "agent") && now - event.at_ms < 30_000,
  );
  const lastPatchSent = [...events].reverse().find((event) => event.message === "world patch sent");
  const lastAgentActivity = [...events]
    .reverse()
    .find((event) => event.source === "agent" || event.scope === "biome_builder" || event.scope === "meta_agent" || event.scope === "mutation_builder");

  return {
    functionsConnected,
    orchestratorConnected,
    lastPatchSentAt: lastPatchSent?.at_ms ?? null,
    lastAgentActivityAt: lastAgentActivity?.at_ms ?? null,
  };
}

export const useActivityStore = create<ActivityState>((set) => ({
  events: [],
  nextSince: 0,
  status: {
    functionsConnected: false,
    orchestratorConnected: false,
    lastPatchSentAt: null,
    lastAgentActivityAt: null,
  },
  lastFeedSuccessAt: null,
  ingest: (events, nextSince, fetchedAt) =>
    set((state) => {
      const merged = [...state.events, ...events]
        .sort((a, b) => a.at_ms - b.at_ms)
        .slice(-120);
      return {
        events: merged,
        nextSince,
        lastFeedSuccessAt: fetchedAt,
        status: deriveStatus(merged, fetchedAt),
      };
    }),
}));
