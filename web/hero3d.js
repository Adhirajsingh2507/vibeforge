// ============================================================
// Finora hero — a 3D arc reactor (vanilla three.js r128).
// Centre = card 05 (The Forge) as a round glass card on a lit podium;
// the other six cards are solid colour arcs curving around it.
// Desktop only; the 2D card grid stays as the fallback (mobile / reduced
// motion / init failure). No React — this repo has no build step.
//
// NOTE: I can't visually verify this here. Framing, emissive levels and the
// curved-numeral orientation are exposed in CFG for a quick tuning pass.
// ============================================================
(function () {
    const CFG = {
        cameraFov: 45,
        cameraRadius: 10.6,       // frames the outer arcs (~70% width)
        targetY: 0.5,
        autoRotateSecs: 120,      // one gentle revolution when idle
        autoResumeMs: 2600,       // idle time before the gentle spin eases back in
        friction: 0.93,           // inertia decay after a drag release
        dragSpeed: 0.006,
        azimuthClampDeg: 38,      // manual look-around limit (auto-spin is unclamped)
        polarMinDeg: 26, polarMaxDeg: 66,
        showNumerals: true,       // curved index numerals on each band
        numeralTuneRad: 0,        // add to glyph rotation if orientation looks off
        hoverLift: 0.14,
        pixelRatioMax: 2,
    };

    const AMBER = 0xffb020, TEAL = 0x3fe0d0, VIOLET = 0xa877ff;
    const ACCENTS = [AMBER, TEAL, VIOLET];
    const HEX = { [AMBER]: '#ffb020', [TEAL]: '#3fe0d0', [VIOLET]: '#a877ff' };
    const ARCS = [ // clockwise from front
        { id: 'view-budget', idx: '01', eyebrow: 'Overview', title: 'Budget & cashflow', desc: 'Net worth, cashflow and your transaction ledger.', valueSel: '#preview-net-worth', accent: 0 },
        { id: 'view-investments', idx: '02', eyebrow: 'Assets', title: 'Portfolio', desc: 'Holdings, SIP and liquidity at a glance.', valueSel: '#preview-investments', accent: 1 },
        { id: 'view-bills', idx: '03', eyebrow: 'Upcoming', title: 'Bills due', desc: "What's due this billing cycle.", valueSel: '#preview-bills', accent: 2 },
        { id: 'view-chat', idx: '04', eyebrow: 'Intelligence', title: 'AI Orchestrator', desc: 'Ask anything — the multi-agent CFO answers.', valueSel: null, accent: 0 },
        { id: 'view-agents', idx: '06', eyebrow: 'Reasoning', title: 'Agent Theatre', desc: 'Watch the agents reason, step by step.', valueSel: null, accent: 1 },
        { id: 'view-scan', idx: '07', eyebrow: 'Import', title: 'Scan a document', desc: 'Upload a bill or statement to import it.', valueSel: null, accent: 2 },
    ];
    const CENTER = { id: 'view-forge', idx: '05', eyebrow: 'Spatial', title: 'The Forge', desc: 'Every rupee as a living 3D Tetris tower.', valueSel: '#preview-net-worth', accent: 0 };
    const DEG = Math.PI / 180;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function boot() {
        // ON by default on desktop. Disable with ?hero3d=0 (persists), re-enable
        // with ?hero3d=1. The 2D grid remains the fallback everywhere else.
        const q = new URLSearchParams(location.search).get('hero3d');
        if (q === '0') { localStorage.setItem('hero3d', 'off'); return; }
        if (q === '1') localStorage.removeItem('hero3d');
        if (localStorage.getItem('hero3d') === 'off') return;

        if (typeof THREE === 'undefined') return;      // grid stays (fallback)
        if (window.innerWidth < 768) return;           // mobile → grid
        const host = document.getElementById('hero3d');
        if (!host) return;
        document.body.classList.add('hero3d-on'); // reveal host FIRST so it has real size
        try { init(host); }
        catch (e) { console.error('hero3d init failed, keeping 2D grid:', e); document.body.classList.remove('hero3d-on'); }
    }

    function init(host) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(CFG.cameraFov, 1, 0.1, 100);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, CFG.pixelRatioMax));
        host.appendChild(renderer.domElement);

        // lights (no env map; keep metalness low so metals don't read black)
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 0.7); key.position.set(3, 9, 4); scene.add(key);
        const fill = new THREE.DirectionalLight(0x99aaff, 0.25); fill.position.set(-5, 3, -4); scene.add(fill);

        const root = new THREE.Group(); scene.add(root);

        // --- shared geometry / materials ---
        const cube = new THREE.BoxGeometry(0.31, 0.31, 0.31);
        const deckMat = new THREE.MeshStandardMaterial({ color: 0x0e0e13, roughness: 0.9, metalness: 0.2 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0xb9b9c4, roughness: 0.4, metalness: 0.35 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfeefc, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false });
        const emAmber = emissive(AMBER, 1.2), emTeal = emissive(TEAL, 1.0), emCore = emissive(0x9ff0e6, 1.4);
        const blockMats = ACCENTS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.1 }));

        function emissive(c, i) {
            return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.5, metalness: 0.0 });
        }
        const ring = (inner, outer, mat, y) => { const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; return m; };
        const disc = (r, mat, y) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 96), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; return m; };

        // --- deck + podium ---
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.12, 96), deckMat);
        deck.position.y = -0.06; root.add(deck);
        const podium = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.1, 0.3, 96), metalMat);
        podium.position.y = 0.15; root.add(podium);
        const pTop = 0.31;
        root.add(ring(1.95, 2.03, emAmber, pTop));            // amber outer rim
        root.add(ring(1.42, 1.5, new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.8, metalness: 0.3 }), pTop));
        root.add(ring(0.8, 0.86, emTeal, pTop));              // teal core ring
        root.add(disc(0.72, emCore, pTop + 0.001));           // glowing core disc
        for (let i = 0; i < 10; i++) {                        // 10 coil blocks bridging rings
            const a = (i / 10) * Math.PI * 2;
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.5), metalMat);
            b.position.set(Math.cos(a) * 1.75, pTop + 0.06, Math.sin(a) * 1.75); b.rotation.y = -a;
            root.add(b);
        }

        // --- round glass card (centre = The Forge) ---
        const cardGroup = new THREE.Group(); cardGroup.position.y = pTop; root.add(cardGroup);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.62, 64, 1, true), glassMat);
        glass.position.y = 0.81; cardGroup.add(glass);
        cardGroup.add(disc(1.6, glassMat, 1.62));                                  // glass top
        const rimBand = new THREE.Mesh(new THREE.CylinderGeometry(1.63, 1.63, 0.34, 64, 1, true), metalMat);
        rimBand.position.y = 1.45; cardGroup.add(rimBand);
        cardGroup.add(ring(1.5, 1.63, emAmber, 1.63));                              // amber top edge ring
        const baseBand = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.14, 64, 1, true), metalMat);
        baseBand.position.y = 0.07; cardGroup.add(baseBand);

        // inner block cluster (compact static representation of the Forge, same accent colours)
        const blocks = new THREE.Group(); blocks.position.y = 0.16; cardGroup.add(blocks);
        let n = 0;
        for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
            const h = 2 + ((gx + gz + 2) % 3);                                      // 2..4 layers
            for (let ly = 0; ly < h && n < 22; ly++, n++) {
                const b = new THREE.Mesh(cube, blockMats[(gx + gz + 9) % 3]);
                b.position.set(gx * 0.34, ly * 0.34 + 0.17, gz * 0.34);
                blocks.add(b);
            }
        }

        // centre click target
        const centerHit = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.7, 24), new THREE.MeshBasicMaterial({ visible: false }));
        centerHit.position.y = pTop + 0.85; centerHit.userData.route = 'view-forge'; root.add(centerHit);

        // --- the six arcs ---
        const arcs = [];
        const pick = [centerHit];
        ARCS.forEach((cfg, i) => {
            const g = new THREE.Group();
            const start = -i * 60 * DEG;                    // 46° band + 14° gap = 60° slot
            const accent = ACCENTS[cfg.accent];
            const bandMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.18, roughness: 0.45, metalness: 0.2 });
            const band = new THREE.Mesh(arcBandGeo(3.05, 3.56, 3.33, 46 * DEG), bandMat);
            band.position.y = 0.02; band.userData.arc = i; g.add(band); pick.push(band);
            // head block at the leading edge
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.5), bandMat);
            head.position.set(Math.cos(0) * 3.33, 0.19, Math.sin(0) * 3.33);
            head.userData.arc = i; g.add(head); pick.push(head);
            // supporting sweeps
            g.add(sweepBand(3.79, 3.85, 46 * DEG, 0.07, new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.08, roughness: 0.7, metalness: 0.1 })));
            g.add(sweepBand(2.85, 2.95, 46 * DEG, 0.1, new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.22, roughness: 0.5, metalness: 0.1 })));
            if (CFG.showNumerals) g.add(numeral(cfg.idx, 3.33, 12 * DEG));
            g.rotation.y = start;
            root.add(g);
            arcs.push({ cfg, group: g, band, head, mat: bandMat, baseY: 0, i });
        });

        // --- soft contact shadow (baked radial, no shadow map) ---
        const shadowTex = radialShadow();
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; root.add(shadow);

        // --- premium hover pop-up ---
        const label = document.createElement('div'); label.className = 'hero-label'; host.appendChild(label);
        let hoverIdx = -1;                        // -1 none, 'c' centre, 0..n an arc
        const labelPx = { x: 0, y: 0 }; let labelInit = false;

        // --- camera: free auto-spin + clamped manual look-around, with inertia ---
        const base = spherical(0.38, 2.0, 0.95);
        const clampAz = CFG.azimuthClampDeg * DEG, pMin = CFG.polarMinDeg * DEG, pMax = CFG.polarMaxDeg * DEG;
        const AUTO = (Math.PI * 2) / (CFG.autoRotateSecs * 60);
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const orb = {
            autoAngle: 0, autoSpeed: reduced ? 0 : AUTO,
            mTheta: 0, mtTheta: 0, vTheta: 0,     // manual azimuth offset (damped, clamped)
            phi: base.phi, tPhi: base.phi, vPhi: 0,
            radius: CFG.cameraRadius, dragging: false, lastInteract: -1e9,
        };
        const target = new THREE.Vector3(0, CFG.targetY, 0);
        function stepCamera(now) {
            const idle = now - orb.lastInteract, hovering = hoverIdx !== -1;
            const wantAuto = !reduced && !orb.dragging && !hovering && idle > CFG.autoResumeMs;
            orb.autoSpeed += ((wantAuto ? AUTO : 0) - orb.autoSpeed) * 0.03;   // ease the spin in / out
            orb.autoAngle += orb.autoSpeed;
            if (!orb.dragging) {                  // inertia after a fling
                orb.mtTheta += orb.vTheta; orb.tPhi += orb.vPhi;
                orb.vTheta *= CFG.friction; orb.vPhi *= CFG.friction;
                if (Math.abs(orb.vTheta) < 1e-5) orb.vTheta = 0;
                if (Math.abs(orb.vPhi) < 1e-5) orb.vPhi = 0;
            }
            const cA = clamp(orb.mtTheta, -clampAz, clampAz); if (cA !== orb.mtTheta) orb.vTheta = 0; orb.mtTheta = cA;
            const cP = clamp(orb.tPhi, pMin, pMax); if (cP !== orb.tPhi) orb.vPhi = 0; orb.tPhi = cP;
            const s = orb.dragging ? 0.3 : 0.08;  // snappier while dragging, silky on settle
            orb.mTheta += (orb.mtTheta - orb.mTheta) * s;
            orb.phi += (orb.tPhi - orb.phi) * s;
            const theta = orb.autoAngle + orb.mTheta, sp = Math.sin(orb.phi);
            camera.position.set(
                target.x + orb.radius * sp * Math.sin(theta),
                target.y + orb.radius * Math.cos(orb.phi),
                target.z + orb.radius * sp * Math.cos(theta));
            camera.lookAt(target);
        }

        // --- pointer: drag to look around (inertia), hover for detail, click to route ---
        const el = renderer.domElement; el.style.cursor = 'grab';
        let last = null;
        el.addEventListener('pointerdown', (e) => {
            orb.dragging = true; orb.lastInteract = performance.now(); orb.vTheta = orb.vPhi = 0;
            last = { x: e.clientX, y: e.clientY, moved: 0 };
            el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; setHover(-1);
        });
        el.addEventListener('pointerup', () => { orb.dragging = false; el.style.cursor = 'grab'; });
        el.addEventListener('pointermove', (e) => {
            if (orb.dragging && last) {
                const dx = e.clientX - last.x, dy = e.clientY - last.y;
                orb.mtTheta -= dx * CFG.dragSpeed; orb.tPhi -= dy * CFG.dragSpeed;
                orb.vTheta = -dx * CFG.dragSpeed * 0.6; orb.vPhi = -dy * CFG.dragSpeed * 0.6;   // fling
                orb.lastInteract = performance.now();
                last = { x: e.clientX, y: e.clientY, moved: last.moved + Math.abs(dx) + Math.abs(dy) };
            } else { hover(e.clientX, e.clientY); }
        });
        el.addEventListener('pointerleave', () => { if (!orb.dragging) setHover(-1); });
        el.addEventListener('click', (e) => {
            if (last && last.moved > 6) return;   // was a drag, not a click
            hover(e.clientX, e.clientY);          // fresh pick at the click point (pointerdown cleared hover)
            if (hoverIdx === 'c') route(CENTER.id);
            else if (typeof hoverIdx === 'number' && hoverIdx >= 0) route(ARCS[hoverIdx].id);
        });
        function route(id) { if (window.openDetail) window.openDetail(id); }

        // --- hover picking ---
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        function hover(cx, cy) {
            const r = el.getBoundingClientRect();
            ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
            ray.setFromCamera(ndc, camera);
            const hit = ray.intersectObjects(pick, false)[0];
            setHover(!hit ? -1 : (hit.object.userData.route ? 'c' : hit.object.userData.arc));
        }
        function setHover(idx) {
            if (idx === hoverIdx) return; hoverIdx = idx;
            const dim = idx !== -1 && idx !== 'c';
            arcs.forEach((a, i) => { a.hovered = i === idx; a.dimmed = dim && i !== idx; });
            if (!orb.dragging) el.style.cursor = idx === -1 ? 'grab' : 'pointer';
            if (idx === 'c') showLabel(CENTER, true, null);
            else if (typeof idx === 'number' && idx >= 0) showLabel(arcs[idx].cfg, false, arcs[idx]);
            else { label.classList.remove('show'); label._anchor = null; }
        }
        function showLabel(cfg, isCenter, arc) {
            const val = cfg.valueSel ? (document.querySelector(cfg.valueSel)?.textContent || '') : '';
            label.style.setProperty('--acc', HEX[ACCENTS[cfg.accent]]);
            label.innerHTML =
                `<div class="hl-eyebrow">${cfg.idx} · ${cfg.eyebrow.toUpperCase()}</div>` +
                `<div class="hl-title">${cfg.title}</div>` +
                `<div class="hl-desc">${cfg.desc}</div>` +
                (val ? `<div class="hl-value">${val}</div>` : '') +
                `<div class="hl-link">Open →</div>`;
            label.classList.remove('show'); void label.offsetWidth; label.classList.add('show'); // retrigger pop
            label._anchor = isCenter
                ? new THREE.Vector3(0, pTop + 2.0, 0)
                : new THREE.Vector3(Math.cos(arc.group.rotation.y) * 3.95, 0.55, Math.sin(arc.group.rotation.y) * 3.95);
        }

        // --- resize ---
        function resize() {
            const w = host.clientWidth || 1, h = host.clientHeight || 1;
            renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
        }
        window.addEventListener('resize', resize); resize();
        if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
        requestAnimationFrame(resize);

        // --- mount + per-frame animation state ---
        const t0 = performance.now();
        arcs.forEach((a) => { a.reveal = reduced ? 1 : 0; a.lift = 0; a.emph = 0; });
        const _v = new THREE.Vector3();
        const emAmberBase = emAmber.emissiveIntensity;
        let centerLift = 0, emAmberEase = emAmberBase;

        function frame() {
            requestAnimationFrame(frame);
            const home = document.getElementById('home-view');
            if (document.hidden || (home && home.classList.contains('dim'))) return; // pause when a detail view is open
            const now = performance.now();

            stepCamera(now);

            // arcs: staggered mount + eased hover lift / emphasis / dim
            const el0 = now - t0;
            arcs.forEach((a, i) => {
                if (!reduced) { const p = clamp((el0 - i * 90) / 520, 0, 1); a.reveal += (p - a.reveal) * 0.2; a.group.visible = a.reveal > 0.01; }
                const tLift = a.hovered ? CFG.hoverLift : 0;
                a.lift += (tLift - a.lift) * 0.18;
                const tEmph = a.hovered ? 1 : (a.dimmed ? -1 : 0);
                a.emph += (tEmph - a.emph) * 0.15;
                a.mat.emissiveIntensity = Math.max(0.05, 0.2 + a.emph * 0.42);
                a.group.position.y = a.lift;
                const hoverScale = 1 + Math.max(a.emph, 0) * 0.045;
                a.group.scale.setScalar((0.9 + a.reveal * 0.1) * hoverScale);
            });

            // centre Forge: lift + power-up glow on hover
            const cHover = hoverIdx === 'c';
            centerLift += ((cHover ? 0.14 : 0) - centerLift) * 0.14;
            cardGroup.position.y = pTop + centerLift;
            emAmberEase += ((cHover ? emAmberBase * 1.7 : emAmberBase) - emAmberEase) * 0.12;
            emAmber.emissiveIntensity = emAmberEase;

            // label follows its anchor smoothly (premium, no snapping)
            if (label._anchor) {
                _v.copy(label._anchor).project(camera);
                const r = host.getBoundingClientRect();
                const tx = (_v.x * 0.5 + 0.5) * r.width, ty = (-_v.y * 0.5 + 0.5) * r.height;
                if (!labelInit) { labelPx.x = tx; labelPx.y = ty; labelInit = true; }
                labelPx.x += (tx - labelPx.x) * 0.3; labelPx.y += (ty - labelPx.y) * 0.3;
                label.style.left = labelPx.x + 'px'; label.style.top = labelPx.y + 'px';
            }
            renderer.render(scene, camera);
        }
        frame();
    }

    // ---- geometry helpers ----
    function arcBandGeo(rInner, rOutLead, rOutTail, sweep, seg = 28) {
        const shape = new THREE.Shape();
        for (let i = 0; i <= seg; i++) { const t = i / seg, a = t * sweep, rO = rOutLead + (rOutTail - rOutLead) * t; const x = Math.cos(a) * rO, y = Math.sin(a) * rO; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
        for (let i = seg; i >= 0; i--) { const a = (i / seg) * sweep; shape.lineTo(Math.cos(a) * rInner, Math.sin(a) * rInner); }
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false, curveSegments: seg });
        geo.rotateX(-Math.PI / 2);
        return geo;
    }
    function sweepBand(rInner, rOuter, sweep, height, mat) {
        const geo = new THREE.RingGeometry(rInner, rOuter, 40, 1, 0, sweep);
        const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = height / 2; return m;
    }
    function numeral(text, radius, startA) {
        const group = new THREE.Group();
        const step = 4.4 * Math.PI / 180;
        [...text].forEach((ch, i) => {
            const a = startA + i * step;
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: glyphTex(ch), transparent: true, depthWrite: false }));
            plane.position.set(Math.cos(a) * radius, 0.22, Math.sin(a) * radius);
            plane.rotation.order = 'YXZ';
            plane.rotation.y = -a - Math.PI / 2 + CFG.numeralTuneRad;
            plane.rotation.x = -Math.PI / 2;
            group.add(plane);
        });
        return group;
    }
    const _glyphCache = {};
    function glyphTex(ch) {
        if (_glyphCache[ch]) return _glyphCache[ch];
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128);
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = 'bold 92px "Helvetica Neue", Helvetica, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(ch, 64, 68);
        const t = new THREE.CanvasTexture(c); t.anisotropy = 4; _glyphCache[ch] = t; return t;
    }
    function radialShadow() {
        const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
        const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
        g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(c);
    }
    function spherical(x, y, z) {
        const len = Math.hypot(x, y, z);
        return { theta: Math.atan2(x, z), phi: Math.acos(y / len) };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
