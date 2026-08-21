"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt, type World } from "@/lib/game/worldgen";

const EYE = 8;
const RADIUS = 0.45;
const SPEED = 14;
const FAST = 24;
const GRAVITY = 26;
const STEP = 1.05;
const ACCEL = 10;
const DECEL = 6;
const TURN = 2.0;

export interface PlayerState {
  pos: THREE.Vector3;
  yaw: number;
  grounded: boolean;
  sprinting: boolean;
}

function surfaceY(world: World, x: number, z: number) {
  return heightAt(world, x, z) + 1;
}

function groundUnder(world: World, x: number, z: number) {
  return Math.max(
    surfaceY(world, x - RADIUS, z - RADIUS),
    surfaceY(world, x + RADIUS, z - RADIUS),
    surfaceY(world, x - RADIUS, z + RADIUS),
    surfaceY(world, x + RADIUS, z + RADIUS)
  );
}

export default function Player({
  world,
  spawn,
  onState,
}: {
  world: World;
  spawn: THREE.Vector3;
  thirdPerson?: boolean;
  onState: (s: PlayerState) => void;
}) {
  const { camera } = useThree();
  const pos = useRef(spawn.clone());
  const vel = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const vy = useRef(0);
  const grounded = useRef(false);
  const keys = useRef<Record<string, boolean>>({});
  const emit = useRef(0);
  const smoothY = useRef(spawn.y);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const k = keys.current;

    // Arrow left/right turn
    if (k["ArrowLeft"] || k["KeyA"]) yaw.current += TURN * dt;
    if (k["ArrowRight"] || k["KeyD"]) yaw.current -= TURN * dt;

    const fwd = new THREE.Vector3(
      -Math.sin(yaw.current),
      0,
      -Math.cos(yaw.current)
    );

    let inputZ = 0;
    if (k["ArrowUp"] || k["KeyW"]) inputZ += 1;
    if (k["ArrowDown"] || k["KeyS"]) inputZ -= 1;

    const sprinting = !!(k["ShiftLeft"] || k["ShiftRight"]);
    const maxSpeed = sprinting ? FAST : SPEED;
    const hasInput = inputZ !== 0;

    const desired = fwd.clone().multiplyScalar(inputZ * maxSpeed);

    const v = vel.current;
    if (hasInput) {
      v.x += (desired.x - v.x) * Math.min(1, ACCEL * dt);
      v.z += (desired.z - v.z) * Math.min(1, ACCEL * dt);
    } else {
      v.x *= Math.max(0, 1 - DECEL * dt);
      v.z *= Math.max(0, 1 - DECEL * dt);
      if (v.lengthSq() < 0.001) { v.x = 0; v.z = 0; }
    }

    const p = pos.current;

    const mx = v.x * dt;
    const mz = v.z * dt;
    if (mx !== 0) {
      const nx = p.x + mx;
      if (groundUnder(world, nx, p.z) - p.y <= STEP) p.x = nx;
      else v.x *= -0.3;
    }
    if (mz !== 0) {
      const nz = p.z + mz;
      if (groundUnder(world, p.x, nz) - p.y <= STEP) p.z = nz;
      else v.z *= -0.3;
    }

    p.x = THREE.MathUtils.clamp(p.x, 1.5, world.W - 1.5);
    p.z = THREE.MathUtils.clamp(p.z, 1.5, world.D - 1.5);

    const ground = groundUnder(world, p.x, p.z);

    vy.current -= GRAVITY * dt;
    p.y += vy.current * dt;

    if (p.y <= ground) {
      p.y = ground;
      vy.current = 0;
      grounded.current = true;
    } else if (p.y - ground < STEP && vy.current <= 0) {
      p.y = ground;
      vy.current = 0;
      grounded.current = true;
    } else {
      grounded.current = false;
    }

    smoothY.current += (p.y - smoothY.current) * Math.min(1, 8 * dt);

    // Camera follows from behind and above
    const camTarget = new THREE.Vector3(
      p.x - fwd.x * 10,
      smoothY.current + EYE,
      p.z - fwd.z * 10
    );
    camera.position.lerp(camTarget, Math.min(1, 4 * dt));
    camera.lookAt(p.x, smoothY.current + 1, p.z);

    emit.current += dt;
    if (emit.current > 0.1) {
      emit.current = 0;
      onState({
        pos: p.clone(),
        yaw: yaw.current,
        grounded: grounded.current,
        sprinting,
      });
    }
  });

  return null;
}
