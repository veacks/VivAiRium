import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ActivityEvent, HistoryEntry, HistoryFeedMeta, WorldPatchEnvelope } from "@aquarium/shared/events";

const CACHE_DIR = join(process.cwd(), "cache", "evolution-history");
const PATCH_LOG_PATH = join(CACHE_DIR, "patch-log.json");
const ACTIVITY_LOG_PATH = join(CACHE_DIR, "activity-log.json");
const SPECIES_CACHE_PATH = join(CACHE_DIR, "species-blueprints.json");

type StoredSpeciesBlueprint = {
  species_id: string;
  lineage?: string;
  label?: string;
  stored_at_ms: number;
  payload: unknown;
};

function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function readJsonFile<T>(path: string, fallback: T) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(path: string, payload: unknown) {
  ensureCacheDir();
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

function patchSummary(envelope: WorldPatchEnvelope) {
  const patch = envelope.patch as Record<string, unknown>;
  const kind = typeof patch.kind === "string" ? patch.kind : "unknown";

  if (kind === "entity.create") {
    const entity = patch.entity as Record<string, unknown> | undefined;
    const species = entity?.species as Record<string, unknown> | undefined;
    return {
      patch_kind: kind,
      entity_id: typeof entity?.id === "string" ? entity.id : undefined,
      species_id: typeof species?.species_id === "string" ? species.species_id : undefined,
      summary: `create ${typeof entity?.archetype === "string" ? entity.archetype : "entity"}`,
    };
  }

  if (kind === "evolution.schedule") {
    const evolution = patch.evolution as Record<string, unknown> | undefined;
    const target = evolution?.target as Record<string, unknown> | undefined;
    const expectedFinal = evolution?.expected_final as Record<string, unknown> | undefined;
    const species = expectedFinal?.species_blueprint as Record<string, unknown> | undefined;
    return {
      patch_kind: kind,
      entity_id: typeof target?.entity_id === "string" ? target.entity_id : undefined,
      evolution_id: typeof evolution?.id === "string" ? evolution.id : undefined,
      species_id: typeof species?.species_id === "string" ? species.species_id : undefined,
      summary: `evolution ${typeof evolution?.intent === "string" ? evolution.intent : "scheduled"}`,
    };
  }

  return { patch_kind: kind, summary: kind };
}

function extractSpeciesBlueprints(envelope: WorldPatchEnvelope) {
  const patch = envelope.patch as Record<string, unknown>;
  const found: StoredSpeciesBlueprint[] = [];

  if (patch.kind === "entity.create") {
    const entity = patch.entity as Record<string, unknown> | undefined;
    const species = entity?.species as Record<string, unknown> | undefined;
    if (typeof species?.species_id === "string") {
      found.push({
        species_id: species.species_id,
        lineage: typeof species.lineage === "string" ? species.lineage : undefined,
        label: typeof species.label === "string" ? species.label : undefined,
        stored_at_ms: envelope.created_at_ms,
        payload: species,
      });
    }
  }

  if (patch.kind === "evolution.schedule") {
    const evolution = patch.evolution as Record<string, unknown> | undefined;
    const expectedFinal = evolution?.expected_final as Record<string, unknown> | undefined;
    const species = expectedFinal?.species_blueprint as Record<string, unknown> | undefined;
    if (typeof species?.species_id === "string") {
      found.push({
        species_id: species.species_id,
        lineage: typeof species.lineage === "string" ? species.lineage : undefined,
        label: typeof species.label === "string" ? species.label : undefined,
        stored_at_ms: envelope.created_at_ms,
        payload: species,
      });
    }
  }

  return found;
}

function buildHistoryEntries(log: readonly WorldPatchEnvelope[]): HistoryEntry[] {
  return log.map((envelope, index) => {
    const summary = patchSummary(envelope);
    return {
      cursor: index + 1,
      patch_id: envelope.patch_id,
      created_at_ms: envelope.created_at_ms,
      patch_kind: summary.patch_kind,
      entity_id: summary.entity_id,
      evolution_id: summary.evolution_id,
      species_id: summary.species_id,
      summary: summary.summary,
    };
  });
}

function persistPatchLog() {
  writeJsonFile(PATCH_LOG_PATH, patchLog);
}

function persistActivityLog() {
  writeJsonFile(ACTIVITY_LOG_PATH, activityLog);
}

function persistSpeciesCache() {
  writeJsonFile(SPECIES_CACHE_PATH, [...speciesBlueprints.values()]);
}

ensureCacheDir();

export const patchLog = readJsonFile<WorldPatchEnvelope[]>(PATCH_LOG_PATH, []);
export const seenIdempotency = new Set<string>(patchLog.map((entry) => entry.idempotency_key));
export const votes: Array<{ at_ms: number; value: string; weight: number }> = [];
export const moods: Array<{ at_ms: number; tag: string; weight: number }> = [];
export const deployEvents: Array<{ at_ms: number; status: "succeeded" | "failed"; payload: unknown }> = [];
export const activityLog = readJsonFile<ActivityEvent[]>(ACTIVITY_LOG_PATH, []);
export const speciesBlueprints = new Map<string, StoredSpeciesBlueprint>(
  readJsonFile<StoredSpeciesBlueprint[]>(SPECIES_CACHE_PATH, []).map((entry) => [entry.species_id, entry] as const),
);

for (const envelope of patchLog) {
  for (const species of extractSpeciesBlueprints(envelope)) {
    speciesBlueprints.set(species.species_id, species);
  }
}
persistSpeciesCache();

export function appendPatch(envelope: WorldPatchEnvelope) {
  patchLog.push(envelope);
  for (const species of extractSpeciesBlueprints(envelope)) {
    speciesBlueprints.set(species.species_id, species);
  }
  persistPatchLog();
  persistSpeciesCache();
}

export function appendActivity(event: ActivityEvent) {
  activityLog.push(event);
  if (activityLog.length > 500) {
    activityLog.splice(0, activityLog.length - 500);
  }
  persistActivityLog();
}

export function getHistoryMeta(): HistoryFeedMeta {
  const entries = buildHistoryEntries(patchLog);
  return {
    total_patches: patchLog.length,
    earliest_ms: patchLog[0]?.created_at_ms ?? null,
    latest_ms: patchLog[patchLog.length - 1]?.created_at_ms ?? null,
    entries: entries.slice(-240),
  };
}

export function getHistorySlice(startCursor: number, endCursor: number) {
  const start = Math.max(0, Math.min(startCursor, patchLog.length));
  const end = Math.max(start, Math.min(endCursor, patchLog.length));
  const patches = patchLog.slice(start, end);
  const entries = buildHistoryEntries(patchLog).slice(start, end);
  return {
    patches,
    start_cursor: start,
    end_cursor: end,
    next_cursor: end,
    entries,
  };
}
