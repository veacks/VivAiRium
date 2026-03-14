import { AquariumCanvas } from "../r3f/AquariumCanvas";
import { useWorldStore } from "../state/worldStore";
import { useEffect } from "react";
import { startWorkerClient } from "../sim/workerClient";
import { startActivityClient } from "../activity/activityClient";
import { ActivityConsole } from "./ActivityConsole";

export function App() {
  const stats = useWorldStore((s) => s.stats);

  useEffect(() => {
    const stop = startWorkerClient();
    const stopActivity = startActivityClient();
    return () => {
      stop();
      stopActivity();
    };
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
        <div style={{ fontWeight: 700 }}>Living Aquarium</div>
        <div style={{ opacity: 0.85, fontSize: 12 }}>
          entities: {stats.entityCount} • evolutions: {stats.evolutionCount} • tickHz: {stats.tickHz}
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", minHeight: 0 }}>
        <AquariumCanvas />
        <ActivityConsole />
      </div>
    </div>
  );
}
