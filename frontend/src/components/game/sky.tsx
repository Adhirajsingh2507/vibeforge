"use client";

import { useMemo } from "react";
import * as THREE from "three";

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
varying vec3 vDir;
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 ground;
void main() {
  float h = vDir.y;
  vec3 col = h > 0.0
    ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(horizon, ground, pow(clamp(-h, 0.0, 1.0), 0.5));
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function Sky({ radius = 600 }: { radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          horizon: { value: new THREE.Color("#c2683a") },
          zenith: { value: new THREE.Color("#0d1024") },
          ground: { value: new THREE.Color("#2a1810") },
        },
      }),
    []
  );

  return (
    <>
      <mesh material={mat} frustumCulled={false}>
        <sphereGeometry args={[radius, 32, 16]} />
      </mesh>
      <mesh position={[380, 120, 170]} frustumCulled={false}>
        <sphereGeometry args={[26, 20, 20]} />
        <meshBasicMaterial color="#fff2d4" fog={false} />
      </mesh>
    </>
  );
}
