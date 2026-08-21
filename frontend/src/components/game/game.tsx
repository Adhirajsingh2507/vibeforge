"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import type { Tile, PathPoint, Site } from "@/lib/types";
import {
  generateWorld,
  gridToWorld,
  heightAt,
  tileAt,
} from "@/lib/game/worldgen";
import WorldMesh from "./world-mesh";
import Player, { type PlayerState } from "./player";
import { SiteBeacon } from "./props";
import Sky from "./sky";
import Hud, { type HudData } from "./hud";

function FpsMeter({ onFps }: { onFps: (n: number) => void }) {
  const frames = useRef(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    frames.current++;
    acc.current += dt;
    if (acc.current >= 0.5) {
      onFps(Math.round(frames.current / acc.current));
      frames.current = 0;
      acc.current = 0;
    }
  });
  return null;
}

export default function Game({
  tiles,
  path,
  sites,
}: {
  tiles: Tile[];
  path: PathPoint[];
  sites: Site[];
}) {
  const world = useMemo(() => generateWorld(tiles), [tiles]);

  const spawn = useMemo(() => {
    const start = path[0] ?? { x: 0, y: 0 };
    const { x, z } = gridToWorld(start.x, start.y);
    return new THREE.Vector3(x, heightAt(world, x, z) + 1, z);
  }, [world, path]);

  const [fps, setFps] = useState(0);
  const [player, setPlayer] = useState<PlayerState>({
    pos: spawn.clone(),
    yaw: 0,
    grounded: true,
    sprinting: false,
  });

  const handleState = useCallback((s: PlayerState) => setPlayer(s), []);

  const hud: HudData = useMemo(() => {
    const t = tileAt(world, player.pos.x, player.pos.z);
    const { bounds } = world;
    const mapped =
      player.pos.x >= bounds.x0 &&
      player.pos.x <= bounds.x1 &&
      player.pos.z >= bounds.z0 &&
      player.pos.z <= bounds.z1;
    return {
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z,
      tile: t,
      mapped,
      fps,
      thirdPerson: true,
    };
  }, [world, player, fps]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 60, near: 0.1, far: 900 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <fog attach="fog" args={["#7a4227", 55, 230]} />
        <Sky />
        <Stars radius={420} depth={60} count={2600} factor={5} fade speed={0.3} />

        <hemisphereLight args={["#b08a6a", "#241a16", 1.15]} />
        <directionalLight position={[90, 70, 40]} intensity={2.1} color="#ffd9b0" />
        <directionalLight position={[-70, 30, -60]} intensity={0.35} color="#6d8cc0" />

        <WorldMesh world={world} />

        {sites.map((s) => (
          <SiteBeacon key={s.id} world={world} site={s} />
        ))}

        <Player
          world={world}
          spawn={spawn}
          onState={handleState}
        />
        <FpsMeter onFps={setFps} />
      </Canvas>

      <Hud data={hud} />

      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2">
        <a
          href="/"
          className="pointer-events-auto font-mono text-[10px] text-white/30 hover:text-white/60"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
