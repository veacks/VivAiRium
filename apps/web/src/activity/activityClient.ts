import { useActivityStore } from "../state/activityStore";
import type { ActivityEvent } from "@aquarium/shared/events";

let started = false;
let stopped = false;

function startPollingLoop() {
  if (started) return;
  started = true;
  stopped = false;

  const stopPolling = () => {
    stopped = true;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", stopPolling, { once: true });
  }

  const poll = async () => {
    while (!stopped) {
      const since = useActivityStore.getState().nextSince;
      try {
        const response = await fetch(`/api/activity-feed?since=${since}`, { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as { events: ActivityEvent[]; next_since: number };
          useActivityStore.getState().ingest(data.events, data.next_since, Date.now());
        }
      } catch {
        // Keep polling during local startup transitions.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  void poll();
}

export function startActivityClient() {
  startPollingLoop();
  return () => {};
}
