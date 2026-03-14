import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const ORBIT_TARGET = [0, 2.5, 0] as const;

export function OrbitCameraControls() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const isInXRSession = useXR((state) => state.session != null);
  const controlsRef = useRef<ThreeOrbitControls | null>(null);

  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 48;
    controls.minPolarAngle = Math.PI / 5;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(...ORBIT_TARGET);
    controls.update();

    const handleChange = () => invalidate();
    controls.addEventListener("change", handleChange);
    controlsRef.current = controls;

    return () => {
      controls.removeEventListener("change", handleChange);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (controls == null) {
      return;
    }
    controls.enabled = !isInXRSession;
  }, [isInXRSession]);

  useFrame(() => {
    if (controlsRef.current?.enabled) {
      controlsRef.current.update();
    }
  });

  return null;
}
