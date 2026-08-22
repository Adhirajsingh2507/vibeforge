"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt, type World } from "@/lib/game/worldgen";

const EYE = 8;
const RADIUS = 0.45;
const SPEED = 14;
const FAST = 28;
const GRAVITY = 26;
const STEP = 1.05;
const ACCEL = 12;
const DECEL = 7;
const MOUSE_SENS = 0.002;
const JUMP_VEL = 10;

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
  const { camera, gl } = useThree();
  const pos = useRef(spawn.clone());
  const vel = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const vy = useRef(0);
  const grounded = useRef(false);
  const keys = useRef<Record<string, boolean>>({});
  const emit = useRef(0);
  const smoothY = useRef(spawn.y);
  const locked = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => {
      if (!locked.current) {
        canvas.requestPointerLock();
      }
    };

    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= e.movementX * MOUSE_SENS;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - e.movementY * MOUSE_SENS,
        -Math.PI / 2 + 0.05,
        Math.PI / 2 - 0.05
      );
    };

    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === "Escape") {
        document.exitPointerLock();
      }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };

    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const k = keys.current;

    const fwd = new THREE.Vector3(
      -Math.sin(yaw.current),
      0,
      -Math.cos(yaw.current)
    );
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    let inputZ = 0;
    let inputX = 0;
    if (k["ArrowUp"] || k["KeyW"]) inputZ += 1;
    if (k["ArrowDown"] || k["KeyS"]) inputZ -= 1;
    if (k["ArrowLeft"] || k["KeyA"]) inputX -= 1;
    if (k["ArrowRight"] || k["KeyD"]) inputX += 1;

    const sprinting = !!(k["ShiftLeft"] || k["ShiftRight"]);
    const maxSpeed = sprinting ? FAST : SPEED;
    const hasInput = inputZ !== 0 || inputX !== 0;

    const desired = fwd.clone().multiplyScalar(inputZ).add(right.clone().multiplyScalar(inputX));
    if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(maxSpeed);

    const v = vel.current;
    if (hasInput) {
      v.x += (desired.x - v.x) * Math.min(1, ACCEL * dt);
      v.z += (desired.z - v.z) * Math.min(1, ACCEL * dt);
    } else {
      v.x *= Math.max(0, 1 - DECEL * dt);
      v.z *= Math.max(0, 1 - DECEL * dt);
      if (v.lengthSq() < 0.001) { v.x = 0; v.z = 0; }
    }

    if (k["Space"] && grounded.current) {
      vy.current = JUMP_VEL;
      grounded.current = false;
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

    const camTarget = new THREE.Vector3(
      p.x,
      smoothY.current + EYE,
      p.z
    );
    camera.position.lerp(camTarget, Math.min(1, 20 * dt));
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

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
