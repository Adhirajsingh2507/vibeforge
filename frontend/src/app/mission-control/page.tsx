"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import type { Tile, PathPoint, Site, Boundary } from "@/lib/types";
import TerrainGrid from "@/components/terrain-grid";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Data = {
  tiles: Tile[];
  path: PathPoint[];
  sites: Site[];
  boundaries: Boundary[];
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

async function tryJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function loadData(): Promise<Data> {
  const base = API || "/api/backend";
  try {
    const [tiles, path, sites, boundaries] = await Promise.all([
      tryJson(`${base}/map/tiles`),
      tryJson(`${base}/rover/path`),
      tryJson(`${base}/sites`),
      tryJson(`${base}/boundaries`),
    ]);
    return { tiles, path, sites, boundaries };
  } catch {
    const [tiles, path, sites, boundaries] = await Promise.all([
      tryJson("/mock/tiles.json"),
      tryJson("/mock/path.json"),
      tryJson("/mock/sites.json"),
      tryJson("/mock/boundaries.json"),
    ]);
    return { tiles, path, sites, boundaries };
  }
}

const sans = "var(--font-sans)";
const mono = "var(--font-mono)";
const serif = "var(--font-serif)";
const cream = "var(--cream)";
const creamDim = "var(--cream-dim)";

const ZONE_COLORS: Record<number, string> = { 0: "var(--green)", 1: "var(--blue)", 2: "var(--amber)", 3: "var(--red)" };
const ZONE_LABELS: Record<number, string> = { 0: "Safe", 1: "Navigation", 2: "Geological", 3: "Hazard" };
const CLASS_LABELS: Record<string, string> = {
  compact_soil: "Compact Soil", soil: "Soil", loose_soil: "Loose Soil", rock: "Rock",
  crater: "Crater", shadow: "Shadow", waterbed: "Waterbed", mineral_edge: "Mineral Edge", unknown: "Unknown",
};
const ZONE_HEX: Record<number, number> = { 0: 0xffffff, 1: 0xaaaaaa, 2: 0x666666, 3: 0x333333 };

function StatusDot({ color = "var(--green)", size = 6 }: { color?: string; size?: number }) {
  return <span className="inline-block rounded-full animate-blink" style={{ background: color, width: size, height: size }} />;
}

function FlipDigit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-24 h-32 md:w-32 md:h-40 bg-[#0a0a0a] rounded-xl flex items-center justify-center border border-white/[0.08] shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Horizontal split line */}
        <div className="absolute inset-0 flex flex-col pointer-events-none z-10">
          <div className="flex-1 border-b border-black/50" />
          <div className="flex-1 border-t border-white/[0.05]" />
        </div>
        
        {/* Subtle gradient overlay to simulate curvature */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-black/50 pointer-events-none" />
        
        <span className="relative z-0 text-[60px] md:text-[80px] tabular-nums font-medium tracking-tight" style={{ fontFamily: mono, color: cream }}>
          {value}
        </span>
      </div>
      <span className="text-[9px] md:text-[11px] tracking-[0.3em] uppercase text-white/40" style={{ fontFamily: sans }}>
        {label}
      </span>
    </div>
  );
}

function BigFlipClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) {
    return (
      <div className="flex items-center justify-center gap-4 md:gap-6 py-6 md:py-12 animate-pulse opacity-20">
        <div className="w-24 h-32 md:w-32 md:h-40 bg-white/[0.05] rounded-xl" />
        <div className="w-4 h-16 bg-white/[0.05] rounded-full" />
        <div className="w-24 h-32 md:w-32 md:h-40 bg-white/[0.05] rounded-xl" />
      </div>
    );
  }

  const hh = time.getUTCHours().toString().padStart(2, "0");
  const mm = time.getUTCMinutes().toString().padStart(2, "0");
  const ss = time.getUTCSeconds().toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center justify-center pt-8 pb-4">
      <div className="flex items-center justify-center gap-4 md:gap-6">
        <FlipDigit value={hh} label="Hours" />
        <div className="flex flex-col gap-4 pb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 animate-pulse" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 animate-pulse" />
        </div>
        <FlipDigit value={mm} label="Minutes" />
        <div className="flex flex-col gap-4 pb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 animate-pulse" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 animate-pulse" />
        </div>
        <FlipDigit value={ss} label="Seconds" />
        
        <div className="ml-4 md:ml-8 flex flex-col justify-center border-l border-white/[0.06] pl-6 md:pl-8 py-4">
          <span className="text-[14px] md:text-[18px] tracking-[0.2em] font-medium" style={{ color: "var(--green)" }}>UTC</span>
          <span className="text-[10px] md:text-[12px] tracking-[0.2em] mt-1 opacity-50 uppercase">{time.toISOString().slice(0, 10)}</span>
          <span className="text-[9px] tracking-[0.2em] mt-6 text-white/20 uppercase">Mission Clock</span>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] tracking-[0.18em] uppercase font-medium" style={{ fontFamily: sans, color: "rgba(232,228,217,0.35)" }}>
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[14px] font-semibold tracking-[-0.01em] mb-1" style={{ fontFamily: sans, color: cream }}>
      {children}
    </h3>
  );
}

