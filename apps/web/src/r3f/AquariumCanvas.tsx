import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import { ChunkRenderer } from "./ChunkRenderer";
import { OrbitCameraControls } from "./OrbitCameraControls";

const xrStore = createXRStore({});

export function AquariumCanvas() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", zIndex: 2, top: 12, right: 12, display: "flex", gap: 8 }}>
        <button onClick={() => xrStore.enterVR()}>Enter VR</button>
      </div>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        frameloop="always"
        camera={{ position: [0, 6, 14], fov: 55 }}
      >
        <XR store={xrStore}>
          <OrbitCameraControls />
          <fog attach="fog" args={["#05070b", 10, 80]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[12, 18, 6]} intensity={1.1} />
          <ChunkRenderer />
        </XR>
      </Canvas>
    </div>
  );
}
