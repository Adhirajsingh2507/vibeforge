"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { getBlockMaterials, type BlockId } from "@/lib/game/blocks";
import type { World } from "@/lib/game/worldgen";

const MAX_EXPOSED_DEPTH = 10;

function subsurface(surface: BlockId, depth: number): BlockId {
  if (depth === 0) return surface;
  if (surface === "unmapped") return "unmapped";
  if (depth <= 2) return surface;
  return depth > 6 ? "bedrock" : "stone";
}

export default function WorldMesh({ world }: { world: World }) {
  const meshes = useMemo(() => {
    const mats = getBlockMaterials();
    const buckets = new Map<BlockId, THREE.Matrix4[]>();
    const push = (id: BlockId, x: number, y: number, z: number) => {
      let arr = buckets.get(id);
      if (!arr) buckets.set(id, (arr = []));
      arr.push(new THREE.Matrix4().setPosition(x + 0.5, y + 0.5, z + 0.5));
    };

    const { W, D, height, surface } = world;
    const h = (x: number, z: number) =>
      x < 0 || z < 0 || x >= W || z >= D ? 0 : height[z * W + x];

    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        const top = height[i];
        const s = surface[i];

        push(s, x, top, z);

        const lowest = Math.min(
          h(x - 1, z),
          h(x + 1, z),
          h(x, z - 1),
          h(x, z + 1)
        );
        const drop = Math.min(top - lowest, MAX_EXPOSED_DEPTH);
        for (let d = 1; d <= drop; d++) {
          push(subsurface(s, d), x, top - d, z);
        }
      }
    }

    const geom = new THREE.BoxGeometry(1, 1, 1);
    return Array.from(buckets.entries()).map(([id, mats4]) => {
      const inst = new THREE.InstancedMesh(
        geom,
        mats[id].materials,
        mats4.length
      );
      mats4.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      return { id, inst };
    });
  }, [world]);

  return (
    <group>
      {meshes.map(({ id, inst }) => (
        <primitive key={id} object={inst} />
      ))}
    </group>
  );
}
