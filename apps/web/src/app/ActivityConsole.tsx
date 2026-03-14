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
              <EventDetails details={event.details} />
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function EventDetails({ details }: { details?: Record<string, unknown> }) {
  const entries = useMemo(
    () => Object.entries(details ?? {}).filter(([, value]) => value != null),
    [details],
  );

  if (entries.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid rgba(138, 184, 255, 0.1)",
        display: "grid",
        gap: 6,
      }}
    >
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: "grid", gap: 3 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.9, opacity: 0.6 }}>
            {key.replace(/_/g, " ")}
          </div>
          <DetailValue value={value} />
        </div>
      ))}
    </div>
  );
}

function DetailValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        {value.map((item, index) => (
          <div key={`${index}-${String(item)}`} style={{ fontSize: 11, lineHeight: 1.45, opacity: 0.92 }}>
            • {formatScalar(item)}
          </div>
        ))}
      </div>
    );
  }

  if (value && typeof value === "object") {
    return (
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSize: 11,
          lineHeight: 1.45,
          opacity: 0.92,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return <div style={{ fontSize: 11, lineHeight: 1.45, opacity: 0.92 }}>{formatScalar(value)}</div>;
}

function formatScalar(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  return JSON.stringify(value);
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
