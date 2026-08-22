"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

async function tryJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function loadTiles(): Promise<TileData[]> {
  const base = API || "/api/backend";
  try {
    return await tryJson(`${base}/map/tiles`);
  } catch {
    return await tryJson("/mock/tiles.json");
  }
}

const ZONE_COLORS: Record<number, string> = {
  0: "#34D399", // safe — emerald
  1: "#60A5FA", // nav — sky
  2: "#FBBF24", // geological — gold
  3: "#F87171", // hazard — rose
};

const ZONE_LABELS: Record<number, string> = {
  0: "Construction Safe",
  1: "Navigation Only",
  2: "Geological Interest",
  3: "Hazard Zone",
};

const CLASS_LABELS: Record<string, string> = {
  compact_soil: "Compact Soil",
  soil: "Soil",
  loose_soil: "Loose Soil",
  rock: "Rock",
  crater: "Crater",
  shadow: "Shadow",
  waterbed: "Waterbed",
  mineral_edge: "Mineral Edge",
  unknown: "Unknown",
};

interface TileData {
  x: number;
  y: number;
  z: number;
  class: string;
  slope: number;
  safety_score: number;
  zone: number;
}


export default function TerrainPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [tileCount, setTileCount] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    let destroyed = false;

    async function init() {
      const THREE = await import("three");
      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      const gsap = (await import("gsap")).default;

      if (destroyed) return;

      const tiles = await loadTiles();
      setTileCount(tiles.length);
      const cols = Math.max(...tiles.map((t) => t.x)) + 1;

      // ── Scene ──
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x080810, 0.008);

      // Background sphere
      const bgGeom = new THREE.SphereGeometry(80, 32, 32);
      const bgMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          colorTop: { value: new THREE.Color(0x0a0a18) },
          colorBottom: { value: new THREE.Color(0x0d0d14) },
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform vec3 colorTop;
          uniform vec3 colorBottom;
          varying vec3 vWorldPosition;
          void main() {
            float h = normalize(vWorldPosition).y * 0.5 + 0.5;
            gl_FragColor = vec4(mix(colorBottom, colorTop, h), 1.0);
          }
        `,
      });
      scene.add(new THREE.Mesh(bgGeom, bgMat));

      // ── Camera ──
      const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        200
      );
      camera.position.set(28, 32, 40);
      camera.lookAt(0, 0, 0);

      // ── Renderer ──
      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current!,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      // ── Broad overhead sunlight ──
      scene.add(new THREE.AmbientLight(0xfff5e6, 0.6));

      // Main sun — high, slightly angled, broad coverage
      const sun = new THREE.DirectionalLight(0xfff8f0, 2.5);
      sun.position.set(10, 50, 8);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 4096;
      sun.shadow.mapSize.height = 4096;
      sun.shadow.camera.left = -35;
      sun.shadow.camera.right = 35;
      sun.shadow.camera.top = 35;
      sun.shadow.camera.bottom = -35;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 100;
      sun.shadow.bias = -0.0003;
      sun.shadow.radius = 6;
      scene.add(sun);

      // Sky fill — soft blue from opposite side
      const skyFill = new THREE.DirectionalLight(0xaaccff, 0.8);
      skyFill.position.set(-15, 35, -10);
      scene.add(skyFill);

      // Hemisphere — warm sky, cool ground bounce
      const hemi = new THREE.HemisphereLight(0xffe8cc, 0x334466, 0.5);
      scene.add(hemi);

      // Subtle ground bounce for glass underside
      const groundBounce = new THREE.PointLight(0xffddbb, 0.3, 60);
      groundBounce.position.set(0, -1, 0);
      scene.add(groundBounce);

      // Environment map for glass reflections
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(
        new THREE.SphereGeometry(5),
        new THREE.MeshBasicMaterial({ color: 0x556677, side: THREE.BackSide })
      ));
      const envRT = pmremGenerator.fromScene(envScene);
      scene.environment = envRT.texture;
      pmremGenerator.dispose();

      // ── Controls ──
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 12;
      controls.maxDistance = 80;
      controls.maxPolarAngle = Math.PI / 2 - 0.05;
      controls.minPolarAngle = 0.15;
      controls.target.set(0, 1, 0);
      controls.update();

      // ── Grid floor ──
      const floorGeom = new THREE.PlaneGeometry(60, 60);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0d0d14,
        metalness: 0.8,
        roughness: 0.6,
        transparent: true,
        opacity: 0.6,
      });
      const floor = new THREE.Mesh(floorGeom, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.01;
      floor.receiveShadow = true;
      scene.add(floor);

      const gridHelper = new THREE.GridHelper(56, 112, 0x1a1a2e, 0x12121e);
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.3;
      scene.add(gridHelper);

      // ── Block creation ──
      const BLOCK_SIZE = 0.55;
      const BLOCK_GAP = 0.04;
      const STRIDE = BLOCK_SIZE + BLOCK_GAP;
      const blockMeshes: THREE.Mesh[] = [];
      const blockData: TileData[] = [];

      const offsetX = (cols * STRIDE) / 2;
      const offsetZ = (cols * STRIDE) / 2;

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const color = ZONE_COLORS[tile.zone] || "#666666";
        const height = Math.max(0.3, tile.safety_score * 2.5);

        const geom = new THREE.BoxGeometry(
          BLOCK_SIZE - 0.04,
          height,
          BLOCK_SIZE - 0.04
        );

        const hsl = { h: 0, s: 0, l: 0 };
        new THREE.Color(color).getHSL(hsl);

        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.15,
          metalness: 0.35,
          roughness: 0.25,
          transparent: true,
          opacity: 0,
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Edge wireframe
        const edges = new THREE.EdgesGeometry(geom, 15);
        const wire = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(color).multiplyScalar(1.3),
            transparent: true,
            opacity: 0.15,
          })
        );
        mesh.add(wire);

        // Target position
        const tx = tile.x * STRIDE - offsetX;
        const tz = tile.y * STRIDE - offsetZ;
        const ty = height / 2 + 0.06;

        mesh.userData = { tile, targetY: ty, wire, mat };

        // Start above — will drop in
        mesh.position.set(tx, ty + 12 + Math.random() * 6, tz);
        mesh.scale.set(1, 1, 1);
        scene.add(mesh);
        blockMeshes.push(mesh);
        blockData.push(tile);

        // Staggered Tetris-style drop animation
        const delay = i * 0.003 + Math.random() * 0.08;

        gsap.to(mat, {
          opacity: 1,
          duration: 0.15,
          delay,
          ease: "power1.in",
        });

        const tl = gsap.timeline({ delay });

        // Fall
        tl.to(mesh.position, {
          y: ty,
          duration: 0.45,
          ease: "power2.in",
        });

        // Squash on impact
        tl.to(
          mesh.scale,
          {
            y: 0.75,
            x: 1.12,
            z: 1.12,
            duration: 0.08,
            ease: "power2.out",
          },
          "-=0.02"
        );

        // Bounce
        tl.to(mesh.position, {
          y: ty + 0.1,
          duration: 0.1,
          ease: "power2.out",
        });

        tl.to(
          mesh.scale,
          {
            y: 1.04,
            x: 0.97,
            z: 0.97,
            duration: 0.1,
            ease: "power2.out",
          },
          "<"
        );

        // Settle
        tl.to(mesh.position, {
          y: ty,
          duration: 0.08,
          ease: "power2.inOut",
        });

        tl.to(
          mesh.scale,
          { y: 1, x: 1, z: 1, duration: 0.08, ease: "power2.inOut" },
          "<"
        );

        // Landing flash
        tl.to(
          mat,
          { emissiveIntensity: 0.5, duration: 0.05 },
          "-=0.2"
        );
        tl.to(mat, {
          emissiveIntensity: 0.08,
          duration: 0.35,
          ease: "power2.out",
        });
      }

      // ── Raycasting / hover ──
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let hoveredMesh: THREE.Mesh | null = null;

      function onMouseMove(e: MouseEvent) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(blockMeshes, false);

        if (intersects.length > 0) {
          const hit = intersects[0].object as THREE.Mesh;
          if (hit !== hoveredMesh) {
            // Unhover previous
            if (hoveredMesh) {
              const prev = hoveredMesh.userData;
              gsap.to(prev.mat, {
                emissiveIntensity: 0.08,
                duration: 0.3,
              });
              gsap.to(hoveredMesh.scale, {
                x: 1, y: 1, z: 1,
                duration: 0.3,
                ease: "power2.out",
              });
            }
            hoveredMesh = hit;
            const ud = hit.userData;
            gsap.to(ud.mat, {
              emissiveIntensity: 0.45,
              duration: 0.2,
            });
            gsap.to(hit.scale, {
              x: 1.08, y: 1.08, z: 1.08,
              duration: 0.2,
              ease: "power2.out",
            });
          }

          // Tooltip
          if (tooltipRef.current && hit.userData.tile) {
            const t = hit.userData.tile as TileData;
            tooltipRef.current.style.opacity = "1";
            tooltipRef.current.style.transform = "translateY(0) scale(1)";
            tooltipRef.current.style.left = `${e.clientX + 18}px`;
            tooltipRef.current.style.top = `${e.clientY - 18}px`;
            tooltipRef.current.innerHTML = `
              <div style="color:${ZONE_COLORS[t.zone]};font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">
                ${ZONE_LABELS[t.zone]}
              </div>
              <div style="font-family:var(--font-mono,'monospace');font-size:13px;color:#f0f0f5;margin-bottom:6px">
                Score: ${(t.safety_score * 100).toFixed(1)}%
              </div>
              <div style="font-size:11px;color:rgba(240,240,245,0.5);line-height:1.5">
                ${CLASS_LABELS[t.class] || t.class}<br>
                Slope: ${t.slope}° · Cell (${t.x},${t.y})<br>
                5 m² · Elev ${t.z.toFixed(1)}m
              </div>
            `;
          }
        } else {
          if (hoveredMesh) {
            const prev = hoveredMesh.userData;
            gsap.to(prev.mat, {
              emissiveIntensity: 0.08,
              duration: 0.3,
            });
            gsap.to(hoveredMesh.scale, {
              x: 1, y: 1, z: 1,
              duration: 0.3,
              ease: "power2.out",
            });
            hoveredMesh = null;
          }
          if (tooltipRef.current) {
            tooltipRef.current.style.opacity = "0";
            tooltipRef.current.style.transform = "translateY(4px) scale(0.95)";
          }
        }
      }

      canvasRef.current!.addEventListener("mousemove", onMouseMove);

      // ── Stats panel ──
      if (statsRef.current) {
        const safe = tiles.filter((t) => t.zone === 0).length;
        const nav = tiles.filter((t) => t.zone === 1).length;
        const geo = tiles.filter((t) => t.zone === 2).length;
        const haz = tiles.filter((t) => t.zone === 3).length;
        const avgScore =
          tiles.reduce((a, t) => a + t.safety_score, 0) / tiles.length;
        statsRef.current.innerHTML = `
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:rgba(240,240,245,0.35);margin-bottom:8px">Zone Distribution</div>
            ${[
              { label: "Safe", count: safe, color: ZONE_COLORS[0] },
              { label: "Navigation", count: nav, color: ZONE_COLORS[1] },
              { label: "Geological", count: geo, color: ZONE_COLORS[2] },
              { label: "Hazard", count: haz, color: ZONE_COLORS[3] },
            ]
              .map(
                (z) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;margin-bottom:4px;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid transparent;transition:all 150ms">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:8px;height:8px;border-radius:50%;background:${z.color};box-shadow:0 0 8px ${z.color}44"></div>
                  <span style="font-size:13px;font-weight:500;color:rgba(240,240,245,0.6)">${z.label}</span>
                </div>
                <span style="font-family:monospace;font-size:13px;font-weight:500;color:#f0f0f5">${z.count}</span>
              </div>
            `
              )
              .join("")}
          </div>
          <div style="height:1px;background:rgba(255,255,255,0.08);margin:16px 0"></div>
          <div>
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:rgba(240,240,245,0.35);margin-bottom:8px">Overview</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:rgba(240,240,245,0.5)">Total Blocks</span>
              <span style="font-family:monospace;font-size:12px;color:#f0f0f5">${tiles.length}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:rgba(240,240,245,0.5)">Coverage</span>
              <span style="font-family:monospace;font-size:12px;color:#f0f0f5">${tiles.length * 5} m²</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:rgba(240,240,245,0.5)">Avg Safety</span>
              <span style="font-family:monospace;font-size:12px;color:${ZONE_COLORS[0]}">${(avgScore * 100).toFixed(1)}%</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="font-size:12px;color:rgba(240,240,245,0.5)">Grid</span>
              <span style="font-family:monospace;font-size:12px;color:#f0f0f5">${cols} × ${Math.ceil(tiles.length / cols)}</span>
            </div>
          </div>
        `;
      }

      setLoaded(true);

      // ── Resize ──
      function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      window.addEventListener("resize", onResize);

      // ── Render loop ──
      function animate() {
        if (destroyed) return;
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      return () => {
        destroyed = true;
        window.removeEventListener("resize", onResize);
        canvasRef.current?.removeEventListener("mousemove", onMouseMove);
        renderer.dispose();
        scene.clear();
      };
    }

    const cleanup = init();
    return () => {
      destroyed = true;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#0a0a0f",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#f0f0f5",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
        }}
      />

      {/* Header */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          background:
            "linear-gradient(180deg, rgba(10,10,15,0.85) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: -0.5,
              background:
                "linear-gradient(135deg, #f0f0f5 0%, rgba(240,240,245,0.7) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            TerraSight
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase" as const,
              letterSpacing: 1,
              color: "rgba(240,240,245,0.35)",
              marginLeft: 8,
            }}
          >
            Terrain Overview
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "flex-end",
            gap: 2,
            pointerEvents: "auto",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase" as const,
              letterSpacing: 1,
              color: "rgba(240,240,245,0.35)",
            }}
          >
            Total Coverage
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 22,
              fontWeight: 500,
              background: "linear-gradient(135deg, #10B981, #3B82F6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {(tileCount * 5).toLocaleString()} m²
          </span>
        </div>
      </div>

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 80,
          right: 20,
          width: 260,
          zIndex: 100,
          padding: 24,
          background: "rgba(15,15,25,0.65)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: -0.2,
            marginBottom: 20,
          }}
        >
          Terrain Intelligence
        </div>
        <div ref={statsRef} />
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          zIndex: 200,
          padding: "10px 14px",
          background: "rgba(10,10,20,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          pointerEvents: "none",
          opacity: 0,
          transform: "translateY(4px) scale(0.95)",
          transition: "opacity 150ms, transform 150ms",
          boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          maxWidth: 220,
        }}
      />

      {/* Bottom instruction */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          gap: 20,
          padding: "10px 20px",
          background: "rgba(15,15,25,0.65)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 100,
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(240,240,245,0.5)",
          whiteSpace: "nowrap" as const,
          animation: "instructFade 8s ease forwards",
        }}
      >
        <span>🖱 Orbit · Scroll to zoom</span>
        <span>◻ Hover blocks for data</span>
        <span>Each block = 5 m²</span>
      </div>

      <style>{`
        @keyframes instructFade {
          0%, 70% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(10px); pointer-events: none; }
        }
      `}</style>
    </div>
  );
}