// ── 3D Terrain Grid ──
function TerrainGrid3D({ tiles }: { tiles: Tile[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ renderer: THREE.WebGLRenderer; raf: number } | null>(null);
  const [hoveredTile, setHoveredTile] = useState<Tile | null>(null);

  useEffect(() => {
    if (!containerRef.current || sceneRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080808);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI / 2.1;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(8, 20, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
    sun.shadow.bias = -0.001;
    scene.add(sun);
    scene.add(new THREE.DirectionalLight(0xffffff, 0.4).translateX(-6).translateY(10).translateZ(-4));

    const cols = Math.max(...tiles.map((t) => t.x)) + 1;
    const rows = Math.max(...tiles.map((t) => t.y)) + 1;
    const bs = 0.8, gap = 0.06, step = bs + gap;
    const ox = (cols * step) / 2, oz = (rows * step) / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(cols * step + 2, rows * step + 2),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(Math.max(cols, rows) * step + 2, Math.max(cols, rows), 0x333333, 0x1a1a1a);
    grid.position.y = 0.01;
    scene.add(grid);

    const terrainMeshes: THREE.Mesh[] = [];

    tiles.forEach((tile) => {
      const height = Math.max(0.15, tile.safety_score * 2.5);
      const geom = new THREE.BoxGeometry(bs - 0.04, height, bs - 0.04);
      const mat = new THREE.MeshStandardMaterial({ color: ZONE_HEX[tile.zone] ?? 0x888888, roughness: 0.4, metalness: 0.1 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(tile.x * step - ox + step / 2, height / 2, tile.y * step - oz + step / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { tile };
      scene.add(mesh);
      terrainMeshes.push(mesh);
      
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.06, transparent: true })
      );
      edges.position.copy(mesh.position);
      scene.add(edges);
    });

    const dist = Math.max(cols, rows) * step * 0.9;
    camera.position.set(dist * 0.7, dist * 0.6, dist * 0.7);
    controls.target.set(0, 0.5, 0);
    controls.update();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-1000, -1000);
    let hoveredMesh: THREE.Mesh | null = null;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    container.addEventListener("pointermove", onPointerMove);

    let raf = 0;
    const animate = () => { 
      raf = requestAnimationFrame(animate); 
      controls.update(); 
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(terrainMeshes);
      
      if (intersects.length > 0) {
        const object = intersects[0].object as THREE.Mesh;
        if (hoveredMesh !== object) {
          if (hoveredMesh) {
            (hoveredMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          }
          hoveredMesh = object;
          (hoveredMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x333333);
          setHoveredTile(hoveredMesh.userData.tile);
          container.style.cursor = "pointer";
        }
      } else {
        if (hoveredMesh) {
          (hoveredMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          hoveredMesh = null;
          setHoveredTile(null);
          container.style.cursor = "default";
        }
      }

      renderer.render(scene, camera); 
    };
    sceneRef.current = { renderer, raf };
    animate();

    const ro = new ResizeObserver(() => {
      const w2 = container.clientWidth, h2 = container.clientHeight;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(raf);
      renderer.dispose();
      container.innerHTML = "";
      sceneRef.current = null;
    };
  }, [tiles]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Interactive Tooltip Overlay */}
      {hoveredTile && (
        <div className="absolute bottom-6 right-6 pointer-events-none p-5 rounded-2xl border border-white/[0.08] bg-black/80 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col gap-3 z-50">
          <div className="flex items-center justify-between gap-6">
            <span className="text-[10px] tracking-[0.2em] uppercase font-medium text-white/50">Cell {hoveredTile.x}, {hoveredTile.y}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm" style={{ background: ZONE_COLORS[hoveredTile.zone] }} />
              <span className="text-[10px] tracking-[0.1em] uppercase font-medium" style={{ color: ZONE_COLORS[hoveredTile.zone] }}>
                {ZONE_LABELS[hoveredTile.zone]}
              </span>
            </div>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] tabular-nums font-light leading-none" style={{ fontFamily: mono, color: cream }}>
              {(hoveredTile.safety_score * 100).toFixed(1)}%
            </span>
            <span className="text-[10px] tracking-[0.1em] uppercase text-white/40">Safety</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-2 pt-4 border-t border-white/[0.06]">
            <div>
              <div className="text-[9px] tracking-[0.1em] uppercase text-white/40 mb-1">Terrain</div>
              <div className="text-[11px] font-medium" style={{ color: creamDim }}>{CLASS_LABELS[hoveredTile.class] || hoveredTile.class}</div>
            </div>
            <div>
              <div className="text-[9px] tracking-[0.1em] uppercase text-white/40 mb-1">Elevation</div>
              <div className="text-[11px] font-medium tabular-nums" style={{ color: creamDim }}>{hoveredTile.z.toFixed(2)}m</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fullscreen 2D Map ──
function Fullscreen2DMap({ data, onClose }: { data: Data; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<Tile | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const CELL = 28;
  const GAP = 1;
  const PAD = 16;
  const cols = Math.max(...data.tiles.map((t) => t.x)) + 1;
  const rows = Math.max(...data.tiles.map((t) => t.y)) + 1;
  const gridW = cols * (CELL + GAP) - GAP + PAD * 2;
  const gridH = rows * (CELL + GAP) - GAP + PAD * 2;

  const ZF: Record<number, string> = { 0: "#ffffff", 1: "#737373", 2: "#404040", 3: "#1a1a1a" };
  const ZT: Record<number, string> = { 0: "#000000", 1: "#ffffff", 2: "#ffffff", 3: "#666666" };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.3, Math.min(8, transform.scale * delta));
      const ratio = newScale / transform.scale;
      setTransform({ scale: newScale, x: mx - (mx - transform.x) * ratio, y: my - (my - transform.y) * ratio });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const s = Math.min((cw - 40) / gridW, (ch - 40) / gridH, 2);
    setTransform({ scale: s, x: (cw - gridW * s) / 2, y: (ch - gridH * s) / 2 });
  }, [gridW, gridH]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: transform.x, startTy: transform.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    const drag = dragRef.current;
    if (!drag) return;
    setTransform((t) => ({ ...t, x: drag.startTx + (e.clientX - drag.startX), y: drag.startTy + (e.clientY - drag.startY) }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const site = hovered ? data.sites.find((s) => s.x === hovered.x && s.y === hovered.y) : null;

  return (
    <div className="fixed inset-0 z-[200] bg-black" style={{ fontFamily: sans }}>
      {/* Close + legend — floating top-right */}
      <div className="absolute top-5 right-5 z-[210] flex items-center gap-3">
        <div className="flex items-center gap-4 px-4 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08]">
          {[["Safe", "#ffffff"], ["Nav", "#737373"], ["Geo", "#404040"], ["Hazard", "#1a1a1a"]].map(([label, color]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border border-white/10" style={{ background: color }} />
              <span className="text-[9px] tracking-[0.1em] uppercase" style={{ color: creamDim }}>{label}</span>
            </div>
          ))}
          <span className="ml-1 text-[9px] tabular-nums" style={{ fontFamily: mono, color: "rgba(232,228,217,0.2)" }}>
            {Math.round(transform.scale * 100)}%
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full border border-white/[0.15] hover:border-white/[0.4] bg-black/70 backdrop-blur-xl hover:bg-white/[0.08] flex items-center justify-center transition-all"
        >
          <span className="text-[14px]" style={{ color: creamDim }}>✕</span>
        </button>
      </div>

      {/* Title — floating top-left */}
      <div className="absolute top-5 left-5 z-[210] px-4 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08] flex items-center gap-3">
        <span className="text-[13px] font-light" style={{ fontFamily: serif, color: cream }}>2D Terrain Map</span>
        <span className="text-[10px] tabular-nums" style={{ fontFamily: mono, color: "rgba(232,228,217,0.3)" }}>
          {data.tiles.length} cells · {data.tiles.length * 5} m²
        </span>
      </div>

      {/* Hint — floating bottom-center */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[210] px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-xl border border-white/[0.06]">
        <span className="text-[9px] tracking-[0.15em] uppercase" style={{ color: "rgba(232,228,217,0.15)" }}>
          Scroll to zoom · Drag to pan · Hover to inspect · ESC to close
        </span>
      </div>

      {/* Full-viewport SVG canvas */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <svg
          width={gridW}
          height={gridH}
          viewBox={`0 0 ${gridW} ${gridH}`}
          data-text-visible={transform.scale >= 0.8 ? "true" : undefined}
          className="[&[data-text-visible='true']_text]:opacity-100"
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: gridW, height: gridH,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {useMemo(() => data.tiles.map((tile) => {
            const tx = PAD + tile.x * (CELL + GAP);
            const ty = PAD + tile.y * (CELL + GAP);
            return (
              <g
                key={`${tile.x}-${tile.y}`}
                onMouseEnter={() => setHovered(tile)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-crosshair group"
              >
                <rect
                  x={tx} y={ty} width={CELL} height={CELL}
                  fill={ZF[tile.zone]}
                  className="opacity-85 group-hover:opacity-100 group-hover:stroke-[#34D399] transition-all"
                  strokeWidth={2}
                  stroke="transparent"
                />
                <text
                  x={tx + CELL / 2} y={ty + CELL / 2 + 4}
                  textAnchor="middle"
                  fill={ZT[tile.zone]}
                  fontSize="10" fontWeight="700"
                  fontFamily="Inter, sans-serif"
                  style={{ pointerEvents: "none" }}
                  className="transition-opacity opacity-0 data-visible:opacity-100"
                >
                  {(tile.safety_score * 100).toFixed(0)}
                </text>
              </g>
            );
          }), [data.tiles])}

          {data.boundaries.map((b, i) => (
            <path
              key={i}
              d={b.polyline.map(([bx, by], j) => `${j === 0 ? "M" : "L"} ${PAD + bx * (CELL + GAP) + CELL / 2} ${PAD + by * (CELL + GAP) + CELL / 2}`).join(" ")}
              fill="none" stroke="#fff" strokeWidth={0.8}
              strokeDasharray={b.type === "crater_keepout" ? "6 3" : "2 4"}
              opacity={0.15} style={{ pointerEvents: "none" }}
            />
          ))}

          {data.path.length > 0 && (
            <g style={{ pointerEvents: "none" }}>
              <path
                d={data.path.map((p, i) => `${i === 0 ? "M" : "L"} ${PAD + p.x * (CELL + GAP) + CELL / 2} ${PAD + p.y * (CELL + GAP) + CELL / 2}`).join(" ")}
                fill="none" stroke="#34D399" strokeWidth={1.5} strokeLinecap="round" opacity={0.5} strokeDasharray="4 2"
              />
              {data.path.map((p, i) => (
                <circle
                  key={i}
                  cx={PAD + p.x * (CELL + GAP) + CELL / 2}
                  cy={PAD + p.y * (CELL + GAP) + CELL / 2}
                  r={i === data.path.length - 1 ? 4 : 2}
                  fill="#34D399"
                  opacity={i === data.path.length - 1 ? 1 : 0.4}
                />
              ))}
            </g>
          )}

          {data.sites.map((s) => (
            <g key={s.id} style={{ pointerEvents: "none" }}>
              <circle
                cx={PAD + s.x * (CELL + GAP) + CELL / 2}
                cy={PAD + s.y * (CELL + GAP) + CELL / 2}
                r={6} fill="none" stroke="#34D399" strokeWidth={1.5} opacity={0.6}
              />
              <text
                x={PAD + s.x * (CELL + GAP) + CELL / 2}
                y={PAD + s.y * (CELL + GAP) - 4}
                textAnchor="middle" fill="#34D399"
                fontSize="8" fontFamily="Inter, sans-serif" fontWeight="700"
              >
                S{s.rank}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="fixed z-[220] pointer-events-none"
          style={{
            left: mousePos.x + 16,
            top: mousePos.y - 10,
            transform: mousePos.x > window.innerWidth - 260 ? "translateX(-110%)" : undefined,
          }}
        >
          <div className="px-4 py-3 rounded-xl bg-black/90 backdrop-blur-xl border border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.6)] min-w-[200px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[14px] font-semibold tabular-nums" style={{ color: cream }}>
                {hovered.x},{hovered.y}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: ZONE_COLORS[hovered.zone] }} />
                <span className="text-[10px] font-medium" style={{ color: ZONE_COLORS[hovered.zone] }}>
                  {ZONE_LABELS[hovered.zone]}
                </span>
              </div>
            </div>
            <div className="text-[20px] font-light tabular-nums mb-2" style={{ fontFamily: serif, color: "var(--green)" }}>
              {(hovered.safety_score * 100).toFixed(1)}%
            </div>
            <div className="space-y-1 border-t border-white/[0.06] pt-2">
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: "rgba(232,228,217,0.3)" }}>Class</span>
                <span className="text-[10px] font-semibold" style={{ fontFamily: mono, color: creamDim }}>{CLASS_LABELS[hovered.class] || hovered.class}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: "rgba(232,228,217,0.3)" }}>Slope</span>
                <span className="text-[10px] font-semibold tabular-nums" style={{ fontFamily: mono, color: creamDim }}>{hovered.slope.toFixed(2)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: "rgba(232,228,217,0.3)" }}>Elevation</span>
                <span className="text-[10px] font-semibold tabular-nums" style={{ fontFamily: mono, color: creamDim }}>{hovered.z.toFixed(2)} m</span>
              </div>
            </div>
            {site && (
              <div className="mt-2 pt-2 border-t border-green-500/20">
                <span className="text-[9px] tracking-[0.12em] uppercase font-semibold" style={{ color: "var(--green)" }}>
                  Construction Site {site.id} · Rank #{site.rank}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MissionControl() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "mock" | null>(null);
  const [show2DMap, setShow2DMap] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base = API || "/api/backend";
    fetch(`${base}/health`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((h) => setSource(h.source === "supabase" ? "live" : "mock"))
      .catch(() => setSource("mock"));
    loadData().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="text-[10px] tracking-[0.25em] uppercase mb-4" style={{ fontFamily: sans, color: "var(--red)" }}>Connection Error</div>
          <p style={{ fontFamily: sans, color: cream }} className="text-lg opacity-50">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <div className="relative mx-auto h-8 w-8">
            <div className="absolute inset-0 rounded-full border border-white/[0.08]" />
            <div className="absolute inset-1 animate-spin rounded-full border border-white/[0.04] border-t-white/30" />
          </div>
          <div className="text-[10px] tracking-[0.25em] uppercase" style={{ fontFamily: sans, color: creamDim }}>Loading Telemetry</div>
        </div>
      </main>
    );
  }

  const avgSafety = data.tiles.reduce((a, t) => a + t.safety_score, 0) / data.tiles.length;
  const safeZones = data.tiles.filter((t) => t.zone === 0).length;
  const hazards = data.tiles.filter((t) => t.zone === 3).length;
  const navZones = data.tiles.filter((t) => t.zone === 1).length;
  const geoZones = data.tiles.filter((t) => t.zone === 2).length;
  const totalTiles = data.tiles.length;
  const cols = Math.max(...data.tiles.map((t) => t.x)) + 1;
  const rows = Math.max(...data.tiles.map((t) => t.y)) + 1;

  const classCounts: Record<string, number> = {};
  data.tiles.forEach((t) => { classCounts[t.class] = (classCounts[t.class] || 0) + 1; });
  const sortedClasses = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);

  const avgSlope = data.tiles.reduce((a, t) => a + t.slope, 0) / totalTiles;
  const maxSlope = Math.max(...data.tiles.map((t) => t.slope));
  const avgElevation = data.tiles.reduce((a, t) => a + t.z, 0) / totalTiles;

  const systems = [
    { name: "Stereo Depth", status: "ACTIVE", color: "var(--green)" },
    { name: "Segmentation", status: "ACTIVE", color: "var(--green)" },
    { name: "SLAM Fusion", status: "ACTIVE", color: "var(--green)" },
    { name: "Safety Scoring", status: "ACTIVE", color: "var(--green)" },
    { name: "Comms Uplink", status: source === "live" ? "CONNECTED" : "OFFLINE", color: source === "live" ? "var(--green)" : "var(--amber)" },
    { name: "Edge Compute", status: "NOMINAL", color: "var(--green)" },
  ];

  return (
    <div className="bg-black min-h-screen text-white flex flex-col" style={{ fontFamily: sans }}>

      {/* ═══ TOP BAR ═══ */}
      <header className="sticky top-0 z-50 bg-black/40 backdrop-blur-2xl border-b border-white/[0.06] px-12 py-5 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[16px] font-medium tracking-[0.1em] uppercase hover:text-white transition-colors duration-500" style={{ color: creamDim }}>
            TerraSight
          </Link>
          <span className="h-4 w-px bg-white/[0.1]" />
          <span className="text-[12px] tracking-[0.2em] uppercase font-semibold" style={{ color: cream }}>
            Mission Control
          </span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <StatusDot color={source === "live" ? "var(--green)" : "var(--amber)"} size={6} />
            <span className="text-[11px] tracking-[0.1em] uppercase font-medium" style={{ color: source === "live" ? "var(--green)" : "var(--amber)" }}>
              {source === "live" ? "Live Telemetry" : "Simulated"}
            </span>
          </div>
          <span className="h-4 w-px bg-white/[0.06]" />
          <Link href="/terrain" className="text-[11px] tracking-[0.1em] uppercase font-medium hover:opacity-70 transition-opacity" style={{ color: "#34D399" }}>
            Terrain 3D ↗
          </Link>
          <Link href="/explore" className="text-[11px] tracking-[0.1em] uppercase font-medium hover:opacity-70 transition-opacity" style={{ color: creamDim }}>
            Surface View ↗
          </Link>
        </div>
      </header>

      {/* ═══ VERTICAL SCROLL DASHBOARD ═══ */}
      <div className="flex-1 flex flex-col gap-32 px-12 py-24 max-w-[2000px] mx-auto w-full">
        
        {/* ── MISSION CLOCK ── */}
        <BigFlipClock />

        {/* ── SECTION 1: Terrain Grids (2D + 3D side by side) ── */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 2D Map */}
          <section className="h-[70vh] rounded-2xl overflow-hidden border border-white/[0.04] bg-black relative flex flex-col shadow-[0_0_80px_rgba(255,255,255,0.02)]">
            <div className="shrink-0 px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-[18px] font-light tracking-[-0.01em]" style={{ fontFamily: serif, color: cream }}>
                  2D Grid
                </h3>
                <span className="text-[10px] tabular-nums px-2.5 py-0.5 rounded-full border border-white/[0.08]" style={{ fontFamily: mono, color: "rgba(232,228,217,0.3)" }}>
                  {totalTiles} cells
                </span>
              </div>
              <button
                onClick={() => setShow2DMap(true)}
                className="group px-4 py-1.5 rounded-full border border-white/[0.12] hover:border-white/[0.3] hover:bg-white/[0.05] transition-all duration-300"
              >
                <span className="text-[9px] tracking-[0.15em] uppercase font-semibold group-hover:text-white transition-colors" style={{ color: creamDim }}>
                  ⛶ Expand
                </span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              <TerrainGrid tiles={data.tiles} path={data.path} sites={data.sites} boundaries={data.boundaries} />
            </div>
          </section>

          {/* 3D Map */}
          <section className="h-[70vh] rounded-2xl overflow-hidden border border-white/[0.04] bg-black relative flex flex-col shadow-[0_0_80px_rgba(255,255,255,0.02)]">
            <div className="shrink-0 px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-[18px] font-light tracking-[-0.01em]" style={{ fontFamily: serif, color: cream }}>
                  3D Grid
                </h3>
                <span className="text-[10px] tabular-nums px-2.5 py-0.5 rounded-full border border-white/[0.08]" style={{ fontFamily: mono, color: "rgba(232,228,217,0.3)" }}>
                  {cols} × {rows}
                </span>
              </div>
            </div>
            <div className="flex-1">
              <TerrainGrid3D tiles={data.tiles} />
            </div>
          </section>
        </div>

        {/* ── SECTION 2: Overview + Stats ── */}
        <section className="w-full grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Big stat */}
          <div className="p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01] flex flex-col justify-center">
            <Label>Avg Safety Score</Label>
            <div className="mt-4 text-[5vw] lg:text-[72px] font-light tabular-nums leading-none tracking-tight" style={{ fontFamily: serif, color: "var(--green)" }}>
              {(avgSafety * 100).toFixed(1)}%
            </div>
          </div>

          {/* Zone counts */}
          <div className="p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01] space-y-4 flex flex-col justify-center">
            <Label>Zone Distribution</Label>
            {[0, 1, 2, 3].map((z) => {
              const count = data.tiles.filter((t) => t.zone === z).length;
              const pct = (count / totalTiles) * 100;
              return (
                <div key={z}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: ZONE_COLORS[z] }} />
                      <span className="text-[14px] font-medium" style={{ color: cream }}>{ZONE_LABELS[z]}</span>
                    </div>
                    <span className="text-[13px] tabular-nums font-medium" style={{ color: creamDim }}>
                      {count}
                    </span>
                  </div>
                  <div className="h-[4px] rounded-full bg-white/[0.04] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ZONE_COLORS[z], opacity: 0.6 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stat grid */}
          <div className="p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01] flex flex-col justify-center">
            <Label>Grid Metrics</Label>
            <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6">
              {[
                { v: `${totalTiles}`, l: "Total Cells" },
                { v: `${cols}×${rows}`, l: "Grid" },
                { v: `${data.sites.length}`, l: "Build Sites" },
                { v: `${data.path.length}`, l: "Waypoints" },
                { v: `${avgSlope.toFixed(1)}°`, l: "Avg Slope" },
                { v: `${maxSlope.toFixed(1)}°`, l: "Max Slope" },
                { v: `${avgElevation.toFixed(2)}m`, l: "Avg Elevation" },
                { v: `${totalTiles * 5} m²`, l: "Coverage" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-[24px] font-light tabular-nums" style={{ fontFamily: serif, color: cream }}>{s.v}</div>
                  <div className="text-[10px] tracking-[0.12em] uppercase font-medium mt-1" style={{ color: "rgba(232,228,217,0.25)" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SECTION 2B: Terrain Classes ── */}
        <section className="w-full p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01]">
          <Label>Terrain Composition</Label>
          <div className="mt-6 flex flex-wrap gap-4">
            {sortedClasses.map(([cls, count]) => (
              <div key={cls} className="flex items-center gap-3 px-5 py-3 rounded-xl border border-white/[0.06] bg-black/40 hover:bg-white/[0.05] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                <span className="text-[13px] font-medium" style={{ color: creamDim }}>{CLASS_LABELS[cls] || cls}</span>
                <span className="text-[14px] tabular-nums font-semibold ml-2" style={{ fontFamily: mono, color: cream }}>{count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── BOTTOM GRID: Construction, Path, System Status ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ── SECTION 3: Construction Sites ── */}
          <section className="rounded-2xl border border-white/[0.04] bg-white/[0.01] flex flex-col min-h-[500px]">
            <div className="shrink-0 px-8 py-6 border-b border-white/[0.04] flex items-center justify-between">
              <h3 className="text-[20px] font-light" style={{ fontFamily: serif, color: cream }}>Construction Sites</h3>
              <Label>{data.sites.length} candidates</Label>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["Rank", "Site", "Position", "Safety"].map((h, i) => (
                      <th key={h} className={`pb-3 font-medium text-[10px] tracking-[0.15em] uppercase ${i === 3 ? "text-right" : "text-left"}`} style={{ color: "rgba(232,228,217,0.25)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.sites].sort((a, b) => a.rank - b.rank).map((site) => (
                    <tr key={site.id} className="border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 text-[13px] tabular-nums" style={{ fontFamily: mono, color: "rgba(232,228,217,0.2)" }}>{site.rank}</td>
                      <td className="py-4 text-[14px] font-semibold" style={{ color: cream }}>{site.id}</td>
                      <td className="py-4 text-[13px] tabular-nums" style={{ fontFamily: mono, color: creamDim }}>{site.x},{site.y}</td>
                      <td className="py-4 text-right text-[14px] tabular-nums font-semibold" style={{ fontFamily: mono, color: "var(--green)" }}>{(site.safety_score * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── SECTION 4: Rover Path ── */}
          <section className="rounded-2xl border border-white/[0.04] bg-white/[0.01] flex flex-col min-h-[500px]">
            <div className="shrink-0 px-8 py-6 border-b border-white/[0.04] flex items-center justify-between">
              <h3 className="text-[20px] font-light" style={{ fontFamily: serif, color: cream }}>Rover Path</h3>
              <Label>{data.path.length} waypoints</Label>
            </div>
            <div className="flex-1 overflow-auto px-8 py-8">
              {/* Vertical timeline */}
              <div className="relative pl-8">
                <div className="absolute left-[9px] top-3 bottom-3 w-px bg-white/[0.06]" />
                {data.path.map((p, i) => (
                  <div key={p.t} className="relative flex items-start gap-6 mb-8 last:mb-0">
                    <div className={`absolute left-[-23px] top-1.5 w-4 h-4 rounded-full border-2 ${i === data.path.length - 1 ? "border-white bg-white/20 shadow-[0_0_15px_rgba(255,255,255,0.4)]" : "border-white/20 bg-black"}`} />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-4">
                        <span className="text-[15px] font-semibold" style={{ color: cream }}>T{p.t}</span>
                        <span className="text-[13px] tabular-nums" style={{ fontFamily: mono, color: creamDim }}>{p.x},{p.y}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-6">
                        <span className="text-[11px]" style={{ color: "rgba(232,228,217,0.25)" }}>
                          Heading <span className="font-semibold tabular-nums ml-1" style={{ fontFamily: mono, color: creamDim }}>{p.heading}°</span>
                        </span>
                        <span className="text-[11px]" style={{ color: "rgba(232,228,217,0.25)" }}>
                          Mode <span className="font-semibold ml-1 px-2 py-0.5 rounded-full border border-white/10" style={{ color: creamDim }}>{p.mode}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── SECTION 5: System Status + Pipeline ── */}
          <section className="rounded-2xl border border-white/[0.04] bg-white/[0.01] flex flex-col min-h-[500px]">
            <div className="shrink-0 px-8 py-6 border-b border-white/[0.04]">
              <h3 className="text-[20px] font-light" style={{ fontFamily: serif, color: cream }}>System Status</h3>
            </div>
            <div className="px-8 py-4 border-b border-white/[0.04]">
              {systems.map((s) => (
                <div key={s.name} className="flex items-center justify-between py-3 border-b border-white/[0.03] last:border-b-0">
                  <span className="text-[14px] font-medium" style={{ color: creamDim }}>{s.name}</span>
                  <div className="flex items-center gap-3">
                    <StatusDot color={s.color} size={6} />
                    <span className="text-[11px] tracking-[0.1em] uppercase font-semibold" style={{ fontFamily: mono, color: s.color }}>{s.status}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 px-8 py-6 border-b border-white/[0.04]">
              <h3 className="text-[20px] font-light" style={{ fontFamily: serif, color: cream }}>Processing Pipeline</h3>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6">
              <div className="relative pl-8">
                <div className="absolute left-[9px] top-3 bottom-3 w-px bg-white/[0.04]" />
                {[
                  { step: "Camera", sub: "Preprocessing", n: "01" },
                  { step: "Segmentation", sub: "Terrain Classification", n: "02" },
                  { step: "Stereo Depth", sub: "Disparity Matching", n: "03" },
                  { step: "SLAM Fusion", sub: "Pose Estimation", n: "04" },
                  { step: "Terrain Grid", sub: "Zone Assembly", n: "05" },
                  { step: "Safety Score", sub: "Construction Rating", n: "06" },
                ].map((s) => (
                  <div key={s.step} className="relative flex items-start gap-6 mb-6 last:mb-0">
                    <div className="absolute left-[-23px] top-1 w-5 h-5 rounded-full border border-white/[0.08] flex items-center justify-center bg-white/[0.02]">
                      <span className="text-[8px] font-bold tabular-nums" style={{ fontFamily: mono, color: "var(--green)" }}>{s.n}</span>
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold" style={{ color: cream }}>{s.step}</div>
                      <div className="text-[12px] mt-1" style={{ color: "rgba(232,228,217,0.2)" }}>{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ═══ SCROLL INDICATOR ═══ */}
      <footer className="shrink-0 border-t border-white/[0.04] px-12 py-4 flex items-center justify-between bg-black">
        <span className="text-[11px] font-medium" style={{ color: creamDim }}>TerraSight</span>
        <span className="text-[9px] tracking-[0.15em] uppercase" style={{ color: "rgba(232,228,217,0.1)" }}>
          Scroll vertically ↓
        </span>
      </footer>

      {/* ═══ FULLSCREEN 2D MAP OVERLAY ═══ */}
      {show2DMap && <Fullscreen2DMap data={data} onClose={() => setShow2DMap(false)} />}
    </div>
  );
}
