/// <reference lib="webworker" />
import type { WorldEntity, Evolution, AgentProfile } from "@aquarium/shared/domain";
import type { WorldPatchEnvelope } from "@aquarium/shared/events";
import { createInitialWorld, applyWorldPatchEnvelope, stepWorld } from "@aquarium/sim/world";

type InMsg =
  | { type: "patch.apply"; envelope: WorldPatchEnvelope }
  | { type: "tick.configure"; hz: number }
  | { type: "snapshot.request" };

type OutMsg =
  | { type: "snapshot"; now_ms: number; entities: WorldEntity[]; evolutions: Evolution[]; agents: AgentProfile[]; tickHz: number }
  | { type: "feedback.batch"; at_ms: number; feedback: unknown[] };

let tickHz = 60;
let tickHandle: number | null = null;

const world = createInitialWorld();

function emitSnapshot() {
  postMessage({
    type: "snapshot",
    now_ms: world.now_ms,
    entities: [...world.entities.values()],
    evolutions: [...world.evolutions.values()],
    agents: [...world.agents.values()],
    tickHz
  } satisfies OutMsg);
}

function step() {
  stepWorld(world, performance.now());
  emitSnapshot();
}

function startLoop() {
  if (tickHandle != null) return;
  const interval = Math.max(5, Math.floor(1000 / tickHz));
  tickHandle = setInterval(step, interval) as unknown as number;
}

startLoop();
emitSnapshot();

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "tick.configure") {
    tickHz = msg.hz;
    if (tickHandle != null) clearInterval(tickHandle);
    tickHandle = null;
    startLoop();
    return;
  }
  if (msg.type === "snapshot.request") {
    emitSnapshot();
    return;
  }
  if (msg.type === "patch.apply") {
    applyWorldPatchEnvelope(world, msg.envelope);
    emitSnapshot();
    return;
  }
};

