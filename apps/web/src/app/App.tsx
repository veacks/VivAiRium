import { AquariumCanvas } from "../r3f/AquariumCanvas";
import { useWorldStore } from "../state/worldStore";
import { useEffect } from "react";
import { startWorkerClient } from "../sim/workerClient";

export function App() {
  const stats = useWorldStore((s) => s.stats);

  useEffect(() => {
    const stop = startWorkerClient();
    return () => stop();
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
        <div style={{ fontWeight: 700 }}>Living Aquarium</div>
        <div style={{ opacity: 0.85, fontSize: 12 }}>
          entities: {stats.entityCount} • evolutions: {stats.evolutionCount} • tickHz: {stats.tickHz}
        </div>
      </header>
      <AquariumCanvas />
    </div>
  );
}

