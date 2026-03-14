import { useWorldStore } from "../state/worldStore";
import type { HistoryEntry, HistoryFeedMeta, WorldPatchEnvelope } from "@aquarium/shared/events";

type WorkerOut =
  | {
      type: "snapshot";
      now_ms: number;
      entities: any[];
      evolutions: any[];
      terrain: any[];
      tickHz: number;
    }
  | { type: "feedback.batch"; at_ms: number; feedback: unknown[] };

type WorkerIn =
  | { type: "tick.configure"; hz: number }
  | { type: "patch.apply"; envelope: WorldPatchEnvelope }
  | { type: "patch.batch.apply"; envelopes: WorldPatchEnvelope[] }
  | { type: "snapshot.request" }
  | { type: "world.reset" };

type HistoryFeedResponse = {
  patches: WorldPatchEnvelope[];
  start_cursor: number;
  end_cursor: number;
  next_cursor: number;
  entries: HistoryEntry[];
};

let sharedWorker: Worker | null = null;
let pollStarted = false;
let stopped = false;
let liveMode = true;
let serverCursor = 0;
let historyMetaLoaded = false;
let isRebuilding = false;

function summarizePatch(envelope: WorldPatchEnvelope) {
  const patch = envelope.patch as Record<string, unknown>;
  const kind = typeof patch.kind === "string" ? patch.kind : "unknown";
  if (kind === "entity.create") {
    const entity = patch.entity as Record<string, unknown> | undefined;
    return {
      entity_id: typeof entity?.id === "string" ? entity.id : undefined,
      species_id:
        entity && typeof entity.species === "object" && entity.species && typeof (entity.species as Record<string, unknown>).species_id === "string"
          ? ((entity.species as Record<string, unknown>).species_id as string)
          : undefined,
      summary: `create ${typeof entity?.archetype === "string" ? entity.archetype : "entity"}`,
    };
  }
  if (kind === "evolution.schedule") {
    const evolution = patch.evolution as Record<string, unknown> | undefined;
    const target = evolution?.target as Record<string, unknown> | undefined;
    const expectedFinal = evolution?.expected_final as Record<string, unknown> | undefined;
    const species = expectedFinal?.species_blueprint as Record<string, unknown> | undefined;
    return {
      entity_id: typeof target?.entity_id === "string" ? target.entity_id : undefined,
      evolution_id: typeof evolution?.id === "string" ? evolution.id : undefined,
      species_id: typeof species?.species_id === "string" ? species.species_id : undefined,
      summary: `evolution ${typeof evolution?.intent === "string" ? evolution.intent : "scheduled"}`,
    };
  }
  return { summary: kind };
}

function historyEntryFromEnvelope(envelope: WorldPatchEnvelope, cursor: number): HistoryEntry {
  const patch = envelope.patch as Record<string, unknown>;
  const kind = typeof patch.kind === "string" ? patch.kind : "unknown";
  const summary = summarizePatch(envelope);
  return {
    cursor,
    patch_id: envelope.patch_id,
    created_at_ms: envelope.created_at_ms,
    patch_kind: kind,
    entity_id: summary.entity_id,
    evolution_id: summary.evolution_id,
    species_id: summary.species_id,
    summary: summary.summary,
  };
}

async function fetchHistoryMeta() {
  try {
    const response = await fetch("/api/history-feed?mode=meta", { cache: "no-store" });
    if (!response.ok) return;
    const meta = (await response.json()) as HistoryFeedMeta;
    useWorldStore.getState().setHistoryMeta(meta);
    historyMetaLoaded = true;
    serverCursor = Math.max(serverCursor, meta.total_patches);
  } catch {
    // Ignore transient failures.
  }
}

