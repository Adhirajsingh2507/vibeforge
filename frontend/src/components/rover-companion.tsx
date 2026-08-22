"use client";

import { useRef, useEffect, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

const MODEL_PATH = "/models/curiosity.glb";

// ─── Personality state machine ───────────────────────────────────────────
const MOODS = ["curious", "alert", "idle", "playful", "scanning"] as const;
type Mood = (typeof MOODS)[number];

function pickMood(): Mood {
  return MOODS[Math.floor(Math.random() * MOODS.length)];
}

// ─── Easing helpers ──────────────────────────────────────────────────────
function damp(current: number, target: number, smoothing: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

function dampV3(cur: THREE.Vector3, tgt: THREE.Vector3, smoothing: number, dt: number) {
  cur.x = damp(cur.x, tgt.x, smoothing, dt);
  cur.y = damp(cur.y, tgt.y, smoothing, dt);
  cur.z = damp(cur.z, tgt.z, smoothing, dt);
}

// ─── Wheel group — finds cylindrical meshes and spins them ───────────────
function animateWheels(scene: THREE.Object3D, speed: number, dt: number) {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name.toLowerCase().includes("wheel")) {
      child.rotation.x += speed * dt;
    }
  });
}

// ─── The animated rover model ────────────────────────────────────────────
interface RoverModelProps {
  mouseNorm: React.MutableRefObject<{ x: number; y: number }>;
  mouseSpeed: React.MutableRefObject<number>;
  scrollProgress: number;
  zoom: number;
}

