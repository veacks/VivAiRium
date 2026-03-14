import type {
  AgentProfile,
  BehaviorPattern,
  EntityArchetype,
  EntityBehaviorMode,
  EntityBehaviorProfile,
  EntityShaderProfile,
  EntityShaderStyle,
  EntityShapeKind,
  EntityShapeProfile,
  Evolution,
  EvolutionExpectedFinal,
  GeometryAsset,
  GeometryGenerator,
  SpeciesBlueprint,
  SpeciesGuild,
  TerrainCell,
  TerrainType,
  TextureAsset,
  TextureGenerator,
  WorldEntity,
} from "@aquarium/shared/domain";
import type { WorldPatchEnvelope } from "@aquarium/shared/events";
import { asId } from "@aquarium/shared/ids";
import { advanceEvolution, stageIndexForEvolution } from "./scheduler";
import { applyPatchToAgents, applyPatchToEntities, applyPatchToEvolutions, type WorldPatch } from "./patches";

export type World = {
  now_ms: number;
  entities: Map<string, WorldEntity>;
  evolutions: Map<string, Evolution>;
  agents: Map<string, AgentProfile>;
  terrain: Map<string, TerrainCell>;
  last_effect_ms: number;
};

type EcologyMetrics = {
  terrain: TerrainCell;
  sunAccess: number;
  shadePressure: number;
  territoryPressure: number;
  crowding: number;
  rivalCount: number;
  alliedCount: number;
  rivalVector: readonly [number, number];
  brightestNeighbor: TerrainCell;
  calmestNeighbor: TerrainCell;
  adaptationPressure: number;
};

type SpeciesFocus =
  | "sun_spire"
  | "canopy_duelist"
  | "marsh_filter"
  | "basalt_spine"
  | "reef_bloom"
  | "territory_stalker"
  | "burrow_clan"
  | "ridge_pack"
  | "reef_skimmer"
  | "terrain_plate";

const CHUNK_SIZE = 32;
const TERRAIN_CELL_SIZE = 10;
const TERRAIN_RADIUS = 6;
const MAX_WORLD_ENTITIES = 180;
const MAX_WORLD_EVOLUTIONS = 96;
const BASE_EFFECT_CADENCE_MS = 70;

const TERRAIN_LABELS: Record<TerrainType, readonly string[]> = {
  loam: ["Loam", "Humus", "Canopy"],
  reef: ["Reef", "Brine", "Coral"],
  marsh: ["Marsh", "Fen", "Silt"],
  basalt: ["Basalt", "Ash", "Obsidian"],
  dune: ["Dune", "Dust", "Solar"],
};

const PLANT_LABELS = ["Crown", "Lattice", "Spire", "Mire", "Veil", "Kelp"];
const ANIMAL_LABELS = ["Stalker", "Pack", "Runner", "Grazer", "Burrower", "Raker"];
const TERRAIN_LABELS_SUFFIX = ["Shelf", "Plate", "Ridge", "Shelf", "Cradle", "Delta"];

function chunkId(x: number, z: number) {
  return `${Math.floor(x / CHUNK_SIZE)}:${Math.floor(z / CHUNK_SIZE)}`;
}

