import { useMemo } from "react";
import { useActivityStore } from "../state/activityStore";

const levelColor: Record<string, string> = {
  debug: "#8ea3b8",
  info: "#8af0b5",
  warn: "#ffd36e",
  error: "#ff7f7f",
};

export function ActivityConsole() {
  const events = useActivityStore((s) => s.events);
  const status = useActivityStore((s) => s.status);

  const lines = useMemo(
    () =>
      [...events]
        .reverse()
        .map((event) => ({
          ...event,
          time: new Date(event.at_ms).toLocaleTimeString(),
        })),
    [events],
  );

  const formatStatusTime = (value: number | null) => {
    if (value == null) return "waiting";
    return new Date(value).toLocaleTimeString();
  };

  return (
    <aside
      style={{
        width: 380,
        borderLeft: "1px solid rgba(138, 184, 255, 0.18)",
        background: "linear-gradient(180deg, rgba(6,11,18,0.96), rgba(7,17,28,0.96))",
        padding: 12,
        overflow: "auto",
      }}
    >
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2, opacity: 0.7, marginBottom: 10 }}>
        Agent Console
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <StatusCard
          label="functions connected"
          value={status.functionsConnected ? "yes" : "no"}
          tone={status.functionsConnected ? "info" : "warn"}
        />
        <StatusCard
          label="orchestrator connected"
          value={status.orchestratorConnected ? "yes" : "no"}
          tone={status.orchestratorConnected ? "info" : "warn"}
        />
        <StatusCard label="last patch sent" value={formatStatusTime(status.lastPatchSentAt)} tone="debug" />
        <StatusCard label="last agent activity" value={formatStatusTime(status.lastAgentActivityAt)} tone="debug" />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {lines.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.6 }}>Waiting for orchestrator activity...</div>
        ) : (
          lines.map((event) => (
            <div
              key={event.id}
              style={{
                border: "1px solid rgba(138, 184, 255, 0.14)",
                borderRadius: 10,
                padding: 10,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, opacity: 0.7 }}>
                <span>{event.time}</span>
                <span style={{ color: levelColor[event.level] ?? "#dce9ff" }}>{event.level}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>{event.scope}</div>
              <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>{event.message}</div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: string; tone: "debug" | "info" | "warn" | "error" }) {
  return (
    <div
      style={{
        border: "1px solid rgba(138, 184, 255, 0.14)",
        borderRadius: 10,
        padding: 10,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, opacity: 0.68 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: levelColor[tone] ?? "#dce9ff" }}>{value}</div>
    </div>
  );
}
