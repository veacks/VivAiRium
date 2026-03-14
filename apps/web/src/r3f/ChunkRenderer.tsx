import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useWorldStore } from "../state/worldStore";
import type { GeometryAsset, TerrainCell, WorldEntity } from "@aquarium/shared/domain";
import * as THREE from "three";

const TERRAIN_CELL_SIZE = 10;
const MAX_RENDERED_ENTITIES = 96;
const MAX_VISIBLE_VERTEX_BUDGET = 90_000;
const MAX_RENDERED_TERRAIN_TILES = 81;
const MAX_TERRAIN_RENDER_DISTANCE = 88;
const MAX_ENTITY_RENDER_DISTANCE = 92;
const GEOMETRY_CACHE_LIMIT = 320;
const TEXTURE_CACHE_LIMIT = 220;
const TERRAIN_GEOMETRY_CACHE_LIMIT = 220;

type RenderDetail = "high" | "medium" | "low";
type RenderedEntityPlan = {
  entity: WorldEntity;
  detail: RenderDetail;
  estimatedVertices: number;
};

const geometryCache = new Map<string, THREE.BufferGeometry>();
const textureCache = new Map<string, THREE.CanvasTexture>();
const terrainGeometryCache = new Map<string, THREE.BufferGeometry>();

const ENTITY_VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  varying vec3 vNormalDir;
  varying float vWave;
  varying vec2 vUvCoord;

  uniform float uTime;
  uniform float uDistortion;
  uniform float uWobble;
  uniform float uLifecycle;

  void main() {
    vec3 transformed = position;
    float wave = sin(uTime * (1.1 + uWobble * 4.0) + position.y * 4.6 + position.x * 2.0);
    transformed += normal * wave * uDistortion * (0.25 + uLifecycle * 0.7);
    transformed.x += sin(uTime * 0.8 + position.y * 3.5) * uWobble * 0.12;
    transformed.z += cos(uTime * 0.9 + position.x * 3.4) * uWobble * 0.12;

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormalDir = normalize(normalMatrix * normal);
    vWave = wave;
    vUvCoord = uv;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const ENTITY_FRAGMENT_SHADER = `
  varying vec3 vWorldPosition;
  varying vec3 vNormalDir;
  varying float vWave;
  varying vec2 vUvCoord;

  uniform vec3 uBaseColor;
  uniform vec3 uAccentColor;
  uniform sampler2D uPatternTexture;
  uniform float uTime;
  uniform float uPulse;
  uniform float uFresnel;
  uniform float uLifecycle;
  uniform float uTextureContrast;
  uniform float uEmissiveBias;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormalDir)), 0.0), uFresnel);
    vec2 uv = fract(vUvCoord * vec2(1.2 + uTextureContrast * 1.4, 1.0 + uTextureContrast * 0.9) + vec2(uTime * 0.015, 0.0));
    vec3 textureSample = texture2D(uPatternTexture, uv).rgb;
    float pulseBand = 0.5 + 0.5 * sin(uTime * (1.5 + uPulse * 3.0) + vWorldPosition.y * 5.6 + vWave * 2.1);
    float lifecycleGlow = smoothstep(0.0, 0.18, uLifecycle) * (1.0 - smoothstep(0.92, 1.0, uLifecycle) * 0.18);
    float glowMix = clamp(pulseBand * (0.26 + uPulse * 0.82) + fresnel * 0.65 + lifecycleGlow * 0.28 + uEmissiveBias * 0.18, 0.0, 1.0);
    vec3 patternColor = mix(uBaseColor, textureSample, clamp(0.35 + uTextureContrast * 0.5, 0.0, 1.0));
    vec3 color = mix(patternColor, uAccentColor, glowMix);
    float alpha = 0.92 + fresnel * 0.05;

    gl_FragColor = vec4(color, alpha);
  }
`;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function sampleProfile(profile: readonly number[], t: number) {
  if (profile.length === 0) return 0.5;
  const scaled = t * (profile.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(profile.length - 1, index + 1);
  const localT = scaled - index;
  return THREE.MathUtils.lerp(profile[index] ?? 0.5, profile[nextIndex] ?? 0.5, localT);
}

function detailFactor(detail: RenderDetail) {
  switch (detail) {
    case "high":
      return 1;
    case "medium":
      return 0.62;
    case "low":
      return 0.38;
  }
}

function detailForDistance(distance: number): RenderDetail {
  if (distance < 26) return "high";
  if (distance < 54) return "medium";
  return "low";
}

function degradeDetail(detail: RenderDetail): RenderDetail | null {
  if (detail === "high") return "medium";
  if (detail === "medium") return "low";
  return null;
}

function geometryResolution(asset: GeometryAsset, detail: RenderDetail) {
  const factor = detailFactor(detail);
  return {
    radialSegments: clamp(Math.round(asset.radial_segments * factor), detail === "low" ? 5 : 6, detail === "high" ? 24 : 16),
    rings: clamp(Math.round(asset.rings * factor), detail === "low" ? 5 : 6, detail === "high" ? 22 : 14),
  };
}

function estimateGeometryVertices(asset: GeometryAsset, detail: RenderDetail) {
  const resolution = geometryResolution(asset, detail);
  return (resolution.radialSegments + 1) * (resolution.rings + 1);
}

function distanceSqToPoint(x: number, y: number, z: number, point: readonly [number, number, number]) {
  const dx = x - point[0];
  const dy = y - point[1];
  const dz = z - point[2];
  return dx * dx + dy * dy + dz * dz;
}

function touchCacheEntry<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key);
  cache.set(key, value);
}

