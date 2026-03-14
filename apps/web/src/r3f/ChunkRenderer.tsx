import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useWorldStore } from "../state/worldStore";
import type { WorldEntity } from "@aquarium/shared/domain";
import * as THREE from "three";

const CHUNK_SIZE = 32;
const VIEW_RADIUS_CHUNKS = 3;

function chunkIdFromPos(x: number, z: number) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return `${cx}:${cz}`;
}

function chunkCenterFromId(id: string) {
  const [cx, cz] = id.split(":").map(Number);
  return new THREE.Vector3((cx + 0.5) * CHUNK_SIZE, 0, (cz + 0.5) * CHUNK_SIZE);
}

export function ChunkRenderer() {
  const camera = useThree((s) => s.camera);
  const entitiesById = useWorldStore((s) => s.entities);

  // Keep a stable list reference to avoid per-frame allocations in React.
  const entities = useMemo(() => Object.values(entitiesById), [entitiesById]);

  const visibleChunkIds = useMemo(() => new Set<string>(), []);

  useFrame(() => {
    const camChunk = chunkIdFromPos(camera.position.x, camera.position.z);
    visibleChunkIds.clear();
    const [ccx, ccz] = camChunk.split(":").map(Number);
    for (let dx = -VIEW_RADIUS_CHUNKS; dx <= VIEW_RADIUS_CHUNKS; dx++) {
      for (let dz = -VIEW_RADIUS_CHUNKS; dz <= VIEW_RADIUS_CHUNKS; dz++) {
        visibleChunkIds.add(`${ccx + dx}:${ccz + dz}`);
      }
    }
  });

  // MVP: render visible entities directly; next step is instancing per archetype per chunk.
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
  const color =
    entity.archetype === "flora"
      ? "#2bd487"
      : entity.archetype === "fauna"
        ? "#4aa3ff"
        : entity.archetype === "rock"
          ? "#5f6a7a"
          : entity.archetype === "structure"
            ? "#caa46a"
            : "#8a5cff";

  const y = entity.position[1] + (entity.archetype === "fauna" ? Math.sin(entity.updated_at_ms / 700) * 0.15 : 0);
  const emissiveIntensity = entity.lifecycle_stage === "seed" ? 0.18 : entity.lifecycle_stage === "active" ? 0.1 : 0.05;

  if (entity.archetype === "flora") {
    return (
      <mesh position={[entity.position[0], y, entity.position[2]]} rotation={[0, entity.rotationY, 0]} scale={entity.scale}>
        <coneGeometry args={[0.45, 1.8, 7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} />
      </mesh>
    );
  }

  return (
    <mesh position={[entity.position[0], y, entity.position[2]]} rotation={[0, entity.rotationY, 0]} scale={entity.scale}>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} />
    </mesh>
  );
}