function RoverModel({ mouseNorm, mouseSpeed, scrollProgress, zoom }: RoverModelProps) {
  const { scene } = useGLTF(MODEL_PATH);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  const bodyGroup = useRef<THREE.Group>(null!);
  const pivotGroup = useRef<THREE.Group>(null!);

  // Animation state
  const state = useRef({
    // Body movement
    posX: 0,
    posY: 0,
    posZ: 0,
    targetPosX: 0,
    targetPosY: 0,
    targetPosZ: 0,
    // Body rotation
    rotX: 0,
    rotY: Math.PI,
    rotZ: 0,
    targetRotX: 0,
    targetRotY: Math.PI,
    targetRotZ: 0,
    // Head/mast look
    headYaw: 0,
    headPitch: 0,
    targetHeadYaw: 0,
    targetHeadPitch: 0,
    // Personality
    mood: "idle" as Mood,
    moodTimer: 0,
    moodDuration: 4,
    // Wheels
    wheelSpeed: 0,
    targetWheelSpeed: 0,
    // Suspension bounce
    suspensionPhase: 0,
    // Breathing / idle bob
    breathPhase: Math.random() * Math.PI * 2,
    // Curious peek
    peekPhase: 0,
    peekDir: 1,
    // Wander
    wanderX: 0,
    wanderZ: 0,
    wanderTargetX: 0,
    wanderTargetZ: 0,
    wanderTimer: 0,
    // Mouse reaction
    lastMouseX: 0,
    lastMouseY: 0,
    mouseReactCooldown: 0,
    isStartled: false,
    startleTimer: 0,
  });



  // Material collection for scroll animation
  const matsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Make materials support transparency without overriding original colors
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          // Clone material so we can safely modify it per instance
          child.material = (child.material as THREE.Material).clone();
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.isMeshStandardMaterial) {
            mat.transparent = true;
            mats.push(mat);
          }
        }
      }
    });
    matsRef.current = mats;
  }, [clonedScene]);

  // Compute bounding box to center and scale
  const { scaleFactor, centerOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = 3.0 / maxDim;
    return {
      scaleFactor: s,
      centerOffset: new THREE.Vector3(-center.x * s, -center.y * s, -center.z * s),
    };
  }, [clonedScene]);

  useFrame((_, delta) => {
    if (!bodyGroup.current || !pivotGroup.current) return;
    const s = state.current;
    const dt = Math.min(delta, 0.1);

    const mx = mouseNorm.current.x;
    const my = mouseNorm.current.y;

    // React to mouse
    s.targetRotY = Math.PI + mx * 0.35; // Face forward with slight twist
    s.targetRotX = -0.05;
    s.targetRotZ = -mx * 0.06;
    s.targetPosX = mx * 0.6;
    s.targetPosZ = my * 0.25;
    
    // Head looks aggressively at mouse
    s.targetHeadYaw = mx * 1.4;
    s.targetHeadPitch = -my * 0.7;
    s.targetWheelSpeed = 0;

    // ── Scroll progress transparency ──
    matsRef.current.forEach((mat) => {
      // Transition from opaque (1.0) to translucent (0.4)
      mat.opacity = 1.0 - (0.6 * scrollProgress);
    });

    // ── Smooth everything ──
    s.posX = damp(s.posX, s.targetPosX, 8, dt);
    s.posY = damp(s.posY, s.targetPosY, 6, dt);
    s.posZ = damp(s.posZ, s.targetPosZ, 8, dt);
    s.rotX = damp(s.rotX, s.targetRotX, 8, dt);
    s.rotY = damp(s.rotY, s.targetRotY, 7, dt);
    s.rotZ = damp(s.rotZ, s.targetRotZ, 8, dt);
    s.headYaw = damp(s.headYaw, s.targetHeadYaw, 12, dt);
    s.headPitch = damp(s.headPitch, s.targetHeadPitch, 12, dt);
    s.wheelSpeed = damp(s.wheelSpeed, s.targetWheelSpeed, 6, dt);

    // ── Apply to groups ──
    // Body pivot — lean based on mouse horizontal
    pivotGroup.current.rotation.z = damp(
      pivotGroup.current.rotation.z,
      -mx * 0.1,
      6,
      dt
    );
    pivotGroup.current.rotation.x = damp(
      pivotGroup.current.rotation.x,
      my * 0.06,
      6,
      dt
    );

    bodyGroup.current.position.set(s.posX, s.posY, s.posZ);
    bodyGroup.current.rotation.set(s.rotX, s.rotY, s.rotZ);

    // ── Animate wheels ──
    animateWheels(clonedScene, s.wheelSpeed, dt);

    // ── Head/mast animation ──
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const name = child.name.toLowerCase();
        if (
          name.includes("mast") ||
          name.includes("head") ||
          name.includes("cam") ||
          name.includes("antenna") ||
          name.includes("neck")
        ) {
          child.rotation.y = s.headYaw * 0.5;
          child.rotation.x = s.headPitch * 0.3;
        }
      }
    });
  });

  return (
    <group ref={pivotGroup} scale={zoom}>
      <group ref={bodyGroup}>
        <primitive
          object={clonedScene}
          scale={scaleFactor}
          position={centerOffset}
        />
      </group>
    </group>
  );
}

// ─── Ground dust particles ───────────────────────────────────────────────
function DustParticles() {
  const particlesRef = useRef<THREE.Points>(null!);
  const count = 60;

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 1] = Math.random() * 0.3 - 0.8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      vel[i * 3] = (Math.random() - 0.5) * 0.1;
      vel[i * 3 + 1] = Math.random() * 0.05;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    }
    return { positions: pos, velocities: vel };
  }, []);

  useFrame((_, delta) => {
    if (!particlesRef.current) return;
    const posAttr = particlesRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      arr[i * 3] += velocities[i * 3] * delta;
      arr[i * 3 + 1] += velocities[i * 3 + 1] * delta;
      arr[i * 3 + 2] += velocities[i * 3 + 2] * delta;

      // Reset particles that float too high
      if (arr[i * 3 + 1] > 0.2) {
        arr[i * 3] = (Math.random() - 0.5) * 3;
        arr[i * 3 + 1] = -0.8;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 3;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#d4a056"
        size={0.015}
        transparent
        opacity={0.25}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ─── Scene lighting — warm, dramatic, cinematic ──────────────────────────
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.4} color="#e8dcc8" />
      {/* Key light — warm sun */}
      <directionalLight
        position={[6, 10, 4]}
        intensity={2.0}
        color="#ffe8c0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
      />
      {/* Fill light — cool blue */}
      <directionalLight
        position={[-4, 3, -5]}
        intensity={0.5}
        color="#8ab4e0"
      />
      {/* Rim light — golden */}
      <directionalLight
        position={[-2, 4, 6]}
        intensity={0.8}
        color="#ffd080"
      />
      {/* Under glow — subtle warm */}
      <pointLight position={[0, -1.5, 1]} intensity={0.3} color="#d4a056" distance={6} />
      {/* Front spot for drama */}
      <spotLight
        position={[0, 5, 5]}
        angle={0.5}
        penumbra={0.8}
        intensity={0.6}
        color="#fff0dd"
        castShadow={false}
      />
    </>
  );
}

