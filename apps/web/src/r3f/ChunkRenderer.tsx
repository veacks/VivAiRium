import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useWorldStore } from "../state/worldStore";
import type { EntityShaderStyle, EntityShapeProfile, WorldEntity } from "@aquarium/shared/domain";
import * as THREE from "three";

const CHUNK_SIZE = 32;
const VIEW_RADIUS_CHUNKS = 3;
const ENTITY_VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  varying vec3 vNormalDir;
  varying float vWave;

  uniform float uTime;
  uniform float uDistortion;
  uniform float uWobble;
  uniform float uLifecycle;

  void main() {
    vec3 transformed = position;
    float wave = sin(uTime * (1.2 + uWobble * 4.0) + position.y * 5.0 + position.x * 2.5);
    transformed += normal * wave * uDistortion * (0.22 + uLifecycle * 0.6);
    transformed.x += sin(uTime * 0.8 + position.y * 4.0) * uWobble * 0.12;
    transformed.z += cos(uTime * 0.9 + position.x * 4.5) * uWobble * 0.12;

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormalDir = normalize(normalMatrix * normal);
    vWave = wave;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const ENTITY_FRAGMENT_SHADER = `
  varying vec3 vWorldPosition;
  varying vec3 vNormalDir;
  varying float vWave;

  uniform vec3 uBaseColor;
  uniform vec3 uAccentColor;
  uniform float uTime;
  uniform float uPulse;
  uniform float uFresnel;
  uniform float uLifecycle;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormalDir)), 0.0), uFresnel);
    float pulseBand = 0.5 + 0.5 * sin(uTime * (1.6 + uPulse * 3.5) + vWorldPosition.y * 6.0 + vWave * 2.0);
    float lifecycleGlow = smoothstep(0.0, 0.18, uLifecycle) * (1.0 - smoothstep(0.92, 1.0, uLifecycle) * 0.2);
    float glowMix = clamp(pulseBand * (0.28 + uPulse * 0.9) + fresnel * 0.72 + lifecycleGlow * 0.25, 0.0, 1.0);
    vec3 color = mix(uBaseColor, uAccentColor, glowMix);
    float alpha = 0.9 + fresnel * 0.08;

    gl_FragColor = vec4(color, alpha);
  }
`;

function chunkIdFromPos(x: number, z: number) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return `${cx}:${cz}`;
}

function accentColorFromStyle(style: EntityShaderStyle) {
  switch (style) {
    case "biolume":
      return new THREE.Color("#74ffd4");
    case "caustic":
      return new THREE.Color("#7be8ff");
    case "glass":
      return new THREE.Color("#d6f6ff");
    case "ember":
      return new THREE.Color("#ffb36f");
    case "electric":
      return new THREE.Color("#9bb8ff");
  }
}

function baseColorForEntity(entity: WorldEntity) {
  const color =
    entity.archetype === "flora"
      ? new THREE.Color("#2bd487")
      : entity.archetype === "fauna"
        ? new THREE.Color("#4aa3ff")
        : entity.archetype === "rock"
          ? new THREE.Color("#5f6a7a")
          : entity.archetype === "structure"
            ? new THREE.Color("#caa46a")
            : new THREE.Color("#8a5cff");

  const hue = ((entity.shader_profile.hue_shift % 1) + 1) % 1;
  color.offsetHSL(hue * 0.18, 0.08, entity.lifecycle_stage === "seed" ? 0.04 : 0);
  return color;
}

function createGeometry(shape: EntityShapeProfile) {
  switch (shape.kind) {
    case "frond":
      return new THREE.ConeGeometry(0.28 + shape.taper * 0.38, 1.1 + shape.stretch * 1.1, Math.max(5, Math.round(shape.ridges)));
    case "pod":
      return new THREE.SphereGeometry(0.48 + shape.taper * 0.18, Math.max(10, Math.round(12 + shape.ridges)), Math.max(8, Math.round(10 + shape.ridges)));
    case "crystal":
      return new THREE.OctahedronGeometry(0.5 + shape.stretch * 0.18, Math.max(0, Math.round(shape.ridges / 5)));
    case "orb":
      return new THREE.IcosahedronGeometry(0.46 + shape.stretch * 0.16, 2);
    case "fan":
      return new THREE.CylinderGeometry(0.12 + shape.taper * 0.22, 0.52 + shape.taper * 0.28, 1.0 + shape.stretch, Math.max(4, Math.round(shape.ridges)));
  }
}

