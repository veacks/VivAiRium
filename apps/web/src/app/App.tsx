import { AquariumCanvas } from "../r3f/AquariumCanvas";
import { useWorldStore } from "../state/worldStore";
import { useEffect, useState } from "react";
import { replayWorldAtCursor, resumeLiveWorld, startWorkerClient } from "../sim/workerClient";
import { startActivityClient } from "../activity/activityClient";
import { ActivityConsole } from "./ActivityConsole";

export function App() {
  const stats = useWorldStore((s) => s.stats);
  const replay = useWorldStore((s) => s.replay);
  const [draftIndex, setDraftIndex] = useState(0);

  useEffect(() => {
    const stop = startWorkerClient();
    const stopActivity = startActivityClient();
    return () => {
      stop();
      stopActivity();
    };
  }, []);

  useEffect(() => {
    if (replay.meta.entries.length === 0) return;
    if (replay.mode === "live") {
      setDraftIndex(replay.meta.entries.length - 1);
      return;
    }
    const currentIndex = replay.meta.entries.findIndex((entry) => entry.cursor === replay.currentCursor);
    if (currentIndex >= 0) {
      setDraftIndex(currentIndex);
    }
  }, [replay.currentCursor, replay.meta.entries, replay.mode]);

  const activeEntry = replay.meta.entries[Math.min(draftIndex, Math.max(replay.meta.entries.length - 1, 0))];

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <header style={{ display: "grid", gap: 10, padding: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Living Aquarium</div>
          <div style={{ opacity: 0.85, fontSize: 12 }}>
            entities: {stats.entityCount} • species: {stats.speciesCount} • terrain: {stats.terrainCount} • evolutions: {stats.evolutionCount} • tickHz: {stats.tickHz}
          </div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            render: {stats.renderedEntityCount}/{stats.renderEntityBudget || "?"} • vertices: {stats.renderVertexCount}/{stats.renderVertexBudget || "?"}
          </div>
          <div style={{ opacity: 0.62, fontSize: 11 }}>cache: cache/evolution-history</div>
        </div>
        <ReplayControls
          replay={replay}
          draftIndex={draftIndex}
          activeEntry={activeEntry}
          onDraftIndexChange={setDraftIndex}
        />
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", minHeight: 0 }}>
        <AquariumCanvas />
        <ActivityConsole />
      </div>
    </div>
  );
}

function ReplayControls({
  replay,
  draftIndex,
  activeEntry,
  onDraftIndexChange,
}: {
  replay: ReturnType<typeof useWorldStore.getState>["replay"];
  draftIndex: number;
  activeEntry: ReturnType<typeof useWorldStore.getState>["replay"]["meta"]["entries"][number] | undefined;
  onDraftIndexChange: (index: number) => void;
}) {
  const entries = replay.meta.entries;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(180px, 320px) auto auto",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.72 }}>
        {replay.mode === "live" ? "live stream" : "time travel"}
        {activeEntry ? ` • ${new Date(activeEntry.created_at_ms).toLocaleTimeString()}` : ""}
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(entries.length - 1, 0)}
        value={Math.min(draftIndex, Math.max(entries.length - 1, 0))}
        onChange={(event) => onDraftIndexChange(Number.parseInt(event.target.value, 10) || 0)}
        disabled={entries.length === 0 || replay.loading}
      />
      <button
        onClick={() => {
          if (!activeEntry) return;
          void replayWorldAtCursor(activeEntry.cursor);
        }}
        disabled={!activeEntry || replay.loading}
      >
        {replay.loading ? "Rebuilding..." : "Replay"}
      </button>
      <button
        onClick={() => {
          void resumeLiveWorld();
        }}
        disabled={replay.loading || replay.mode === "live"}
      >
        Live
      </button>
    </div>
  );
}