// ─── Position Offset Group ───────────────────────────────────────────────
// Interpolates the scene from bottom right to center based on scroll
function OffsetWrapper({ children, scrollProgress }: { children: React.ReactNode, scrollProgress: number }) {
  const { viewport } = useThree();
  
  // Place rover in the bottom-right corner when scroll is 0
  const x = viewport.width * 0.30 * (1 - scrollProgress);
  const y = -viewport.height * 0.30 * (1 - scrollProgress);
  
  return (
    <group position={[x, y, 0]}>
      {children}
    </group>
  );
}

// ─── Position Offset Group ───────────────────────────────────────────────
// Automatically offsets the scene to the bottom right of the viewport
function BottomRightOffset({ children }: { children: React.ReactNode }) {
  const { viewport } = useThree();
  
  // Place rover firmly in the bottom-right corner
  // 38% from center to the right, 38% from center downward
  const x = viewport.width * 0.38;
  const y = -viewport.height * 0.38;
  
  return (
    <group position={[x, y, 0]}>
      {children}
    </group>
  );
}

// ─── Main component ──────────────────────────────────────────────────────
interface RoverCompanionProps {
  className?: string;
  style?: React.CSSProperties;
  size?: number | string;
  scrollProgress?: number;
  zoom?: number;
}

export default function RoverCompanion({
  className = "",
  style,
  size = 280,
  scrollProgress = 0,
  zoom = 1,
}: RoverCompanionProps) {
  const mouseNorm = useRef({ x: 0, y: 0 });
  const mouseSpeed = useRef(0);
  const prevMouse = useRef({ x: 0, y: 0, time: Date.now() });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;

      const now = Date.now();
      const dt = Math.max((now - prevMouse.current.time) / 1000, 0.001);
      const dx = nx - prevMouse.current.x;
      const dy = ny - prevMouse.current.y;
      mouseSpeed.current = Math.sqrt(dx * dx + dy * dy) / dt;

      prevMouse.current = { x: nx, y: ny, time: now };
      mouseNorm.current = { x: nx, y: ny };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Adjust camera distance so the rover maintains the same apparent size
  // as it did when the canvas was 400px high.
  const CameraAdjuster = () => {
    const { camera, size: canvasSize } = useThree();
    useEffect(() => {
      const baseDistance = 6.5;
      const baseHeight = 400; // Original canvas height
      const scale = Math.max(1, canvasSize.height / baseHeight);
      camera.position.z = baseDistance * scale;
      camera.updateProjectionMatrix();
    }, [camera, canvasSize.height]);
    return null;
  };

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [0, 0.6, 6.5], fov: 28 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.3,
        }}
        shadows
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <SceneLighting />
        <Suspense fallback={null}>
          <OffsetWrapper scrollProgress={scrollProgress}>
            <RoverModel mouseNorm={mouseNorm} mouseSpeed={mouseSpeed} scrollProgress={scrollProgress} zoom={zoom} />
            <DustParticles />
            <ContactShadows
              position={[0, -0.85, 0]}
              opacity={0.3}
              scale={6}
              blur={2.5}
              far={3}
              color="#1a0a00"
            />
          </OffsetWrapper>
          <Environment preset="sunset" />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_PATH);