export function ChunkRenderer() {
  const camera = useThree((s) => s.camera);
  const entitiesById = useWorldStore((s) => s.entities);

  // Keep a stable list reference to avoid per-frame allocations in React.
  const entities = useMemo(() => Object.values(entitiesById), [entitiesById]);
  const visibleChunkIds = useMemo(() => {
    const ids = new Set<string>();
    const camChunk = chunkIdFromPos(camera.position.x, camera.position.z);
    const [ccx, ccz] = camChunk.split(":").map(Number);
    for (let dx = -VIEW_RADIUS_CHUNKS; dx <= VIEW_RADIUS_CHUNKS; dx++) {
      for (let dz = -VIEW_RADIUS_CHUNKS; dz <= VIEW_RADIUS_CHUNKS; dz++) {
        ids.add(`${ccx + dx}:${ccz + dz}`);
      }
    }
    return ids;
  }, [camera.position.x, camera.position.z, entities.length]);

  const visibleEntities = useMemo(() => {
    const out: WorldEntity[] = [];
    for (const e of entities) if (visibleChunkIds.has(e.chunk_id)) out.push(e);
    return out;
  }, [entities, visibleChunkIds]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#06101a" roughness={1} metalness={0} />
      </mesh>
      {visibleEntities.map((e) => (
        <EntityMesh key={e.id} entity={e} />
      ))}
    </group>
  );
}

function EntityMesh({ entity }: { entity: WorldEntity }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => createGeometry(entity.shape_profile), [
    entity.shape_profile.kind,
    entity.shape_profile.ridges,
    entity.shape_profile.stretch,
    entity.shape_profile.taper,
  ]);
  const baseColor = useMemo(() => baseColorForEntity(entity), [
    entity.archetype,
    entity.lifecycle_stage,
    entity.shader_profile.hue_shift,
  ]);
  const accentColor = useMemo(() => accentColorFromStyle(entity.shader_profile.style), [entity.shader_profile.style]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBaseColor: { value: baseColor },
      uAccentColor: { value: accentColor },
      uPulse: { value: entity.shader_profile.pulse },
      uDistortion: { value: entity.shader_profile.distortion },
      uFresnel: { value: entity.shader_profile.fresnel },
      uLifecycle: { value: entity.lifecycle_t },
      uWobble: { value: entity.shape_profile.wobble },
    }),
    [accentColor, baseColor, entity.lifecycle_t, entity.shader_profile.distortion, entity.shader_profile.fresnel, entity.shader_profile.pulse, entity.shape_profile.wobble],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = entity.rotationY;
      meshRef.current.rotation.z = Math.sin(clock.elapsedTime * (0.55 + entity.behavior_profile.frequency)) * entity.shape_profile.wobble * 0.12;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime + entity.behavior_profile.phase;
      materialRef.current.uniforms.uPulse.value = entity.shader_profile.pulse;
      materialRef.current.uniforms.uDistortion.value = entity.shader_profile.distortion;
      materialRef.current.uniforms.uFresnel.value = entity.shader_profile.fresnel;
      materialRef.current.uniforms.uLifecycle.value = entity.lifecycle_t;
      materialRef.current.uniforms.uWobble.value = entity.shape_profile.wobble;
      (materialRef.current.uniforms.uBaseColor.value as THREE.Color).copy(baseColor);
      (materialRef.current.uniforms.uAccentColor.value as THREE.Color).copy(accentColor);
    }
  });

  return (
    <mesh ref={meshRef} position={[entity.position[0], entity.position[1], entity.position[2]]} rotation={[0, entity.rotationY, 0]} scale={entity.scale}>
      <primitive object={geometry} attach="geometry" />
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
