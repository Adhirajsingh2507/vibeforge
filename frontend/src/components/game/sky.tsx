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
uniform vec3 mid;
uniform vec3 zenith;
uniform vec3 ground;
uniform vec3 sunDir;
void main() {
  float h = vDir.y;
  vec3 col;
  if (h > 0.0) {
    float t = pow(clamp(h, 0.0, 1.0), 0.45);
    col = t < 0.3
      ? mix(horizon, mid, t / 0.3)
      : mix(mid, zenith, (t - 0.3) / 0.7);
  } else {
    col = mix(horizon, ground, pow(clamp(-h, 0.0, 1.0), 0.5));
  }

  // Sun glow
  float sunDot = max(dot(normalize(vDir), sunDir), 0.0);
  col += vec3(1.0, 0.75, 0.4) * pow(sunDot, 32.0) * 0.6;
  col += vec3(1.0, 0.85, 0.6) * pow(sunDot, 256.0) * 1.2;

  // Atmospheric haze near horizon
  float haze = exp(-abs(h) * 4.0) * 0.25;
  col += vec3(0.8, 0.45, 0.25) * haze;

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function Sky({ radius = 800 }: { radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          horizon: { value: new THREE.Color("#c87040") },
          mid: { value: new THREE.Color("#7a3820") },
          zenith: { value: new THREE.Color("#0a0e1a") },
          ground: { value: new THREE.Color("#1e1008") },
          sunDir: { value: new THREE.Vector3(0.6, 0.35, 0.3).normalize() },
        },
      }),
    []
  );

  return (
    <>
      <mesh material={mat} frustumCulled={false}>
        <sphereGeometry args={[radius, 48, 24]} />
      </mesh>
      {/* Sun disc */}
      <mesh position={[450, 180, 220]} frustumCulled={false}>
        <sphereGeometry args={[20, 24, 24]} />
        <meshBasicMaterial color="#fff6e0" fog={false} />
      </mesh>
      {/* Phobos */}
      <mesh position={[-300, 200, -100]} frustumCulled={false}>
        <sphereGeometry args={[5, 12, 12]} />
        <meshBasicMaterial color="#aa9988" fog={false} />
      </mesh>
    </>
  );
}
