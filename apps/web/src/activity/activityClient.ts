import { useActivityStore } from "../state/activityStore";
import type { ActivityEvent } from "@aquarium/shared/events";

export function startActivityClient() {
  let stopped = false;

  const poll = async () => {
    while (!stopped) {
      const since = useActivityStore.getState().nextSince;
      try {
        const response = await fetch(`/api/activity-feed?since=${since}`);
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

  poll();
  return () => {
    stopped = true;
  };
}
