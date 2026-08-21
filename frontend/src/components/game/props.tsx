"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Site } from "@/lib/types";
import { gridToWorld, heightAt, type World } from "@/lib/game/worldgen";

export function Rover({
  position,
  yaw,
  sprinting,
}: {
  position: THREE.Vector3;
  yaw: number;
  sprinting?: boolean;
}) {
  const wheels = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Mesh>(null);

  useFrame((state, dt) => {
    if (wheels.current) wheels.current.rotation.x += dt * (sprinting ? 5 : 2.5);
    if (antenna.current) {
      antenna.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.08;
    }
  });

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, yaw, 0]}>
      {/* Main chassis */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.1, 0.35, 1.6]} />
        <meshLambertMaterial color="#d0cbc0" />
      </mesh>

      {/* Upper deck */}
      <mesh position={[0, 0.82, -0.05]}>
        <boxGeometry args={[0.85, 0.2, 1.0]} />
        <meshLambertMaterial color="#a0a5aa" />
      </mesh>

      {/* Solar panels */}
      <mesh position={[0, 0.96, -0.05]}>
        <boxGeometry args={[1.7, 0.05, 1.15]} />
        <meshLambertMaterial color="#1a2a42" />
      </mesh>
      {/* Solar panel grid lines */}
      <mesh position={[0, 0.99, -0.05]}>
        <boxGeometry args={[1.68, 0.01, 0.02]} />
        <meshLambertMaterial color="#2a3a52" />
      </mesh>
      <mesh position={[0, 0.99, 0.25]}>
        <boxGeometry args={[1.68, 0.01, 0.02]} />
        <meshLambertMaterial color="#2a3a52" />
      </mesh>
      <mesh position={[0, 0.99, -0.35]}>
        <boxGeometry args={[1.68, 0.01, 0.02]} />
        <meshLambertMaterial color="#2a3a52" />
      </mesh>

      {/* Mast */}
      <mesh position={[0, 1.32, -0.45]}>
        <boxGeometry args={[0.1, 0.52, 0.1]} />
        <meshLambertMaterial color="#8a8f95" />
      </mesh>

      {/* Camera head — dual stereo cameras */}
      <mesh position={[0, 1.62, -0.45]}>
        <boxGeometry args={[0.5, 0.18, 0.18]} />
        <meshLambertMaterial color="#2a2a2e" />
      </mesh>
      <mesh position={[-0.15, 1.62, -0.55]}>
        <boxGeometry args={[0.1, 0.1, 0.06]} />
        <meshBasicMaterial color="#59d0ff" />
      </mesh>
      <mesh position={[0.15, 1.62, -0.55]}>
        <boxGeometry args={[0.1, 0.1, 0.06]} />
        <meshBasicMaterial color="#59d0ff" />
      </mesh>

      {/* Antenna */}
      <mesh ref={antenna} position={[0.35, 1.25, 0.3]}>
        <boxGeometry args={[0.04, 0.6, 0.04]} />
        <meshLambertMaterial color="#c0c0c0" />
      </mesh>
      <mesh position={[0.35, 1.58, 0.3]}>
        <boxGeometry args={[0.2, 0.04, 0.2]} />
        <meshLambertMaterial color="#e0e0e0" />
      </mesh>

      {/* Instrument arm (front) */}
      <mesh position={[0.3, 0.5, -0.9]}>
        <boxGeometry args={[0.08, 0.08, 0.4]} />
        <meshLambertMaterial color="#707580" />
      </mesh>
      <mesh position={[0.3, 0.44, -1.1]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshLambertMaterial color="#505560" />
      </mesh>

      {/* Wheels — 6 wheels like Curiosity */}
      <group ref={wheels}>
        {[
          [-0.65, -0.55],
          [0.65, -0.55],
          [-0.65, 0.0],
          [0.65, 0.0],
          [-0.65, 0.55],
          [0.65, 0.55],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.3, z]}>
            <mesh>
              <boxGeometry args={[0.18, 0.55, 0.55]} />
              <meshLambertMaterial color="#3a3a3e" />
            </mesh>
            {/* Wheel hub detail */}
            <mesh position={[x > 0 ? 0.1 : -0.1, 0, 0]}>
              <boxGeometry args={[0.02, 0.25, 0.25]} />
              <meshLambertMaterial color="#555560" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Status light */}
      <mesh position={[0, 1.0, 0.6]}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="#44ff66" />
      </mesh>
    </group>
  );
}

export function SiteBeacon({
  world,
  site,
}: {
  world: World;
  site: Site;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const { x, z } = gridToWorld(site.x, site.y);
  const base = heightAt(world, x, z) + 1;

  useFrame(({ clock }) => {
    if (ring.current) {
      ring.current.rotation.y = clock.elapsedTime * 0.3;
    }
  });

  return (
    <group position={[x, base, z]}>
      {/* Vertical beam */}
      <mesh position={[0, 10, 0]}>
        <boxGeometry args={[0.15, 20, 0.15]} />
        <meshBasicMaterial color="#44cc88" transparent opacity={0.25} depthWrite={false} />
      </mesh>

      {/* Ground marker ring */}
      <mesh ref={ring} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2.2, 6]} />
        <meshBasicMaterial color="#44cc88" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>

      {/* Ground fill */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 6]} />
        <meshBasicMaterial color="#44cc88" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>

      {/* Label */}
      <Html position={[0, 4, 0]} center distanceFactor={22} occlude={false}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded bg-black/80 px-2.5 py-1.5 text-center">
          <div className="text-[11px] font-mono font-bold text-emerald-400">
            Build Site {site.id}
          </div>
          <div className="text-[9px] font-mono text-white/50">
            {(site.safety_score * 100).toFixed(0)}% safe · rank {site.rank}
          </div>
        </div>
      </Html>
    </group>
  );
}
