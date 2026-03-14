import { useWorldStore } from "../state/worldStore";
import type { WorldPatchEnvelope } from "@aquarium/shared/events";

type WorkerOut =
  | { type: "snapshot"; now_ms: number; entities: any[]; evolutions: any[]; tickHz: number }
  | { type: "feedback.batch"; at_ms: number; feedback: unknown[] };

type WorkerIn =
  | { type: "tick.configure"; hz: number }
  | { type: "patch.apply"; envelope: WorldPatchEnvelope }
  | { type: "snapshot.request" };

let sharedWorker: Worker | null = null;
let pollStarted = false;
let stopped = false;

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
        tickHz: msg.tickHz
      });
      return;
    }
    if (msg.type === "feedback.batch") {
      // MVP seam: forward feedback to server/orchestrator later.
      return;
    }
  };

  const tickHz = 60;
  worker.postMessage({ type: "tick.configure", hz: tickHz } satisfies WorkerIn);

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
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", stopPolling, { once: true });
    }

    let cursor = 0;
    const poll = async () => {
      while (!stopped) {
        try {
          const res = await fetch(`/api/patch-feed?cursor=${cursor}`, { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as { next_cursor: number; patches: WorldPatchEnvelope[] };
            cursor = data.next_cursor;
            for (const env of data.patches) {
              sharedWorker?.postMessage({ type: "patch.apply", envelope: env } satisfies WorkerIn);
            }
          }
        } catch {
          // ignore transient errors
        }
        await new Promise((r) => setTimeout(r, 750));
      }
    };
    void poll();
  }
}

export function startWorkerClient() {
  ensureWorkerStarted();
  return () => {};
}