function trimCache<T extends THREE.BufferGeometry | THREE.Texture>(cache: Map<string, T>, limit: number) {
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    const next = cache.get(oldestKey);
    if (next && "dispose" in next) next.dispose();
    cache.delete(oldestKey);
  }
}

function createSpeciesGeometry(asset: GeometryAsset, entity: WorldEntity, detail: RenderDetail) {
  const cacheKey = [
    asset.asset_id,
    detail,
    entity.shape_profile.kind,
    entity.shape_profile.stretch.toFixed(1),
    entity.shape_profile.taper.toFixed(1),
    entity.shape_profile.wobble.toFixed(1),
    entity.shape_profile.ridges,
  ].join(":");

  const cached = geometryCache.get(cacheKey);
  if (cached) {
    touchCacheEntry(geometryCache, cacheKey, cached);
    return cached;
  }

  const resolution = geometryResolution(asset, detail);
  const radialSegments = resolution.radialSegments;
  const rings = resolution.rings;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ringIndex = 0; ringIndex <= rings; ringIndex++) {
    const v = ringIndex / rings;
    const baseRadius = sampleProfile(asset.profile, v);
    const ridgeBias = Math.max(3, entity.shape_profile.ridges);
    const stemScale = 0.2 + entity.shape_profile.stretch * 0.22;
    let ringRadius = 0.14 + baseRadius * (0.28 + asset.flare * 0.22);
    let centerX = 0;
    let centerZ = 0;
    let height = (v - 0.5) * (1.35 + entity.shape_profile.stretch * 1.8);
    let scaleX = 1;
    let scaleZ = 1;

    switch (asset.generator) {
      case "canopy":
        ringRadius *= 0.7 + Math.sin(v * Math.PI) * (0.4 + asset.canopy * 0.35);
        centerX = Math.sin(v * Math.PI) * asset.asymmetry * 0.18;
        centerZ = Math.cos(v * Math.PI * 0.75) * asset.asymmetry * 0.14;
        break;
      case "spine":
        ringRadius *= 0.45 + (1 - v) * 0.6;
        height += Math.sin(v * Math.PI * 6) * asset.asymmetry * 0.08;
        scaleX = 0.82;
        scaleZ = 0.82;
        break;
      case "crest":
        ringRadius *= 0.55 + Math.sin(v * Math.PI) * 0.28;
        scaleX = 1.1 + asset.canopy * 0.95;
        scaleZ = 0.55 + entity.shape_profile.taper * 0.3;
        break;
      case "shell": {
        const spiral = v * Math.PI * (1.6 + Math.abs(asset.twist) * 1.4);
        centerX = Math.cos(spiral) * v * 0.42;
        centerZ = Math.sin(spiral) * v * 0.42;
        ringRadius *= 0.8 - v * 0.36;
        scaleX = 1.05;
        scaleZ = 0.9;
        height *= 0.85;
        break;
      }
      case "plate":
        ringRadius *= 0.66 + Math.sin(v * Math.PI * 4) * 0.15 + asset.flare * 0.24;
        height *= 0.74;
        break;
    }

    for (let segment = 0; segment <= radialSegments; segment++) {
      const u = segment / radialSegments;
      const angle = u * Math.PI * 2 + asset.twist * v * Math.PI;
      const ridgeWave = Math.sin(angle * ridgeBias + v * 5.5) * entity.shape_profile.wobble * 0.18;
      const currentRadius = ringRadius * (1 + ridgeWave);
      const finBoost =
        asset.generator === "crest"
          ? Math.pow(Math.max(0, Math.cos(angle)), 5) * (0.18 + asset.canopy * 0.65)
          : 0;
      const plateLobe =
        asset.generator === "plate" ? 1 + Math.sin(v * Math.PI * 6 + angle * 0.4) * 0.12 : 1;
      const x = centerX + Math.cos(angle) * currentRadius * scaleX * plateLobe;
      const z = centerZ + Math.sin(angle) * currentRadius * scaleZ * plateLobe;
      const y = height + finBoost + Math.sin(v * Math.PI) * stemScale * 0.08;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = radialSegments + 1;
  for (let ringIndex = 0; ringIndex < rings; ringIndex++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const a = ringIndex * stride + segment;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  touchCacheEntry(geometryCache, cacheKey, geometry);
  trimCache(geometryCache, GEOMETRY_CACHE_LIMIT);
  return geometry;
}

function createPatternTexture(entity: WorldEntity) {
  const asset = entity.species.texture;
  const cacheKey = [
    asset.asset_id,
    asset.palette.join(","),
    asset.bands,
    asset.spots,
    asset.grain.toFixed(2),
    asset.contrast.toFixed(2),
  ].join(":");
  const cached = textureCache.get(cacheKey);
  if (cached) {
    touchCacheEntry(textureCache, cacheKey, cached);
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    textureCache.set(cacheKey, fallback);
    return fallback;
  }

  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, asset.palette[0] ?? "#1a2530");
  gradient.addColorStop(0.5, asset.palette[1] ?? asset.palette[0] ?? "#3f5c68");
  gradient.addColorStop(1, asset.palette[2] ?? asset.palette[1] ?? "#d9f7ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  if (asset.generator === "veins") {
    ctx.strokeStyle = asset.palette[2] ?? "#d9f7ff";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < asset.bands + 3; i++) {
      ctx.beginPath();
      const startX = seededUnit(i * 17 + hashString(asset.asset_id)) * 128;
      ctx.moveTo(startX, 128);
      for (let step = 0; step <= 6; step++) {
        const y = 128 - step * 22;
        const x = startX + Math.sin(step * 0.8 + i) * (14 + asset.contrast * 26);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (asset.generator === "bands") {
    for (let i = 0; i < asset.bands; i++) {
      ctx.fillStyle = asset.palette[i % asset.palette.length] ?? "#ffffff";
      ctx.globalAlpha = 0.18 + (i % 2) * 0.1;
      ctx.fillRect(0, (i * 128) / asset.bands, 128, 128 / asset.bands);
    }
    ctx.globalAlpha = 1;
  } else if (asset.generator === "spots") {
    for (let i = 0; i < asset.spots; i++) {
      const seed = hashString(`${asset.asset_id}:${i}`);
      const x = seededUnit(seed + 3) * 128;
      const y = seededUnit(seed + 7) * 128;
      const radius = 3 + seededUnit(seed + 11) * 15;
      ctx.fillStyle = asset.palette[i % asset.palette.length] ?? "#ffffff";
      ctx.globalAlpha = 0.16 + seededUnit(seed + 17) * 0.32;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (asset.generator === "strata") {
    ctx.strokeStyle = asset.palette[2] ?? "#ffffff";
    for (let i = 0; i < asset.bands + 5; i++) {
      ctx.beginPath();
      ctx.lineWidth = 1 + (i % 3);
      ctx.globalAlpha = 0.18;
      const y = (i * 128) / (asset.bands + 5);
      ctx.moveTo(0, y);
      for (let x = 0; x <= 128; x += 8) {
        ctx.lineTo(x, y + Math.sin(x * 0.08 + i) * (2 + asset.grain * 6));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (asset.generator === "territory") {
    ctx.strokeStyle = asset.palette[2] ?? "#ffffff";
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.24;
    for (let i = 0; i < asset.bands + 4; i++) {
      ctx.beginPath();
      ctx.arc(64, 64, 8 + i * (4 + asset.contrast * 4), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < asset.spots; i++) {
      const angle = (i / asset.spots) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(angle) * 64, 64 + Math.sin(angle) * 64);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 300; i++) {
    ctx.globalAlpha = 0.015 + seededUnit(i * 13 + hashString(asset.asset_id)) * 0.04;
    const x = seededUnit(i * 17 + 3) * 128;
    const y = seededUnit(i * 19 + 7) * 128;
    const size = 0.5 + seededUnit(i * 23 + 11) * 2.2;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  touchCacheEntry(textureCache, cacheKey, texture);
  trimCache(textureCache, TEXTURE_CACHE_LIMIT);
  return texture;
}

function baseColorForEntity(entity: WorldEntity) {
  const color = new THREE.Color(entity.species.texture.palette[0] ?? "#3c5866");
  color.offsetHSL(entity.shader_profile.hue_shift * 0.4, 0.05, entity.lifecycle_stage === "seed" ? 0.06 : 0);
  return color;
}

function accentColorForEntity(entity: WorldEntity) {
  const accent = new THREE.Color(entity.species.texture.palette[2] ?? entity.species.texture.palette[1] ?? "#d9f7ff");
  if (entity.shader_profile.style === "electric") accent.offsetHSL(0.04, 0.12, 0.08);
  if (entity.shader_profile.style === "ember") accent.offsetHSL(-0.03, 0.14, 0.04);
  return accent;
}

function terrainBaseColor(cell: TerrainCell, dominantSpecies?: WorldEntity) {
  const color =
    cell.terrain_type === "loam"
      ? new THREE.Color("#425638")
      : cell.terrain_type === "reef"
        ? new THREE.Color("#245d68")
        : cell.terrain_type === "marsh"
          ? new THREE.Color("#345046")
          : cell.terrain_type === "basalt"
            ? new THREE.Color("#2f2c34")
            : new THREE.Color("#715234");

  if (dominantSpecies) {
    color.lerp(new THREE.Color(dominantSpecies.species.texture.palette[1] ?? "#ffffff"), 0.22);
  }
  color.offsetHSL(0, 0, cell.elevation * 0.08 - cell.moisture * 0.05);
  return color;
}

function createTerrainTileGeometry(cell: TerrainCell) {
  const cacheKey = `${cell.id}:${cell.elevation.toFixed(1)}:${cell.moisture.toFixed(1)}:${cell.fertility.toFixed(1)}`;
  const cached = terrainGeometryCache.get(cacheKey);
  if (cached) {
    touchCacheEntry(terrainGeometryCache, cacheKey, cached);
    return cached;
  }

  const geometry = new THREE.PlaneGeometry(TERRAIN_CELL_SIZE, TERRAIN_CELL_SIZE, 5, 5);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const noise = Math.sin(x * 0.18 + hashString(cell.id)) * 0.18 + Math.cos(z * 0.22 + hashString(`${cell.id}:z`)) * 0.12;
    const y = cell.elevation * 2.4 + cell.fertility * 0.4 - cell.moisture * 0.25 + noise * (0.3 + cell.fertility * 0.15);
    positions.setY(index, y);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  touchCacheEntry(terrainGeometryCache, cacheKey, geometry);
  trimCache(terrainGeometryCache, TERRAIN_GEOMETRY_CACHE_LIMIT);
  return geometry;
}

export function ChunkRenderer() {
  const camera = useThree((state) => state.camera);
  const entitiesById = useWorldStore((state) => state.entities);
  const terrainById = useWorldStore((state) => state.terrain);

  const entities = useMemo(() => Object.values(entitiesById), [entitiesById]);
  const terrain = useMemo(() => Object.values(terrainById), [terrainById]);
  const cameraPoint = useMemo<readonly [number, number, number]>(
    () => [camera.position.x, camera.position.y, camera.position.z],
    [camera.position.x, camera.position.y, camera.position.z],
  );
  const speciesById = useMemo(() => {
    const map = new Map<string, WorldEntity>();
    for (const entity of entities) {
      map.set(entity.species.species_id, entity);
    }
    return map;
  }, [entities]);
  const terrainPlan = useMemo(() => {
    return [...terrain]
      .map((cell) => ({
        cell,
        distanceSq: distanceSqToPoint(cell.x, 0, cell.z, cameraPoint),
      }))
      .filter((entry) => entry.distanceSq <= MAX_TERRAIN_RENDER_DISTANCE * MAX_TERRAIN_RENDER_DISTANCE)
      .sort((left, right) => left.distanceSq - right.distanceSq)
      .slice(0, MAX_RENDERED_TERRAIN_TILES)
      .map((entry) => entry.cell);
  }, [cameraPoint, terrain]);
  const renderPlan = useMemo(() => {
    const ranked = entities
      .map((entity) => {
        const distanceSq = distanceSqToPoint(entity.position[0], entity.position[1], entity.position[2], cameraPoint);
        return {
          entity,
          distanceSq,
        };
      })
      .filter((entry) => entry.distanceSq <= MAX_ENTITY_RENDER_DISTANCE * MAX_ENTITY_RENDER_DISTANCE)
      .sort((left, right) => {
        if (left.distanceSq !== right.distanceSq) return left.distanceSq - right.distanceSq;
        return right.entity.scale - left.entity.scale;
      });

    const selected: RenderedEntityPlan[] = [];
    let usedVertices = 0;

    for (const candidate of ranked) {
      if (selected.length >= MAX_RENDERED_ENTITIES) break;

      const distance = Math.sqrt(candidate.distanceSq);
      let detail = detailForDistance(distance);
      let estimatedVertices = estimateGeometryVertices(candidate.entity.species.geometry, detail);

      while (usedVertices + estimatedVertices > MAX_VISIBLE_VERTEX_BUDGET) {
        const degraded = degradeDetail(detail);
        if (!degraded) break;
        detail = degraded;
        estimatedVertices = estimateGeometryVertices(candidate.entity.species.geometry, detail);
      }

      if (usedVertices + estimatedVertices > MAX_VISIBLE_VERTEX_BUDGET && selected.length >= 24) {
        continue;
      }

      selected.push({
        entity: candidate.entity,
        detail,
        estimatedVertices,
      });
      usedVertices += estimatedVertices;
    }

    return {
      entities: selected,
      vertexCount: usedVertices,
    };
  }, [cameraPoint, entities]);

  useEffect(() => {
    const next = {
      renderedEntityCount: renderPlan.entities.length,
      renderVertexCount: renderPlan.vertexCount,
      renderEntityBudget: MAX_RENDERED_ENTITIES,
      renderVertexBudget: MAX_VISIBLE_VERTEX_BUDGET,
    };
    const current = useWorldStore.getState().stats;
    if (
      current.renderedEntityCount === next.renderedEntityCount &&
      current.renderVertexCount === next.renderVertexCount &&
      current.renderEntityBudget === next.renderEntityBudget &&
      current.renderVertexBudget === next.renderVertexBudget
    ) {
      return;
    }
    useWorldStore.getState().setRenderBudgetStats(next);
  }, [renderPlan.entities.length, renderPlan.vertexCount]);

  return (
    <group>
      {terrainPlan.map((cell) => (
        <TerrainTile key={cell.id} cell={cell} dominantEntity={cell.dominant_species_id ? speciesById.get(cell.dominant_species_id) : undefined} />
      ))}
      {renderPlan.entities.map((entry) => (
        <EntityMesh key={`${entry.entity.id}:${entry.detail}`} entity={entry.entity} detail={entry.detail} />
      ))}
    </group>
  );
}

function TerrainTile({ cell, dominantEntity }: { cell: TerrainCell; dominantEntity?: WorldEntity }) {
  const geometry = useMemo(() => createTerrainTileGeometry(cell), [cell.elevation, cell.fertility, cell.id, cell.moisture]);
  const color = useMemo(() => terrainBaseColor(cell, dominantEntity), [cell.elevation, cell.moisture, cell.terrain_type, dominantEntity?.species.species_id]);

  return (
    <mesh geometry={geometry} position={[cell.x, 0, cell.z]} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.92} metalness={0.04} emissive={color.clone().multiplyScalar(0.08)} />
    </mesh>
  );
}

function EntityMesh({ entity, detail }: { entity: WorldEntity; detail: RenderDetail }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(
    () => createSpeciesGeometry(entity.species.geometry, entity, detail),
    [
      detail,
      entity.shape_profile.kind,
      entity.shape_profile.ridges,
      entity.shape_profile.stretch,
      entity.shape_profile.taper,
      entity.shape_profile.wobble,
      entity.species.geometry.asset_id,
    ],
  );
  const texture = useMemo(
    () => createPatternTexture(entity),
    [
      entity.species.texture.asset_id,
      entity.species.texture.bands,
      entity.species.texture.contrast,
      entity.species.texture.emissive_bias,
      entity.species.texture.grain,
      entity.species.texture.spots,
      entity.species.texture.palette.join(","),
    ],
  );
  const baseColor = useMemo(
    () => baseColorForEntity(entity),
    [entity.lifecycle_stage, entity.shader_profile.hue_shift, entity.species.texture.asset_id],
  );
  const accentColor = useMemo(
    () => accentColorForEntity(entity),
    [entity.shader_profile.style, entity.species.texture.asset_id],
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBaseColor: { value: baseColor },
      uAccentColor: { value: accentColor },
      uPatternTexture: { value: texture },
      uPulse: { value: entity.shader_profile.pulse },
      uDistortion: { value: entity.shader_profile.distortion },
      uFresnel: { value: entity.shader_profile.fresnel },
      uLifecycle: { value: entity.lifecycle_t },
      uWobble: { value: entity.shape_profile.wobble },
      uTextureContrast: { value: entity.species.texture.contrast },
      uEmissiveBias: { value: entity.species.texture.emissive_bias },
    }),
    [
      accentColor,
      baseColor,
      entity.lifecycle_t,
      entity.shader_profile.distortion,
      entity.shader_profile.fresnel,
      entity.shader_profile.pulse,
      entity.shape_profile.wobble,
      entity.species.texture.contrast,
      entity.species.texture.emissive_bias,
      texture,
    ],
  );

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = entity.rotationY + Math.sin(clock.elapsedTime * 0.2 + entity.behavior_profile.phase) * 0.08;
      meshRef.current.rotation.z = Math.sin(clock.elapsedTime * (0.55 + entity.behavior_profile.frequency)) * entity.shape_profile.wobble * 0.18;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime + entity.behavior_profile.phase;
      materialRef.current.uniforms.uPulse.value = entity.shader_profile.pulse;
      materialRef.current.uniforms.uDistortion.value = entity.shader_profile.distortion;
      materialRef.current.uniforms.uFresnel.value = entity.shader_profile.fresnel;
      materialRef.current.uniforms.uLifecycle.value = entity.lifecycle_t;
      materialRef.current.uniforms.uWobble.value = entity.shape_profile.wobble;
      materialRef.current.uniforms.uTextureContrast.value = entity.species.texture.contrast;
      materialRef.current.uniforms.uEmissiveBias.value = entity.species.texture.emissive_bias;
      materialRef.current.uniforms.uPatternTexture.value = texture;
      (materialRef.current.uniforms.uBaseColor.value as THREE.Color).copy(baseColor);
      (materialRef.current.uniforms.uAccentColor.value as THREE.Color).copy(accentColor);
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[entity.position[0], entity.position[1], entity.position[2]]}
      rotation={[0, entity.rotationY, 0]}
      scale={entity.scale}
      castShadow
    >
      <shaderMaterial
        ref={materialRef}
        attach="material"
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={ENTITY_VERTEX_SHADER}
        fragmentShader={ENTITY_FRAGMENT_SHADER}
      />
    </mesh>
  );
}