function terrainCellId(column: number, row: number) {
  return `terrain_${column}:${row}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function horizontalDistance(a: readonly [number, number, number], b: readonly [number, number, number]) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededUnit(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
}

function seededRange(seed: number, min: number, max: number) {
  return lerp(min, max, seededUnit(seed));
}

function pickSeeded<T>(items: readonly T[], seed: number) {
  return items[Math.floor(seededUnit(seed) * items.length) % items.length];
}

function oscillate(seed: number, scale = 1) {
  return Math.sin(seed) * scale;
}

function effectCadenceForEntityCount(entityCount: number) {
  return clamp(BASE_EFFECT_CADENCE_MS + Math.floor(Math.max(0, entityCount - 90) / 18) * 10, BASE_EFFECT_CADENCE_MS, 150);
}

function terrainTypeFromSignal(elevation: number, moisture: number, fertility: number): TerrainType {
  if (moisture > 0.7) return fertility > 0.55 ? "marsh" : "reef";
  if (elevation > 0.74 && fertility < 0.45) return "basalt";
  if (moisture < 0.28 && elevation > 0.52) return "dune";
  if (fertility > 0.72 && moisture > 0.42) return "reef";
  return "loam";
}

function createTerrainGrid(nowMs: number) {
  const terrain = new Map<string, TerrainCell>();
  for (let row = -TERRAIN_RADIUS; row <= TERRAIN_RADIUS; row++) {
    for (let column = -TERRAIN_RADIUS; column <= TERRAIN_RADIUS; column++) {
      const elevation = clamp(
        0.48 + Math.sin(column * 0.62) * 0.24 + Math.cos(row * 0.51) * 0.18,
        0.06,
        0.95,
      );
      const moisture = clamp(
        0.44 + Math.sin((column + row) * 0.43) * 0.19 + Math.cos(column * 0.35) * 0.12,
        0.05,
        0.95,
      );
      const fertility = clamp(
        0.52 + Math.cos((column - row) * 0.39) * 0.23 + Math.sin(row * 0.27) * 0.11,
        0.08,
        0.96,
      );
      const terrain_type = terrainTypeFromSignal(elevation, moisture, fertility);
      terrain.set(terrainCellId(column, row), {
        id: terrainCellId(column, row),
        column,
        row,
        x: column * TERRAIN_CELL_SIZE,
        z: row * TERRAIN_CELL_SIZE,
        elevation,
        moisture,
        fertility,
        sunlight: clamp(0.58 + elevation * 0.38 - moisture * 0.12, 0.12, 1.35),
        terrain_type,
        dominant_species_id: undefined,
        updated_at_ms: nowMs,
      });
    }
  }
  return terrain;
}

function terrainCellForPosition(world: World, x: number, z: number) {
  const column = clamp(Math.round(x / TERRAIN_CELL_SIZE), -TERRAIN_RADIUS, TERRAIN_RADIUS);
  const row = clamp(Math.round(z / TERRAIN_CELL_SIZE), -TERRAIN_RADIUS, TERRAIN_RADIUS);
  return world.terrain.get(terrainCellId(column, row)) ?? [...world.terrain.values()][0];
}

function deleteEntityAndTargetedEvolutions(world: World, entityId: string) {
  world.entities.delete(entityId);
  for (const [evolutionId, evolution] of world.evolutions) {
    if (evolution.target.kind === "entity" && evolution.target.entity_id === entityId) {
      world.evolutions.delete(evolutionId);
    }
  }
}

function enforceEvolutionBudget(world: World) {
  if (world.evolutions.size <= MAX_WORLD_EVOLUTIONS) return;

  const candidates = [...world.evolutions.values()].sort((left, right) => {
    const leftActive = !left.canceled && left.progress_t < 1 ? 1 : 0;
    const rightActive = !right.canceled && right.progress_t < 1 ? 1 : 0;
    if (leftActive !== rightActive) return leftActive - rightActive;
    return left.start_time_ms - right.start_time_ms;
  });

  while (world.evolutions.size > MAX_WORLD_EVOLUTIONS && candidates.length > 0) {
    const next = candidates.shift();
    if (!next) break;
    world.evolutions.delete(next.id);
  }
}

function enforceEntityBudget(world: World) {
  if (world.entities.size <= MAX_WORLD_ENTITIES) return;

  const protectedTargets = new Set<string>();
  for (const evolution of world.evolutions.values()) {
    if (!evolution.canceled && evolution.target.kind === "entity" && evolution.progress_t < 1) {
      protectedTargets.add(evolution.target.entity_id);
    }
  }

  const candidates = [...world.entities.values()].sort((left, right) => {
    const leftProtected = protectedTargets.has(left.id) ? 1 : 0;
    const rightProtected = protectedTargets.has(right.id) ? 1 : 0;
    if (leftProtected !== rightProtected) return leftProtected - rightProtected;

    const leftUrgency =
      (left.lifecycle_stage === "seed" || left.lifecycle_stage === "unstable" ? 1 : 0) +
      (left.visible_hint ? 1 : 0);
    const rightUrgency =
      (right.lifecycle_stage === "seed" || right.lifecycle_stage === "unstable" ? 1 : 0) +
      (right.visible_hint ? 1 : 0);
    if (leftUrgency !== rightUrgency) return leftUrgency - rightUrgency;

    if (left.updated_at_ms !== right.updated_at_ms) return left.updated_at_ms - right.updated_at_ms;
    return left.scale - right.scale;
  });

  while (world.entities.size > MAX_WORLD_ENTITIES && candidates.length > 0) {
    const next = candidates.shift();
    if (!next) break;
    deleteEntityAndTargetedEvolutions(world, next.id);
  }
}

function neighborCells(world: World, cell: TerrainCell, radius = 1) {
  const cells: TerrainCell[] = [];
  for (let row = cell.row - radius; row <= cell.row + radius; row++) {
    for (let column = cell.column - radius; column <= cell.column + radius; column++) {
      const next = world.terrain.get(terrainCellId(column, row));
      if (next) cells.push(next);
    }
  }
  return cells;
}

function ecologyGuildForArchetype(archetype: EntityArchetype): SpeciesGuild {
  switch (archetype) {
    case "flora":
      return "plant";
    case "fauna":
      return "animal";
    case "ambient":
      return "fungal";
    case "rock":
    case "structure":
      return "terrain";
  }
}

function focusForTerrain(terrain: TerrainType, guild: SpeciesGuild, seed: number): SpeciesFocus {
  if (guild === "plant") {
    if (terrain === "marsh") return "marsh_filter";
    if (terrain === "reef") return "reef_bloom";
    if (terrain === "basalt") return "basalt_spine";
    if (terrain === "dune") return seededUnit(seed + 7) > 0.45 ? "sun_spire" : "canopy_duelist";
    return seededUnit(seed + 11) > 0.55 ? "sun_spire" : "canopy_duelist";
  }
  if (guild === "animal") {
    if (terrain === "marsh") return "burrow_clan";
    if (terrain === "reef") return "reef_skimmer";
    if (terrain === "basalt") return "ridge_pack";
    if (terrain === "dune") return "territory_stalker";
    return seededUnit(seed + 13) > 0.5 ? "territory_stalker" : "ridge_pack";
  }
  return "terrain_plate";
}

function paletteForFocus(focus: SpeciesFocus, terrain: TerrainType) {
  switch (focus) {
    case "sun_spire":
      return ["#225e37", "#7bcf5e", "#d8ff8e"];
    case "canopy_duelist":
      return ["#173f2d", "#3da96f", "#8df8b7"];
    case "marsh_filter":
      return ["#1b3f35", "#5fc490", "#c7ffd5"];
    case "basalt_spine":
      return ["#332c29", "#6d7443", "#c8e368"];
    case "reef_bloom":
      return ["#1f3a50", "#2aa8a5", "#85ffe1"];
    case "territory_stalker":
      return terrain === "dune" ? ["#4b2f19", "#d07a36", "#ffd38e"] : ["#1d2c4f", "#4b82ff", "#9dd8ff"];
    case "burrow_clan":
      return ["#3f2d20", "#a77d5a", "#f3d6b1"];
    case "ridge_pack":
      return ["#2e2b34", "#8a667a", "#ffd19b"];
    case "reef_skimmer":
      return ["#182d55", "#3d9cff", "#baf4ff"];
    case "terrain_plate":
      return terrain === "basalt" ? ["#1d1b22", "#4a444f", "#92856f"] : ["#36342e", "#7f6d53", "#d7c697"];
  }
}

function sequenceProfile(seed: number, count: number, min: number, max: number) {
  return Array.from({ length: count }, (_, index) => Number(seededRange(seed + index * 17, min, max).toFixed(3)));
}

function buildGeometryAsset(generator: GeometryGenerator, seed: number, focus: SpeciesFocus): GeometryAsset {
  const profile = sequenceProfile(seed + 3, 7, 0.12, 1);
  const flareBias = focus === "sun_spire" || focus === "reef_bloom" ? 1.1 : focus === "territory_stalker" ? 0.75 : 0.92;
  return {
    asset_id: `geo_${generator}_${seed.toString(36)}`,
    generator,
    profile,
    radial_segments: Math.round(seededRange(seed + 5, 8, 16)),
    rings: Math.round(seededRange(seed + 7, 8, 15)),
    twist: Number(seededRange(seed + 11, -1.4, 1.4).toFixed(3)),
    flare: Number((seededRange(seed + 13, 0.25, 1.15) * flareBias).toFixed(3)),
    asymmetry: Number(seededRange(seed + 17, 0.04, 0.8).toFixed(3)),
    canopy: Number(seededRange(seed + 19, 0.1, 1.3).toFixed(3)),
  };
}

function buildTextureAsset(generator: TextureGenerator, palette: readonly string[], seed: number): TextureAsset {
  return {
    asset_id: `tex_${generator}_${seed.toString(36)}`,
    generator,
    palette,
    bands: Math.round(seededRange(seed + 23, 3, 11)),
    spots: Math.round(seededRange(seed + 29, 4, 18)),
    grain: Number(seededRange(seed + 31, 0.06, 0.94).toFixed(3)),
    contrast: Number(seededRange(seed + 37, 0.18, 0.96).toFixed(3)),
    emissive_bias: Number(seededRange(seed + 41, 0.1, 1).toFixed(3)),
  };
}

function buildSpeciesBlueprint(
  archetype: EntityArchetype,
  terrain: TerrainType,
  seedKey: string,
  focus = focusForTerrain(terrain, ecologyGuildForArchetype(archetype), hashString(seedKey)),
): SpeciesBlueprint {
  const seed = hashString(`${archetype}:${terrain}:${seedKey}:${focus}`);
  const guild = ecologyGuildForArchetype(archetype);

  const generator: GeometryGenerator =
    focus === "sun_spire"
      ? "canopy"
      : focus === "canopy_duelist"
        ? "crest"
        : focus === "marsh_filter"
          ? "plate"
          : focus === "basalt_spine"
            ? "spine"
            : focus === "reef_bloom"
              ? "canopy"
              : focus === "territory_stalker"
                ? "crest"
                : focus === "burrow_clan"
                  ? "shell"
                  : focus === "reef_skimmer"
                    ? "shell"
                    : "plate";

  const texture: TextureGenerator =
    focus === "sun_spire"
      ? "veins"
      : focus === "canopy_duelist"
        ? "territory"
        : focus === "marsh_filter"
          ? "strata"
          : focus === "basalt_spine"
            ? "bands"
            : focus === "reef_bloom"
              ? "spots"
              : focus === "territory_stalker"
                ? "territory"
                : focus === "burrow_clan"
                  ? "bands"
                  : focus === "reef_skimmer"
                    ? "spots"
                    : "strata";

  const pattern: BehaviorPattern =
    focus === "sun_spire"
      ? "heliotrope"
      : focus === "canopy_duelist"
        ? "canopy_wrestle"
        : focus === "marsh_filter"
          ? "heliotrope"
          : focus === "basalt_spine"
            ? "ridge_runner"
            : focus === "reef_bloom"
              ? "canopy_wrestle"
              : focus === "territory_stalker"
                ? "territorial_pack"
                : focus === "burrow_clan"
                  ? "burrower"
                  : focus === "reef_skimmer"
                    ? "ridge_runner"
                    : "ridge_runner";

  const palette = paletteForFocus(focus, terrain);
  const lineagePrefix = pickSeeded(TERRAIN_LABELS[terrain], seed + 43);
  const lineageSuffix =
    guild === "plant"
      ? pickSeeded(PLANT_LABELS, seed + 47)
      : guild === "animal"
        ? pickSeeded(ANIMAL_LABELS, seed + 53)
        : pickSeeded(TERRAIN_LABELS_SUFFIX, seed + 59);

  return {
    species_id: `species_${guild}_${focus}_${seed.toString(36)}`,
    lineage: `${lineagePrefix}-${focus}`,
    label: `${lineagePrefix} ${lineageSuffix}`,
    geometry: buildGeometryAsset(generator, seed, focus),
    texture: buildTextureAsset(texture, palette, seed),
    behavior: {
      asset_id: `beh_${pattern}_${seed.toString(36)}`,
      pattern,
      tempo: Number(seededRange(seed + 61, guild === "animal" ? 0.6 : 0.28, guild === "animal" ? 1.4 : 0.92).toFixed(3)),
      reach: Number(seededRange(seed + 67, guild === "animal" ? 0.9 : 0.2, guild === "animal" ? 2.3 : 1.2).toFixed(3)),
      aggression: Number(seededRange(seed + 71, guild === "animal" ? 0.35 : 0.08, guild === "animal" ? 0.98 : 0.55).toFixed(3)),
      cohesion: Number(seededRange(seed + 73, 0.12, 0.92).toFixed(3)),
      adaptability: Number(seededRange(seed + 79, 0.28, 0.98).toFixed(3)),
    },
    ecology: {
      guild,
      sunlight_demand: Number(seededRange(seed + 83, guild === "plant" ? 0.58 : 0.22, guild === "plant" ? 0.98 : 0.58).toFixed(3)),
      shade_cast: Number(seededRange(seed + 89, guild === "plant" ? 0.34 : 0.08, guild === "plant" ? 0.94 : 0.34).toFixed(3)),
      territory_radius: Number(seededRange(seed + 97, guild === "animal" ? 4.2 : 1.4, guild === "animal" ? 11.5 : 4.6).toFixed(3)),
      terrain_affinity: terrain,
      mobility: Number(seededRange(seed + 101, guild === "animal" ? 0.45 : 0.04, guild === "animal" ? 1 : 0.26).toFixed(3)),
      resilience: Number(seededRange(seed + 103, 0.28, 0.95).toFixed(3)),
    },
    reasoning: [
      `focus=${focus}`,
      `terrain_affinity=${terrain}`,
      guild === "plant"
        ? "Competes for light by changing canopy silhouette and shade cast."
        : guild === "animal"
          ? "Competes for territory by changing locomotion, range, and aggression."
          : "Anchors a changing terrain morphology for the local biome.",
    ],
  };
}

function shapeKindForGenerator(generator: GeometryGenerator): EntityShapeKind {
  switch (generator) {
    case "canopy":
      return "frond";
    case "spine":
      return "crystal";
    case "crest":
      return "fan";
    case "shell":
      return "orb";
    case "plate":
      return "pod";
  }
}

function behaviorModeForPattern(pattern: BehaviorPattern): EntityBehaviorMode {
  switch (pattern) {
    case "heliotrope":
      return "pulse";
    case "canopy_wrestle":
      return "orbit";
    case "territorial_pack":
      return "glide";
    case "burrower":
      return "wander";
    case "ridge_runner":
      return "glide";
  }
}

function shaderStyleForTexture(generator: TextureGenerator): EntityShaderStyle {
  switch (generator) {
    case "veins":
      return "biolume";
    case "bands":
      return "ember";
    case "spots":
      return "electric";
    case "strata":
      return "glass";
    case "territory":
      return "caustic";
  }
}

function shapeProfileForSpecies(species: SpeciesBlueprint): EntityShapeProfile {
  return {
    kind: shapeKindForGenerator(species.geometry.generator),
    stretch: Number((0.68 + species.geometry.canopy * 0.62 + Math.abs(species.geometry.twist) * 0.16).toFixed(3)),
    taper: Number((0.16 + species.geometry.flare * 0.44).toFixed(3)),
    wobble: Number((0.04 + species.behavior.tempo * 0.18 + species.geometry.asymmetry * 0.2).toFixed(3)),
    ridges: Math.max(4, Math.round(species.geometry.radial_segments * 0.75 + species.texture.bands * 0.25)),
  };
}

function behaviorProfileForSpecies(species: SpeciesBlueprint): EntityBehaviorProfile {
  return {
    mode: behaviorModeForPattern(species.behavior.pattern),
    amplitude: Number((0.06 + species.behavior.reach * 0.48).toFixed(3)),
    frequency: Number((0.24 + species.behavior.tempo * 0.82).toFixed(3)),
    phase: Number((seededRange(hashString(species.species_id) + 3, 0, Math.PI * 2)).toFixed(3)),
    drift: Number((species.ecology.mobility * 0.62 + species.behavior.aggression * 0.14).toFixed(3)),
  };
}

function shaderProfileForSpecies(species: SpeciesBlueprint): EntityShaderProfile {
  return {
    style: shaderStyleForTexture(species.texture.generator),
    hue_shift: Number((species.texture.emissive_bias * 0.22 - species.texture.contrast * 0.08).toFixed(3)),
    pulse: Number((0.12 + species.behavior.tempo * 0.45 + species.texture.emissive_bias * 0.25).toFixed(3)),
    distortion: Number((0.02 + species.geometry.asymmetry * 0.18 + Math.abs(species.geometry.twist) * 0.08).toFixed(3)),
    fresnel: Number((1.08 + species.texture.contrast * 0.9).toFixed(3)),
  };
}

function scaleForSpecies(species: SpeciesBlueprint, archetype: EntityArchetype) {
  const base =
    archetype === "flora"
      ? 0.54 + species.geometry.canopy * 0.28
      : archetype === "fauna"
        ? 0.62 + species.behavior.reach * 0.18
        : 0.8 + species.geometry.flare * 0.14;
  return Number(base.toFixed(3));
}

function buildEntity(
  world: World,
  id: string,
  archetype: EntityArchetype,
  position: readonly [number, number, number],
  nowMs: number,
  evolutionId: string,
  species?: SpeciesBlueprint,
): WorldEntity {
  const terrain = terrainCellForPosition(world, position[0], position[2]);
  const resolvedSpecies = species ?? buildSpeciesBlueprint(archetype, terrain.terrain_type, `${id}:${terrain.id}`);
  return {
    id: asId(id),
    archetype,
    provenance: {
      creator_agent_id: asId("agent_biome"),
      creator_model_id: asId("model_ollama_default"),
      originating_evolution_id: asId(evolutionId),
    },
    chunk_id: chunkId(position[0], position[2]),
    anchor_position: position,
    position,
    rotationY: seededRange(hashString(id), 0, Math.PI * 2),
    scale: scaleForSpecies(resolvedSpecies, archetype),
    species: resolvedSpecies,
    shape_profile: shapeProfileForSpecies(resolvedSpecies),
    behavior_profile: behaviorProfileForSpecies(resolvedSpecies),
    shader_profile: shaderProfileForSpecies(resolvedSpecies),
    lifecycle_stage: "active",
    lifecycle_t: seededRange(hashString(`${id}:life`), 0, 1),
    visible_hint: true,
    created_at_ms: nowMs,
    updated_at_ms: nowMs,
  };
}

function alignProfilesToSpecies(entity: WorldEntity, strength: number) {
  const targetShape = shapeProfileForSpecies(entity.species);
  const targetBehavior = behaviorProfileForSpecies(entity.species);
  const targetShader = shaderProfileForSpecies(entity.species);

  entity.shape_profile = {
    kind: strength > 0.44 ? targetShape.kind : entity.shape_profile.kind,
    stretch: lerp(entity.shape_profile.stretch, targetShape.stretch, strength),
    taper: lerp(entity.shape_profile.taper, targetShape.taper, strength),
    wobble: lerp(entity.shape_profile.wobble, targetShape.wobble, strength),
    ridges: Math.round(lerp(entity.shape_profile.ridges, targetShape.ridges, strength)),
  };
  entity.behavior_profile = {
    mode: strength > 0.36 ? targetBehavior.mode : entity.behavior_profile.mode,
    amplitude: lerp(entity.behavior_profile.amplitude, targetBehavior.amplitude, strength),
    frequency: lerp(entity.behavior_profile.frequency, targetBehavior.frequency, strength),
    phase: lerp(entity.behavior_profile.phase, targetBehavior.phase, strength),
    drift: lerp(entity.behavior_profile.drift, targetBehavior.drift, strength),
  };
  entity.shader_profile = {
    style: strength > 0.32 ? targetShader.style : entity.shader_profile.style,
    hue_shift: lerp(entity.shader_profile.hue_shift, targetShader.hue_shift, strength),
    pulse: lerp(entity.shader_profile.pulse, targetShader.pulse, strength),
    distortion: lerp(entity.shader_profile.distortion, targetShader.distortion, strength),
    fresnel: lerp(entity.shader_profile.fresnel, targetShader.fresnel, strength),
  };
  entity.scale = lerp(entity.scale, scaleForSpecies(entity.species, entity.archetype), clamp(strength * 1.2, 0, 0.84));
}

function normalizeEntity(world: World, entity: WorldEntity) {
  const current = entity as WorldEntity &
    Partial<Pick<WorldEntity, "anchor_position" | "shape_profile" | "behavior_profile" | "shader_profile" | "species">>;
  current.anchor_position ??= entity.position;
  if (!current.species) {
    const terrain = terrainCellForPosition(world, entity.position[0], entity.position[2]);
    current.species = buildSpeciesBlueprint(entity.archetype, terrain.terrain_type, `${entity.id}:legacy`);
  }
  current.shape_profile = { ...shapeProfileForSpecies(current.species), ...current.shape_profile };
  current.behavior_profile = { ...behaviorProfileForSpecies(current.species), ...current.behavior_profile };
  current.shader_profile = { ...shaderProfileForSpecies(current.species), ...current.shader_profile };
  entity.chunk_id = chunkId(entity.position[0], entity.position[2]);
}

function hybridizeSpeciesBlueprint(
  current: SpeciesBlueprint,
  target: SpeciesBlueprint,
  progressT: number,
): SpeciesBlueprint {
  if (progressT <= 0.24) return current;
  if (progressT >= 0.62) return target;
  return {
    species_id: `hybrid_${current.species_id}_${target.species_id}_${Math.round(progressT * 100)}`,
    lineage: `${current.lineage}/${target.lineage}`,
    label: `${current.label.split(" ")[0]} ${target.label.split(" ").slice(-1)[0]}`,
    geometry: progressT >= 0.34 ? target.geometry : current.geometry,
    texture: progressT >= 0.46 ? target.texture : current.texture,
    behavior: progressT >= 0.52 ? target.behavior : current.behavior,
    ecology: {
      guild: target.ecology.guild,
      sunlight_demand: lerp(current.ecology.sunlight_demand, target.ecology.sunlight_demand, 0.55),
      shade_cast: lerp(current.ecology.shade_cast, target.ecology.shade_cast, 0.55),
      territory_radius: lerp(current.ecology.territory_radius, target.ecology.territory_radius, 0.55),
      terrain_affinity: progressT > 0.48 ? target.ecology.terrain_affinity : current.ecology.terrain_affinity,
      mobility: lerp(current.ecology.mobility, target.ecology.mobility, 0.55),
      resilience: lerp(current.ecology.resilience, target.ecology.resilience, 0.55),
    },
    reasoning: [
      ...(current.reasoning ?? []),
      "Bridge phase: geometry, texture, and behavior are crossing into a new lineage.",
      ...(target.reasoning ?? []),
    ].slice(-6),
  };
}

function evolutionSpeciesForProgress(entity: WorldEntity, expectedFinal: EvolutionExpectedFinal, progressT: number) {
  if (!expectedFinal.species_blueprint) return entity.species;
  if (progressT > 0.24 && progressT < 0.62 && entity.species.species_id.startsWith("hybrid_")) {
    return entity.species;
  }
  return hybridizeSpeciesBlueprint(entity.species, expectedFinal.species_blueprint, progressT);
}

function resolveShapeKind(current: EntityShapeKind, finalProfile?: EvolutionExpectedFinal["shape_profile"], progressT = 0) {
  if (!finalProfile?.kind) return current;
  return progressT < 0.28 ? current : finalProfile.kind;
}

function resolveBehaviorMode(current: EntityBehaviorMode, finalProfile?: EvolutionExpectedFinal["behavior_profile"], progressT = 0) {
  if (!finalProfile?.mode) return current;
  return progressT < 0.24 ? current : finalProfile.mode;
}

function resolveShaderStyle(current: EntityShaderStyle, finalProfile?: EvolutionExpectedFinal["shader_profile"], progressT = 0) {
  if (!finalProfile?.style) return current;
  return progressT < 0.18 ? current : finalProfile.style;
}

function computeEcologyMetrics(world: World, entity: WorldEntity, allEntities: readonly WorldEntity[]) {
  const terrain = terrainCellForPosition(world, entity.anchor_position[0], entity.anchor_position[2]);
  const candidates = neighborCells(world, terrain, 1);
  let shadePressure = 0;
  let territoryPressure = 0;
  let crowding = 0;
  let rivalCount = 0;
  let alliedCount = 0;
  let rivalX = 0;
  let rivalZ = 0;

  for (const other of allEntities) {
    if (other.id === entity.id || other.lifecycle_stage === "dead") continue;
    const distance = horizontalDistance(entity.anchor_position, other.anchor_position);
    if (distance > Math.max(entity.species.ecology.territory_radius, other.species.ecology.territory_radius) + 8) continue;

    const sameGuild = other.species.ecology.guild === entity.species.ecology.guild;
    const sameSpecies = other.species.species_id === entity.species.species_id;
    const influence = 1 / Math.max(1.5, distance);

    crowding += influence;
    if (sameGuild && !sameSpecies) {
      rivalCount += 1;
      rivalX += (other.anchor_position[0] - entity.anchor_position[0]) * influence;
      rivalZ += (other.anchor_position[2] - entity.anchor_position[2]) * influence;
    } else if (sameSpecies) {
      alliedCount += 1;
    }

    if (entity.species.ecology.guild === "plant" && other.species.ecology.guild === "plant") {
      shadePressure += other.species.ecology.shade_cast * other.scale * influence;
    }
    if (entity.species.ecology.guild === "animal" && other.species.ecology.guild === "animal") {
      territoryPressure += other.species.behavior.aggression * other.scale * influence;
    }
  }

  const brightestNeighbor = candidates.reduce((best, cell) => (cell.sunlight > best.sunlight ? cell : best), terrain);
  const calmestNeighbor = candidates.reduce(
    (best, cell) =>
      cell.fertility + cell.moisture - Math.abs(cell.elevation - entity.scale * 0.2) >
      best.fertility + best.moisture - Math.abs(best.elevation - entity.scale * 0.2)
        ? cell
        : best,
    terrain,
  );
  const adaptationPressure =
    entity.species.ecology.terrain_affinity === terrain.terrain_type
      ? 0
      : 0.45 + Math.abs(terrain.moisture - terrain.fertility) * 0.35 + (1 - entity.species.ecology.resilience) * 0.25;

  return {
    terrain,
    sunAccess: clamp(terrain.sunlight - shadePressure * 0.28, 0.05, 1.45),
    shadePressure,
    territoryPressure,
    crowding,
    rivalCount,
    alliedCount,
    rivalVector: [rivalX, rivalZ],
    brightestNeighbor,
    calmestNeighbor,
    adaptationPressure,
  } satisfies EcologyMetrics;
}

function focusForMutation(entity: WorldEntity, metrics: EcologyMetrics): SpeciesFocus {
  if (entity.species.ecology.guild === "plant") {
    if (metrics.sunAccess < entity.species.ecology.sunlight_demand * 0.72) return "sun_spire";
    if (metrics.shadePressure > 0.65 || metrics.rivalCount > 2) return "canopy_duelist";
    if (metrics.terrain.terrain_type === "marsh") return "marsh_filter";
    if (metrics.terrain.terrain_type === "reef") return "reef_bloom";
    if (metrics.terrain.terrain_type === "basalt") return "basalt_spine";
    return "sun_spire";
  }
  if (entity.species.ecology.guild === "animal") {
    if (metrics.territoryPressure > 0.5 || metrics.rivalCount > 1) return "territory_stalker";
    if (metrics.terrain.terrain_type === "marsh") return "burrow_clan";
    if (metrics.terrain.terrain_type === "reef") return "reef_skimmer";
    if (metrics.terrain.terrain_type === "basalt") return "ridge_pack";
    return "ridge_pack";
  }
  return "terrain_plate";
}

function shouldMutateEntity(entity: WorldEntity, metrics: EcologyMetrics, nowMs: number) {
  const cadenceGate = Math.floor(nowMs / 850) % 5;
  const hashGate = hashString(`${entity.id}:${entity.species.species_id}`) % 5;
  if (cadenceGate !== hashGate) return false;

  if (entity.species.ecology.guild === "plant") {
    return metrics.sunAccess < entity.species.ecology.sunlight_demand * 0.82 || metrics.shadePressure > 0.75 || metrics.adaptationPressure > 0.42;
  }
  if (entity.species.ecology.guild === "animal") {
    return metrics.territoryPressure > 0.52 || metrics.rivalCount > 2 || metrics.adaptationPressure > 0.44;
  }
  return metrics.adaptationPressure > 0.5;
}

function mutateEntitySpecies(entity: WorldEntity, metrics: EcologyMetrics, nowMs: number) {
  const focus = focusForMutation(entity, metrics);
  const mutated = buildSpeciesBlueprint(
    entity.archetype,
    metrics.terrain.terrain_type,
    `${entity.id}:${focus}:${Math.floor(nowMs / 850)}`,
    focus,
  );
  entity.species = mutated;
  alignProfilesToSpecies(entity, 0.72);
  entity.lifecycle_stage = "unstable";
  entity.lifecycle_t = 0.22;
  entity.scale = Math.max(entity.scale, scaleForSpecies(mutated, entity.archetype));
}

function updateAnchorPosition(entity: WorldEntity, metrics: EcologyMetrics, nowMs: number) {
  const driftBase = entity.species.ecology.mobility * 0.34 + entity.behavior_profile.drift * 0.2;
  const seed = hashString(entity.id) + nowMs * 0.001;

  if (entity.species.ecology.guild === "plant") {
    const targetCell = metrics.sunAccess < entity.species.ecology.sunlight_demand ? metrics.brightestNeighbor : metrics.terrain;
    const dx = targetCell.x - entity.anchor_position[0] - metrics.rivalVector[0] * 0.35;
    const dz = targetCell.z - entity.anchor_position[2] - metrics.rivalVector[1] * 0.35;
    entity.anchor_position = [
      entity.anchor_position[0] + dx * 0.025 + oscillate(seed * 0.1, 0.08),
      targetCell.elevation * 1.9 + 0.2 + entity.scale * (0.16 + entity.species.geometry.canopy * 0.12),
      entity.anchor_position[2] + dz * 0.025 + oscillate(seed * 0.13, 0.08),
    ];
    return;
  }

  if (entity.species.ecology.guild === "animal") {
    const targetCell = metrics.territoryPressure > 0.45 || metrics.adaptationPressure > 0.4 ? metrics.calmestNeighbor : metrics.terrain;
    const fleeX = targetCell.x - entity.anchor_position[0] - metrics.rivalVector[0] * 0.7;
    const fleeZ = targetCell.z - entity.anchor_position[2] - metrics.rivalVector[1] * 0.7;
    entity.anchor_position = [
      entity.anchor_position[0] + fleeX * (0.03 + driftBase * 0.15),
      targetCell.elevation * 1.6 + 0.45,
      entity.anchor_position[2] + fleeZ * (0.03 + driftBase * 0.15),
    ];
    return;
  }

  entity.anchor_position = [
    entity.anchor_position[0],
    metrics.terrain.elevation * 1.4 + 0.2,
    entity.anchor_position[2],
  ];
}

function applyBehaviorMotion(entity: WorldEntity, metrics: EcologyMetrics, nowMs: number, driftStrength = 1) {
  const t = nowMs / 1000 + entity.behavior_profile.phase;
  const [ax, ay, az] = entity.anchor_position;
  const amplitude = entity.behavior_profile.amplitude * driftStrength;
  const frequency = entity.behavior_profile.frequency;
  const drift = entity.behavior_profile.drift * driftStrength;

  let x = ax;
  let y = ay;
  let z = az;

  switch (entity.species.behavior.pattern) {
    case "heliotrope":
      x = ax + Math.cos(t * frequency * 0.6 + entity.rotationY) * drift * 0.16;
      z = az + Math.sin(t * frequency * 0.5 + entity.rotationY) * drift * 0.16;
      y = ay + amplitude * 0.45 + Math.sin(t * frequency * 2.8) * amplitude * 0.18 + metrics.sunAccess * 0.1;
      break;
    case "canopy_wrestle":
      x = ax + Math.sin(t * frequency * 1.3) * amplitude * 0.24 - metrics.rivalVector[0] * 0.1;
      z = az + Math.cos(t * frequency * 1.1) * amplitude * 0.24 - metrics.rivalVector[1] * 0.1;
      y = ay + Math.sin(t * frequency * 2.6) * amplitude * 0.22 + metrics.shadePressure * 0.12;
      break;
    case "territorial_pack":
      x = ax + Math.cos(t * frequency * 1.8 + entity.rotationY) * amplitude * 0.9 - metrics.rivalVector[0] * 0.18;
      z = az + Math.sin(t * frequency * 1.6 + entity.rotationY) * amplitude * 0.9 - metrics.rivalVector[1] * 0.18;
      y = ay + Math.cos(t * frequency * 2.8) * amplitude * 0.16;
      break;
    case "burrower":
      x = ax + Math.sin(t * frequency * 1.9) * amplitude * 0.55;
      z = az + Math.cos(t * frequency * 1.7) * amplitude * 0.55;
      y = ay - Math.abs(Math.sin(t * frequency * 2.4)) * amplitude * 0.18 + Math.cos(t * frequency) * 0.05;
      break;
    case "ridge_runner":
      x = ax + Math.cos(t * frequency * 2.2 + entity.rotationY) * amplitude;
      z = az + Math.sin(t * frequency * 2.05 + entity.rotationY) * amplitude;
      y = ay + Math.sin(t * frequency * 4.4) * amplitude * 0.12 + metrics.terrain.elevation * 0.08;
      break;
  }

  entity.position = [x, y, z];
  entity.chunk_id = chunkId(x, z);
}

function applyEntityEvolution(entity: WorldEntity, evolution: Evolution, stageIdx: number, nowMs: number) {
  const stageName = evolution.stages[stageIdx]?.name ?? "active";
  const stageMap: Record<string, WorldEntity["lifecycle_stage"]> = {
    seed: "seed",
    sprout: "active",
    mature: "active",
    unstable: "unstable",
    decay: "decay",
  };

  entity.lifecycle_stage = stageMap[stageName] ?? "active";
  entity.lifecycle_t = evolution.progress_t;
  entity.species = evolutionSpeciesForProgress(entity, evolution.expected_final, evolution.progress_t);
  alignProfilesToSpecies(entity, clamp(0.18 + evolution.progress_t * 0.56, 0.12, 0.84));

  entity.shape_profile = {
    kind: resolveShapeKind(entity.shape_profile.kind, evolution.expected_final.shape_profile, evolution.progress_t),
    stretch: lerp(entity.shape_profile.stretch, evolution.expected_final.shape_profile?.stretch ?? entity.shape_profile.stretch, 0.32),
    taper: lerp(entity.shape_profile.taper, evolution.expected_final.shape_profile?.taper ?? entity.shape_profile.taper, 0.32),
    wobble: lerp(entity.shape_profile.wobble, evolution.expected_final.shape_profile?.wobble ?? entity.shape_profile.wobble, 0.32),
    ridges: Math.round(
      lerp(entity.shape_profile.ridges, evolution.expected_final.shape_profile?.ridges ?? entity.shape_profile.ridges, 0.32),
    ),
  };
  entity.behavior_profile = {
    mode: resolveBehaviorMode(entity.behavior_profile.mode, evolution.expected_final.behavior_profile, evolution.progress_t),
    amplitude: lerp(entity.behavior_profile.amplitude, evolution.expected_final.behavior_profile?.amplitude ?? entity.behavior_profile.amplitude, 0.28),
    frequency: lerp(entity.behavior_profile.frequency, evolution.expected_final.behavior_profile?.frequency ?? entity.behavior_profile.frequency, 0.28),
    phase: lerp(entity.behavior_profile.phase, evolution.expected_final.behavior_profile?.phase ?? entity.behavior_profile.phase, 0.28),
    drift: lerp(entity.behavior_profile.drift, evolution.expected_final.behavior_profile?.drift ?? entity.behavior_profile.drift, 0.28),
  };
  entity.shader_profile = {
    style: resolveShaderStyle(entity.shader_profile.style, evolution.expected_final.shader_profile, evolution.progress_t),
    hue_shift: lerp(entity.shader_profile.hue_shift, evolution.expected_final.shader_profile?.hue_shift ?? entity.shader_profile.hue_shift, 0.28),
    pulse: lerp(entity.shader_profile.pulse, evolution.expected_final.shader_profile?.pulse ?? entity.shader_profile.pulse, 0.28),
    distortion: lerp(
      entity.shader_profile.distortion,
      evolution.expected_final.shader_profile?.distortion ?? entity.shader_profile.distortion,
      0.28,
    ),
    fresnel: lerp(entity.shader_profile.fresnel, evolution.expected_final.shader_profile?.fresnel ?? entity.shader_profile.fresnel, 0.28),
  };
  entity.scale = lerp(entity.scale, evolution.expected_final.scale ?? scaleForSpecies(entity.species, entity.archetype), 0.3);
  entity.updated_at_ms = nowMs;
}

function updateTerrain(world: World, allEntities: readonly WorldEntity[], nowMs: number) {
  for (const cell of world.terrain.values()) {
    const nearby = allEntities.filter((entity) => horizontalDistance(entity.position, [cell.x, 0, cell.z]) <= TERRAIN_CELL_SIZE * 1.3);
    const flora = nearby.filter((entity) => entity.species.ecology.guild === "plant");
    const fauna = nearby.filter((entity) => entity.species.ecology.guild === "animal");

    const shade = flora.reduce((sum, entity) => sum + entity.species.ecology.shade_cast * entity.scale, 0);
    const burrowPressure = fauna.reduce(
      (sum, entity) =>
        sum +
        (entity.species.behavior.pattern === "burrower" ? entity.species.behavior.aggression * 0.16 : 0) +
        entity.species.ecology.mobility * 0.05,
      0,
    );
    const fertilityGain = flora.reduce((sum, entity) => sum + entity.species.ecology.resilience * 0.02, 0);
    const seasonal = Math.sin(nowMs / 6000 + cell.column * 0.35 + cell.row * 0.21) * 0.05;

    cell.sunlight = clamp(0.48 + cell.elevation * 0.44 - shade * 0.09 + seasonal, 0.05, 1.45);
    cell.moisture = clamp(cell.moisture + flora.length * 0.0028 - fauna.length * 0.0014 + seasonal * 0.5, 0.04, 0.98);
    cell.fertility = clamp(cell.fertility + fertilityGain - burrowPressure * 0.02 + shade * 0.01, 0.04, 0.98);
    cell.elevation = clamp(cell.elevation + shade * 0.002 - burrowPressure * 0.006 + seasonal * 0.3, 0.02, 0.98);
    cell.terrain_type = terrainTypeFromSignal(cell.elevation, cell.moisture, cell.fertility);

    const dominant = nearby.reduce<{ speciesId?: string; score: number }>(
      (best, entity) => {
        const score = entity.scale * (entity.species.ecology.guild === "plant" ? 1.2 : 1);
        return score > best.score ? { speciesId: entity.species.species_id, score } : best;
      },
      { score: 0 },
    );
    cell.dominant_species_id = dominant.speciesId;
    cell.updated_at_ms = nowMs;
  }
}

export function createInitialWorld(): World {
  const now = Date.now();
  const terrain = createTerrainGrid(now);
  const world: World = {
    now_ms: now,
    entities: new Map<string, WorldEntity>(),
    evolutions: new Map<string, Evolution>(),
    agents: new Map<string, AgentProfile>(),
    terrain,
    last_effect_ms: 0,
  };

  world.agents.set("agent_biome", {
    id: asId("agent_biome"),
    role: "biome_builder",
    rules: ["Breed visible species races that fight for light, territory, and terrain adaptation."],
    skills: ["species_blueprints", "terrain_feedback", "history_cache"],
    assigned_model_id: asId("model_ollama_default"),
    mutation_rate: 0.42,
    influence_weights: { exuberance: 1, ecology: 1 },
    memory: [],
  });
  world.agents.set("agent_meta", {
    id: asId("agent_meta"),
    role: "meta_agent",
    rules: ["Accelerate evolutions when the biome becomes visually static."],
    skills: ["agent_mutation", "timeline_replay"],
    assigned_model_id: asId("model_ollama_default"),
    mutation_rate: 0.28,
    influence_weights: { tempo: 1, contrast: 1 },
    memory: [],
  });

  const cells = [...terrain.values()];
  let entityIndex = 0;

  for (let i = 0; i < 44; i++) {
    const cell = cells[(i * 7) % cells.length];
    const jitterX = oscillate(i * 1.7, 2.2);
    const jitterZ = oscillate(i * 1.9, 2.2);
    const species = buildSpeciesBlueprint("flora", cell.terrain_type, `flora:${i}`, focusForTerrain(cell.terrain_type, "plant", i));
    const position: readonly [number, number, number] = [cell.x + jitterX, cell.elevation * 1.8 + 0.25, cell.z + jitterZ];
    const entity = buildEntity(world, `entity_flora_${entityIndex++}`, "flora", position, now, "evo_bootstrap", species);
    entity.behavior_profile.phase = i * 0.11;
    world.entities.set(entity.id, entity);
  }

  for (let i = 0; i < 26; i++) {
    const cell = cells[(i * 11 + 9) % cells.length];
    const jitterX = oscillate(i * 2.1, 3.4);
    const jitterZ = oscillate(i * 2.3, 3.4);
    const species = buildSpeciesBlueprint("fauna", cell.terrain_type, `fauna:${i}`, focusForTerrain(cell.terrain_type, "animal", i));
    const position: readonly [number, number, number] = [cell.x + jitterX, cell.elevation * 1.7 + 0.55, cell.z + jitterZ];
    const entity = buildEntity(world, `entity_fauna_${entityIndex++}`, "fauna", position, now, "evo_bootstrap", species);
    entity.behavior_profile.phase = i * 0.17;
    world.entities.set(entity.id, entity);
  }

  world.evolutions.set("evo_bootstrap", {
    id: asId("evo_bootstrap"),
    source_agent_id: asId("agent_biome"),
    source_model_id: asId("model_ollama_default"),
    intent: "Bootstrap a living ecosystem with competing plants, animals, and mutable terrain.",
    start_time_ms: now,
    duration_ms: 90_000,
    stages: [
      { name: "seed", duration_ms: 8_000 },
      { name: "sprout", duration_ms: 36_000 },
      { name: "mature", duration_ms: 46_000 },
    ],
    progress_t: 0,
    canceled: false,
    target: { kind: "chunk", chunk_id: "0:0" },
    expected_final: { stable: true },
    history: [],
  });

  updateTerrain(world, [...world.entities.values()], now);
  return world;
}

export function applyWorldPatchEnvelope(world: World, env: WorldPatchEnvelope) {
  const patch = env.patch as WorldPatch;
  applyPatchToAgents(world.agents, patch);
  applyPatchToEvolutions(world.evolutions, patch);
  applyPatchToEntities(world.entities, patch, env.created_at_ms);

  if (patch.kind === "entity.create") {
    const entity = world.entities.get(patch.entity.id);
    if (entity) normalizeEntity(world, entity);
  }
  if (patch.kind === "entity.update") {
    const entity = world.entities.get(patch.entity_id);
    if (entity) normalizeEntity(world, entity);
  }

  enforceEvolutionBudget(world);
  enforceEntityBudget(world);
}

export function stepWorld(world: World, nowMs: number) {
  world.now_ms = nowMs;

  enforceEvolutionBudget(world);
  enforceEntityBudget(world);

  const effectCadenceMs = effectCadenceForEntityCount(world.entities.size);
  if (nowMs - world.last_effect_ms < effectCadenceMs) return;
  world.last_effect_ms = nowMs;

  const entityList = [...world.entities.values()];
  for (const entity of entityList) {
    normalizeEntity(world, entity);
  }

  const activeEntityEvolutions = new Map<string, Evolution>();
  for (const [id, evo] of world.evolutions) {
    const next = advanceEvolution(nowMs, evo);
    if (next.progress_t >= 1 && nowMs - next.start_time_ms > next.duration_ms + 20_000) {
      world.evolutions.delete(id);
      continue;
    }
    world.evolutions.set(id, next);
    if (!next.canceled && next.target.kind === "entity") {
      activeEntityEvolutions.set(next.target.entity_id, next);
    }
  }

  for (const entity of entityList) {
    const metrics = computeEcologyMetrics(world, entity, entityList);
    const evolution = activeEntityEvolutions.get(entity.id);

    updateAnchorPosition(entity, metrics, nowMs);

    if (evolution) {
      applyEntityEvolution(entity, evolution, stageIndexForEvolution(evolution), nowMs);
    } else if (shouldMutateEntity(entity, metrics, nowMs)) {
      mutateEntitySpecies(entity, metrics, nowMs);
    } else {
      alignProfilesToSpecies(entity, 0.14);
      entity.lifecycle_stage = entity.lifecycle_stage === "unstable" ? "active" : entity.lifecycle_stage;
      entity.lifecycle_t = (entity.lifecycle_t + 0.018 + entity.species.behavior.tempo * 0.01) % 1;
    }

    applyBehaviorMotion(entity, metrics, nowMs, 1 + entity.species.behavior.adaptability * 0.24);
    entity.updated_at_ms = nowMs;
  }

  updateTerrain(world, entityList, nowMs);
  enforceEvolutionBudget(world);
  enforceEntityBudget(world);
}
