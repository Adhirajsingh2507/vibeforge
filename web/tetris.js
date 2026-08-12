// ============================================================
// The Forge — every monetary item in the system rendered as a
// 3D Tetris tower of quantized glass blocks. Full blocks = whole
// units; a scaled "micro block" carries the sub-unit remainder so
// mid values read exactly. Edits animate blocks dropping / lifting.
// three.js r128 (global THREE). Monochrome, Helvetica, PC + mobile.
// ============================================================
(function () {
    if (typeof THREE === 'undefined') return;

    // ---- geometry / layout constants ----
    const BW = 0.62;        // block footprint
    const BH = 0.34;        // full-block height (world units)
    const CELL = 1.18;      // tower spacing within a group (X)
    const ROWGAP = 1.75;    // spacing between group rows (Z)
    const TARGET_BLOCKS = 12; // tallest tower ~ this many blocks
    const DROP = 6.0;       // how far above a block starts its fall
    const GROUP_ORDER = ['Cashflow', 'Budget', 'Assets', 'Bills', 'Reserves'];
    // solid greyscale shade per group (monochrome); micro block goes brighter
    const GROUP_GREY = { Cashflow: 0xe6e6e6, Budget: 0x8f8f8f, Assets: 0xf4f4f4, Bills: 0x707070, Reserves: 0xc0c0c0 };

    const BOX_GEO = new THREE.BoxGeometry(BW, BH, BW);
    const EDGE_GEO = new THREE.EdgesGeometry(BOX_GEO);

    // ---- formatting ----
    const compact = (n) => {
        n = Math.round(n); const a = Math.abs(n); let s;
        if (a >= 1e7) s = (n / 1e7).toFixed(a >= 1e8 ? 0 : 1) + 'Cr';
        else if (a >= 1e5) s = (n / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L';
        else if (a >= 1e3) s = (n / 1e3).toFixed(0) + 'k';
        else s = String(n);
        return '₹' + s.replace('.0', '');
    };
    const full = (n) => (typeof formatINR === 'function' ? formatINR(n)
        : '₹' + Math.round(n).toLocaleString('en-IN'));
    const titleCase = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());
    const niceUnit = (x) => {
        if (!(x > 0)) return 1;
        const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
        const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
        return nf * p;
    };

    // ---- data extraction: every rupee in the system ----
    function buildItems(d) {
        const { profile, budget, investments, bills } = d;
        const items = [];
        const push = (group, label, value) => { if (value > 0) items.push({ group, label, value, key: group + '|' + label }); };
        push('Cashflow', 'Income', budget.income);
        push('Cashflow', 'Expenses', budget.expenses);
        push('Cashflow', 'Disposable', Math.max(budget.disposable, 0));
        for (const [k, v] of Object.entries(budget.by_category || {})) push('Budget', titleCase(k), v);
        for (const h of investments.holdings || []) push('Assets', h.instrument, h.value);
        for (const b of bills.upcoming_bills || []) push('Bills', b.name, b.amount);
        push('Reserves', 'Savings', profile.savings_balance);
        push('Reserves', 'Emergency', profile.emergency_fund);
        return items;
    }

    let R = null; // runtime, built lazily on first open

    function init() {
        const container = document.getElementById('forge-canvas');
        const labelLayer = document.getElementById('forge-labels');
        const tooltip = document.getElementById('forge-tooltip');
        const unitReadout = document.getElementById('forge-unit');
        if (!container) return null;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        const world = new THREE.Group();
        scene.add(world);

        // lights so the solid blocks read as 3D (faces shade by orientation)
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(4, 8, 5); scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-5, 3, -4); scene.add(rim);

        // faint ground grid — monochrome
        let grid = null;
        const target = new THREE.Vector3(0, 2.0, 0);

        // orbit state (damped)
        const orbit = { theta: 0.7, phi: 1.02, radius: 16, tTheta: 0.7, tPhi: 1.02, tRadius: 16 };
        let lastInteract = 0;
        const pointers = new Map();
        let pinchDist = 0;

        function applyCamera() {
            orbit.theta += (orbit.tTheta - orbit.theta) * 0.12;
            orbit.phi += (orbit.tPhi - orbit.phi) * 0.12;
            orbit.radius += (orbit.tRadius - orbit.radius) * 0.09;
            const sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
            camera.position.set(
                target.x + orbit.radius * sp * Math.sin(orbit.theta),
                target.y + orbit.radius * cp,
                target.z + orbit.radius * sp * Math.cos(orbit.theta)
            );
            camera.lookAt(target);
        }

        // ---- pointer / touch controls ----
        let downAt = null;
        container.addEventListener('pointerdown', (e) => {
            container.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            downAt = { x: e.clientX, y: e.clientY };
            lastInteract = performance.now();
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
            }
        });
        container.addEventListener('pointermove', (e) => {
            const p = pointers.get(e.pointerId);
            if (p) { // dragging
                lastInteract = performance.now();
                if (pointers.size === 1) {
                    orbit.tTheta -= (e.clientX - p.x) * 0.006;
                    orbit.tPhi = Math.max(0.18, Math.min(1.45, orbit.tPhi - (e.clientY - p.y) * 0.006));
                }
                p.x = e.clientX; p.y = e.clientY;
                if (pointers.size === 2) {
                    const [a, b] = [...pointers.values()];
                    const d = Math.hypot(a.x - b.x, a.y - b.y);
                    if (pinchDist) orbit.tRadius = clampR(orbit.tRadius * (pinchDist / d));
                    pinchDist = d;
                }
            } else { // hover pick
                updateHover(e.clientX, e.clientY);
            }
        });
        const endPtr = (e) => {
            // a near-still release = tap → toggle inspect (mobile has no hover)
            if (downAt && e.pointerType !== 'mouse' && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8) {
                if (R.hovered) hideHover(); else updateHover(e.clientX, e.clientY);
            }
            downAt = null;
            pointers.delete(e.pointerId); if (pointers.size < 2) pinchDist = 0;
        };
        container.addEventListener('pointerup', endPtr);
        container.addEventListener('pointercancel', endPtr);
        container.addEventListener('pointerleave', () => { if (!pointers.size) hideHover(); });
        container.addEventListener('wheel', (e) => {
            e.preventDefault(); lastInteract = performance.now();
            orbit.tRadius = clampR(orbit.tRadius * (1 + e.deltaY * 0.0012));
        }, { passive: false });
        function clampR(r) { return Math.max(6, Math.min(60, r)); }

        // ---- hover / tap picking ----
        const ray = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        let hovered = null;
        function updateHover(clientX, clientY) {
            if (!R || !R.towers) return;
            const rect = container.getBoundingClientRect();
            ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            ray.setFromCamera(ndc, camera);
            const hits = ray.intersectObjects(R.picks, false);
            const t = hits.length ? hits[0].object.userData.tower : null;
            if (t !== hovered) { hovered = t; showTooltip(t); }
        }
        function hideHover() { hovered = null; showTooltip(null); }
        function showTooltip(t) {
            if (!t) { tooltip.classList.add('hidden'); return; }
            const u = R.unit;
            const fullBlocks = Math.floor(t.value / u + 1e-9);
            const rem = t.value - fullBlocks * u;
            const breakdown = rem > u * 0.02
                ? `${fullBlocks} block${fullBlocks === 1 ? '' : 's'} + ${full(rem)} (micro)`
                : `${fullBlocks} block${fullBlocks === 1 ? '' : 's'} exactly`;
            tooltip.innerHTML = `<div class="ft-name">${t.label}</div>`
                + `<div class="ft-group">${t.group}</div>`
                + `<div class="ft-val">${full(t.value)}</div>`
                + `<div class="ft-blocks">${breakdown}<br>1 block = ${full(u)}</div>`;
            tooltip.classList.remove('hidden');
        }

        function resize() {
            const w = container.clientWidth || window.innerWidth;
            const h = container.clientHeight || window.innerHeight;
            renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
        }
        window.addEventListener('resize', resize);

        R = {
            scene, camera, renderer, world, container, labelLayer, tooltip, unitReadout,
            target, orbit, resize, applyCamera, updateHover,
            towers: null, picks: [], unit: 1, grid, active: false, ticks: [],
            get lastInteract() { return lastInteract; }, get hovered() { return hovered; },
        };

        frame();
        return R;
    }

    // ---- build / diff towers from items (Tetris rebuild) ----
    function makeBlock(grey) {
        const node = new THREE.Group();
        const faceMat = new THREE.MeshLambertMaterial({ color: grey, transparent: true, opacity: 0 });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
        node.add(new THREE.Mesh(BOX_GEO, faceMat));
        node.add(new THREE.LineSegments(EDGE_GEO, edgeMat));
        return { node, faceMat, edgeMat, grey, baseEdge: 0.28, y: 0, target: 0, delay: 0, out: false };
    }

    function rebuild(items, animate) {
        const prev = R.towers || new Map();
        const unit = niceUnit(Math.max(...items.map((i) => i.value), 1) / TARGET_BLOCKS);
        R.unit = unit;
        R.unitReadout.textContent = `1 block = ${full(unit)}`;

        // group present groups, count widths for centered layout
        const groups = GROUP_ORDER.filter((g) => items.some((i) => i.group === g));
        const byGroup = {};
        groups.forEach((g) => (byGroup[g] = items.filter((i) => i.group === g)));
        const G = groups.length;

        const next = new Map();
        const picks = [];
        let maxTopY = BH;

        groups.forEach((g, gi) => {
            const row = byGroup[g];
            const z = (gi - (G - 1) / 2) * ROWGAP;
            row.forEach((it, j) => {
                const x = (j - (row.length - 1) / 2) * CELL;
                const fullBlocks = Math.floor(it.value / unit + 1e-9);
                const frac = it.value / unit - fullBlocks;
                const nMicro = frac > 0.04 ? 1 : 0;
                const nBlocks = fullBlocks + nMicro;

                let t = prev.get(it.key);
                if (t) { prev.delete(it.key); }
                else {
                    t = { key: it.key, group: g, label: it.label, value: it.value, node: new THREE.Group(), blocks: [] };
                    t.node.position.set(x, 0, z);
                    R.world.add(t.node);
                }
                t.node.position.x = x; t.node.position.z = z;
                t.value = it.value; t.group = g; t.label = it.label;

                const grey = GROUP_GREY[g] || 0xa0a0a0;
                // reconcile block count
                while (t.blocks.length < nBlocks) {
                    const b = makeBlock(grey);
                    t.node.add(b.node); t.blocks.push(b);
                }
                while (t.blocks.length > nBlocks) {
                    const b = t.blocks.pop(); b.out = true;
                }

                let topY = 0;
                t.blocks.forEach((b, bi) => {
                    b.out = false;
                    const micro = nMicro && bi === nBlocks - 1;
                    const h = micro ? BH * frac : BH;
                    // 0.9 leaves a small groove between stacked blocks (no coplanar z-fight)
                    b.node.scale.set(0.9, (micro ? Math.max(frac, 0.04) : 1) * 0.9, 0.9);
                    b.faceMat.color.setHex(micro ? 0xffffff : grey);  // micro block brighter to flag the remainder
                    b.baseEdge = micro ? 0.5 : 0.28;
                    b.target = topY + h / 2;
                    b.micro = micro;
                    if (animate) b.delay = bi * 55; // staggered Tetris drop
                    topY += h;
                });
                // start freshly-added blocks above their target
                if (animate) t.blocks.forEach((b) => { if (b.faceMat.opacity && b.y === 0 && b.node.position.y === 0) b.node.position.y = b.target + DROP; });
                t.topY = topY;
                maxTopY = Math.max(maxTopY, topY);

                // pick proxy spanning the tower
                if (!t.pick) {
                    t.pick = new THREE.Mesh(BOX_GEO, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
                    t.pick.userData.tower = t; t.node.add(t.pick);
                }
                t.pick.position.y = topY / 2;
                t.pick.scale.set(1.15, Math.max(topY / BH, 0.3), 1.15);
                picks.push(t.pick);

                // label chip
                if (!t.el) { t.el = document.createElement('div'); t.el.className = 'flabel'; R.labelLayer.appendChild(t.el); }
                t.el.innerHTML = `<b>${compact(it.value)}</b><span class="fl-sub">${it.label}</span>`;

                next.set(it.key, t);
            });
        });

        // towers that vanished: animate out and dispose
        prev.forEach((t) => { t.blocks.forEach((b) => (b.out = true)); t.removing = true; next.set('__gone_' + t.key, t); });

        R.towers = next;
        R.picks = picks;
        layoutGroupLabels(groups, byGroup);
        buildAxis(maxTopY);

        // frame the scene
        const spanX = Math.max(...groups.map((g) => byGroup[g].length)) * CELL;
        const spanZ = G * ROWGAP;
        const grid = Math.max(spanX, spanZ) + CELL * 2;
        rebuildGrid(grid);
        R.target.set(0, Math.min(maxTopY * 0.45, 3.2), 0);
        const radius = grid * 1.25 + 4;
        R.orbit.tRadius = radius;
        if (!R._framedOnce) { R.orbit.radius = radius * 1.5; R._framedOnce = true; }
    }

    function rebuildGrid(size) {
        if (R.grid) { R.world.remove(R.grid); R.grid.geometry.dispose(); R.grid.material.dispose(); }
        const div = Math.round(size / CELL);
        const g = new THREE.GridHelper(size, div, 0x555555, 0x2a2a2a);
        g.material.transparent = true; g.material.opacity = 0.4;
        R.grid = g; R.gridSize = size; R.world.add(g);
    }

    // ground group labels (projected)
    function layoutGroupLabels(groups, byGroup) {
        if (!R.groupEls) R.groupEls = [];
        R.groupEls.forEach((e) => e.remove()); R.groupEls = [];
        const G = groups.length;
        groups.forEach((g, gi) => {
            const z = (gi - (G - 1) / 2) * ROWGAP;
            const x = -(byGroup[g].length / 2) * CELL - CELL * 0.9;
            const el = document.createElement('div'); el.className = 'fgroup'; el.textContent = g;
            el.dataset.x = x; el.dataset.z = z;
            R.labelLayer.appendChild(el); R.groupEls.push(el);
        });
    }

    // vertical axis tick labels (0, 1u, 2u, ...)
    function buildAxis(maxTopY) {
        if (!R.tickEls) R.tickEls = [];
        R.tickEls.forEach((e) => e.remove()); R.tickEls = [];
        const maxBlocks = Math.ceil(maxTopY / BH);
        const stepEvery = Math.max(1, Math.ceil(maxBlocks / 8));
        R.ticks = [];
        for (let i = 0; i <= maxBlocks; i += stepEvery) {
            const el = document.createElement('div'); el.className = 'ftick';
            el.textContent = compact(i * R.unit);
            R.labelLayer.appendChild(el); R.tickEls.push(el);
            R.ticks.push({ el, y: i * BH });
        }
    }

    // ---- projection of DOM labels + block animation ----
    const _v = new THREE.Vector3();
    let _rect = { width: 0, height: 0 };
    function project(x, y, z) {
        _v.set(x, y, z).project(R.camera);
        return { x: (_v.x * 0.5 + 0.5) * _rect.width, y: (-_v.y * 0.5 + 0.5) * _rect.height, behind: _v.z > 1 };
    }

    function frame() {
        requestAnimationFrame(frame);
        if (!R || !R.active) return;
        _rect = R.container.getBoundingClientRect();

        // idle auto-rotate
        if (performance.now() - R.lastInteract > 3500 && !R.hovered) R.orbit.tTheta += 0.0016;
        R.applyCamera();

        // animate blocks (Tetris drop / lift-out)
        if (R.towers) {
            R.towers.forEach((t, key) => {
                const emphT = R.hovered === t ? 1 : 0;
                t.emph = (t.emph || 0) + (emphT - (t.emph || 0)) * 0.15;
                for (let bi = t.blocks.length - 1; bi >= 0; bi--) {
                    const b = t.blocks[bi];
                    if (b.out) {
                        b.node.position.y += 0.12 + (b.node.position.y) * 0.02;
                        b.faceMat.opacity *= 0.86; b.edgeMat.opacity *= 0.86;
                        if (b.edgeMat.opacity < 0.02) {
                            t.node.remove(b.node); b.faceMat.dispose(); b.edgeMat.dispose();
                            t.blocks.splice(bi, 1);
                        }
                        continue;
                    }
                    if (b.delay > 0) { b.delay -= 16; b.node.position.y = b.target + DROP; continue; }
                    b.node.position.y += (b.target - b.node.position.y) * 0.16;
                    b.y = b.node.position.y;
                    // fade to fully solid; hover lifts the seam definition
                    const edge = Math.min(b.baseEdge * (1 + t.emph * 1.6), 1);
                    b.faceMat.opacity += (1 - b.faceMat.opacity) * 0.18;
                    b.edgeMat.opacity += (edge - b.edgeMat.opacity) * 0.18;
                }
                if (t.removing && t.blocks.length === 0) {
                    R.world.remove(t.node); if (t.el) t.el.remove();
                    R.towers.delete(key);
                }
            });
        }

        // update DOM labels
        if (R.towers) {
            R.towers.forEach((t) => {
                if (!t.el || t.removing) { if (t.el) t.el.style.opacity = '0'; return; }
                const p = project(t.node.position.x, t.topY + 0.35, t.node.position.z);
                if (p.behind) { t.el.style.opacity = '0'; return; }
                t.el.style.left = p.x + 'px'; t.el.style.top = p.y + 'px';
                t.el.style.opacity = t.emph > 0.05 ? '1' : '0.82';
            });
        }
        if (R.groupEls) R.groupEls.forEach((el) => {
            const p = project(+el.dataset.x, 0.05, +el.dataset.z);
            el.style.opacity = p.behind ? '0' : '0.9';
            el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        });
        if (R.ticks) {
            const ax = -(R.gridSize || 12) / 2;
            const az = -(R.gridSize || 12) / 2;
            R.ticks.forEach((tk) => {
                const p = project(ax, tk.y, az);
                tk.el.style.opacity = p.behind ? '0' : '0.85';
                tk.el.style.left = p.x + 'px'; tk.el.style.top = p.y + 'px';
            });
        }

        // tooltip follows hovered tower's top
        if (R.hovered && !R.hovered.removing) {
            const p = project(R.hovered.node.position.x, R.hovered.topY + 0.6, R.hovered.node.position.z);
            R.tooltip.style.left = Math.min(p.x + 14, R.container.clientWidth - 250) + 'px';
            R.tooltip.style.top = Math.max(p.y - 20, 70) + 'px';
        }

        R.renderer.render(R.scene, R.camera);
    }

    // ---- public API ----
    window.ForgeViz = {
        open(dashboard) {
            if (!R) init();
            if (!R) return;
            R.active = true; R.resize();
            const animate = !R._openedOnce; R._openedOnce = true;
            if (dashboard) rebuild(buildItems(dashboard), true);
        },
        update(dashboard) { if (R && R.active && dashboard) rebuild(buildItems(dashboard), true); },
        close() { if (R) { R.active = false; R.tooltip.classList.add('hidden'); } },
        resize() { if (R) R.resize(); },
    };
})();