async function fetchHistorySlice(endCursor: number) {
  const response = await fetch(`/api/history-feed?start_cursor=0&end_cursor=${endCursor}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`history feed failed with ${response.status}`);
  }
  return (await response.json()) as HistoryFeedResponse;
}

async function rebuildWorld(endCursor: number, mode: "live" | "replay") {
  if (!sharedWorker) {
    ensureWorkerStarted();
  }
  if (!sharedWorker) return;

  isRebuilding = true;
  useWorldStore.getState().setReplayState({ loading: true, mode, currentCursor: endCursor });

  try {
    const data = await fetchHistorySlice(endCursor);
    sharedWorker.postMessage({ type: "world.reset" } satisfies WorkerIn);
    if (data.patches.length > 0) {
      sharedWorker.postMessage({ type: "patch.batch.apply", envelopes: data.patches } satisfies WorkerIn);
      useWorldStore.getState().appendHistoryEntries(data.entries);
    }
    sharedWorker.postMessage({ type: "snapshot.request" } satisfies WorkerIn);
    useWorldStore.getState().setReplayState({ loading: false, mode, currentCursor: endCursor });
  } catch {
    useWorldStore.getState().setReplayState({ loading: false });
  } finally {
    isRebuilding = false;
  }
}

function ensureWorkerStarted() {
  if (sharedWorker) return;

  const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
  sharedWorker = worker;

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if (msg.type === "snapshot") {
      useWorldStore.getState().ingestSnapshot({
        now_ms: msg.now_ms,
        entities: msg.entities as any,
        evolutions: msg.evolutions as any,
        terrain: msg.terrain as any,
        tickHz: msg.tickHz,
      });
      return;
    }
    if (msg.type === "feedback.batch") {
      return;
    }
  };

  worker.postMessage({ type: "tick.configure", hz: 60 } satisfies WorkerIn);

  if (!pollStarted) {
    pollStarted = true;
    stopped = false;

    const stopPolling = () => {
      stopped = true;
      if (sharedWorker) {
        sharedWorker.terminate();
        sharedWorker = null;
      }
      pollStarted = false;
      historyMetaLoaded = false;
      isRebuilding = false;
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", stopPolling, { once: true });
    }

    void fetchHistoryMeta();

    const poll = async () => {
      while (!stopped) {
        try {
          const startCursor = serverCursor;
          const response = await fetch(`/api/patch-feed?cursor=${startCursor}`, { cache: "no-store" });
          if (response.ok) {
            const data = (await response.json()) as { next_cursor: number; patches: WorldPatchEnvelope[] };
            if (data.patches.length > 0) {
              const entries = data.patches.map((envelope, index) => historyEntryFromEnvelope(envelope, startCursor + index + 1));
              useWorldStore.getState().appendHistoryEntries(entries);
              if (liveMode && !isRebuilding) {
                sharedWorker?.postMessage({ type: "patch.batch.apply", envelopes: data.patches } satisfies WorkerIn);
                useWorldStore.getState().setReplayState({ currentCursor: data.next_cursor });
              }
            }
            serverCursor = data.next_cursor;
            if (!historyMetaLoaded) {
              useWorldStore.getState().setHistoryMeta({
                total_patches: data.next_cursor,
                earliest_ms: data.patches[0]?.created_at_ms ?? useWorldStore.getState().replay.meta.earliest_ms,
                latest_ms: data.patches.at(-1)?.created_at_ms ?? useWorldStore.getState().replay.meta.latest_ms,
                entries: useWorldStore.getState().replay.meta.entries,
              });
              historyMetaLoaded = true;
            } else {
              useWorldStore.getState().setReplayState(
                liveMode ? { currentCursor: data.next_cursor, mode: "live" } : { currentCursor: useWorldStore.getState().replay.currentCursor },
              );
            }
          }
        } catch {
          // Ignore transient polling failures.
        }
        await new Promise((resolve) => setTimeout(resolve, liveMode ? 600 : 1200));
      }
    };
    void poll();
  }
}

export async function replayWorldAtCursor(cursor: number) {
  ensureWorkerStarted();
  liveMode = false;
  await rebuildWorld(cursor, "replay");
}

export async function resumeLiveWorld() {
  ensureWorkerStarted();
  liveMode = true;
  if (!historyMetaLoaded) {
    await fetchHistoryMeta();
  }
  await rebuildWorld(serverCursor, "live");
}

export function startWorkerClient() {
  ensureWorkerStarted();
  return () => {};
}
