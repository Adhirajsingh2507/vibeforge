// ============================================================
// Agent Theatre — a live map of the multi-agent reasoning flow.
// The orchestrator sits at the centre; specialists arc around it;
// the judge and the final synthesis sit below. A query runs
// /advise, then the real trace is staged step-by-step: nodes wake,
// edges draw, pulses travel, findings expand. CSS + Web Animations
// (no GSAP dependency); swap in GSAP later if the exact lib matters.
// ============================================================
(function () {
    const NODE_DEFS = [
        { id: 'orchestrator', label: 'Orchestrator', role: 'CFO · plans & routes', kind: 'core' },
        { id: 'analyze_budget', label: 'Budget', role: 'income · expenses · runway' },
        { id: 'check_affordability', label: 'Affordability', role: 'pay from savings?' },
        { id: 'evaluate_loan', label: 'Loan', role: 'EMI · income ratio' },
        { id: 'check_upcoming_bills', label: 'Bills', role: 'due this cycle' },
        { id: 'review_investments', label: 'Investment', role: 'holdings · liquidity' },
        { id: 'tax_check', label: 'Tax', role: 'GST · credits' },
        { id: 'check_fraud_risk', label: 'Fraud', role: 'merchant · UPI · URL' },
        { id: 'judge', label: 'Judge', role: 'validates findings', kind: 'judge' },
        { id: 'synthesis', label: 'Recommendation', role: 'final synthesis', kind: 'core' },
    ];
    const SPECIALISTS = NODE_DEFS.filter((n) => !n.kind).map((n) => n.id);
    const byId = Object.fromEntries(NODE_DEFS.map((n) => [n.id, n]));
    const NS = 'http://www.w3.org/2000/svg';

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
    const label = (id) => (byId[id] ? byId[id].label : id);

    let S = null; // state, built on first open

    function build() {
        const stage = document.getElementById('agents-stage');
        const svg = document.getElementById('agents-edges');
        const nodesLayer = document.getElementById('agents-nodes');
        const statusEl = document.getElementById('agents-status');
        const statusLabel = document.getElementById('agents-status-label');
        const answerEl = document.getElementById('agents-answer');
        const form = document.getElementById('agents-form');
        const input = document.getElementById('agents-input');
        if (!stage) return null;

        const nodes = {};
        for (const def of NODE_DEFS) {
            const el = document.createElement('div');
            el.className = 'anode' + (def.kind ? ' anode--' + def.kind : '');
            el.innerHTML = `<div class="anode-label"><span class="anode-dot"></span>${def.label}</div>`
                + `<div class="anode-role">${def.role}</div>`
                + (def.kind === 'core' ? `<div class="anode-thought"></div>` : '')
                + `<div class="anode-summary"></div>`;
            nodesLayer.appendChild(el);
            nodes[def.id] = el;
        }

        S = { stage, svg, nodesLayer, statusEl, statusLabel, answerEl, nodes,
            centers: {}, edges: [], runId: 0, ticker: 0 };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = input.value.trim();
            if (!q) return;
            input.value = '';
            run(q);
        });
        window.addEventListener('resize', () => { if (S) { layout(); redrawEdges(); } });
        return S;
    }

    // ---- layout: fractional positions → pixels ----
    function positions() {
        const mobile = S.stage.clientWidth < 700;
        const p = {};
        if (mobile) {
            p.orchestrator = [0.5, 0.07];
            SPECIALISTS.forEach((id, i) => { p[id] = [i % 2 ? 0.72 : 0.28, 0.19 + i * 0.083]; });
            p.judge = [0.5, 0.85];
            p.synthesis = [0.5, 0.955];
        } else {
            p.orchestrator = [0.5, 0.46];
            const rx = 0.37, ry = 0.32, n = SPECIALISTS.length;
            // sweep the upper hemisphere (leaves the bottom clear for judge + synthesis)
            SPECIALISTS.forEach((id, i) => {
                const a = (210 - (240 * i) / (n - 1)) * Math.PI / 180;
                p[id] = [0.5 + rx * Math.cos(a), 0.46 - ry * Math.sin(a)];
            });
            p.judge = [0.28, 0.9];
            p.synthesis = [0.72, 0.9];
        }
        return p;
    }
    function layout() {
        const W = S.stage.clientWidth, H = S.stage.clientHeight;
        S.svg.setAttribute('width', W); S.svg.setAttribute('height', H);
        const p = positions();
        for (const id in p) {
            const [fx, fy] = p[id];
            S.centers[id] = { x: fx * W, y: fy * H };
            const el = S.nodes[id];
            el.style.left = (fx * 100) + '%';
            el.style.top = (fy * 100) + '%';
        }
    }

    // ---- node state helpers ----
    function setState(id, s) {
        const el = S.nodes[id];
        el.classList.add('show');
        el.classList.remove('queued', 'thinking', 'done');
        if (s) el.classList.add(s);
    }
    function setSummary(id, text) { S.nodes[id].querySelector('.anode-summary').textContent = text || ''; }
    function setThought(id, text) { const t = S.nodes[id].querySelector('.anode-thought'); if (t) t.textContent = text || ''; }
    function status(text, busy) {
        S.statusLabel.textContent = text;
        S.statusEl.classList.toggle('busy', !!busy);
    }

    // ---- edges ----
    function edgeD(a, b) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const off = Math.min(len * 0.14, 46);
        return `M ${a.x} ${a.y} Q ${mx - dy / len * off} ${my + dx / len * off} ${b.x} ${b.y}`;
    }
    function addEdge(from, to) {
        if (S.edges.some((e) => e.from === from && e.to === to)) return;
        const path = document.createElementNS(NS, 'path');
        const pulse = document.createElementNS(NS, 'circle');
        pulse.setAttribute('r', '2.6'); pulse.setAttribute('class', 'edge-pulse');
        S.svg.appendChild(path); S.svg.appendChild(pulse);
        const e = { from, to, path, pulse, phase: Math.random() };
        S.edges.push(e);
        drawEdge(e, true);
    }
    function drawEdge(e, animate) {
        const a = S.centers[e.from], b = S.centers[e.to];
        if (!a || !b) return;
        e.path.setAttribute('d', edgeD(a, b));
        const len = e.path.getTotalLength();
        e.path.style.strokeDasharray = len;   // dasharray is required for the offset reveal
        e.path.style.strokeDashoffset = '0';
        if (animate) {
            e.path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
                { duration: 620, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' });
        }
    }
    function redrawEdges() { S.edges.forEach((e) => drawEdge(e, false)); }
    function clearEdges() {
        S.edges.forEach((e) => { e.path.remove(); e.pulse.remove(); });
        S.edges = [];
    }
    function tick() {
        const t = performance.now() / 1500;
        for (const e of S.edges) {
            const len = e.path.getTotalLength();
            const pt = e.path.getPointAtLength(((t + e.phase) % 1) * len);
            e.pulse.setAttribute('cx', pt.x); e.pulse.setAttribute('cy', pt.y);
        }
        S.ticker = requestAnimationFrame(tick);
    }

    // ---- reset / entrance ----
    function reset() {
        clearEdges();
        for (const id in S.nodes) { setState(id, null); setSummary(id, ''); setThought(id, ''); }
        S.answerEl.classList.add('hidden'); S.answerEl.innerHTML = '';
    }
    function entrance() {
        NODE_DEFS.forEach((def, i) => {
            const el = S.nodes[def.id];
            setTimeout(() => el.classList.add('show'), 60 + i * 55);
        });
    }

    // ---- pick the human answer (mirror chat logic) ----
    function pickAnswer(run) {
        let a = run.answer || '';
        if (/CFO'?s recommendation/i.test(a)) a = '';
        const t = (run.trace || []).filter((x) => x.agent && x.summary);
        if (!a && t.length) a = t.map((x) => x.summary).join('\n\n');
        return a || 'Done.';
    }
    function showAnswer(text, verdict) {
        let chips = '';
        if (verdict) {
            const c = [];
            if (verdict.transaction_safe !== null && verdict.transaction_safe !== undefined)
                c.push(verdict.transaction_safe ? 'Transaction safe' : 'Caution advised');
            if (verdict.risk_level && verdict.risk_level !== 'n/a') c.push('Risk: ' + verdict.risk_level);
            if (typeof verdict.confidence === 'number') c.push(Math.round(verdict.confidence * 100) + '% confidence');
            chips = c.map((x) => `<span class="aa-chip">${x}</span>`).join('');
        }
        S.answerEl.innerHTML = `<div class="aa-label">Recommendation</div>${escapeHtml(text)}`
            + (chips ? `<div class="aa-verdict">${chips}</div>` : '');
        S.answerEl.classList.remove('hidden');
    }
    const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    // ---- the staged replay ----
    async function replay(run) {
        const my = ++S.runId;
        reset();
        status('Routing your question', true);
        setState('orchestrator', 'thinking');
        setThought('orchestrator', 'Reading: “' + trunc(run.query || '', 64) + '”');
        await sleep(600); if (my !== S.runId) return;

        const agentSteps = (run.trace || []).filter((s) => s.step === 'agent' && byId[s.tool]);
        if (agentSteps.length) {
            status('Planning — selecting specialists', true);
            setThought('orchestrator', `Selecting ${agentSteps.length} specialist${agentSteps.length > 1 ? 's' : ''}…`);
            agentSteps.forEach((s) => setState(s.tool, 'queued'));
            await sleep(720); if (my !== S.runId) return;
        }

        const active = [];
        for (const s of agentSteps) {
            if (my !== S.runId) return;
            setState(s.tool, 'thinking'); addEdge('orchestrator', s.tool);
            status('Consulting ' + label(s.tool), true);
            setThought('orchestrator', 'Waiting on ' + label(s.tool) + '…');
            await sleep(520); if (my !== S.runId) return;
            setSummary(s.tool, s.summary || 'No finding.');
            setState(s.tool, 'done'); active.push(s.tool);
            await sleep(560);
        }

        const j = (run.trace || []).find((s) => s.step === 'judge');
        if (j && my === S.runId) {
            setState('judge', 'thinking');
            active.forEach((id) => addEdge(id, 'judge'));
            if (!active.length) addEdge('orchestrator', 'judge');
            status('Judge validating findings', true);
            await sleep(720); if (my !== S.runId) return;
            const conf = typeof j.confidence === 'number' ? ` · ${Math.round(j.confidence * 100)}% conf` : '';
            setSummary('judge', `${j.response_ok ? 'Findings well-founded' : 'Needs revision'} · risk ${j.risk_level}${conf}`);
            setState('judge', 'done');
            await sleep(500);
        }

        if (my !== S.runId) return;
        setState('synthesis', 'thinking');
        addEdge(j ? 'judge' : 'orchestrator', 'synthesis');
        addEdge('orchestrator', 'synthesis');
        setThought('orchestrator', 'Done — handing findings to synthesis.');
        status('Synthesising recommendation', true);
        await sleep(720); if (my !== S.runId) return;

        const answer = pickAnswer(run);
        setSummary('synthesis', trunc(answer, 150));
        setState('synthesis', 'done');
        showAnswer(answer, run.judge_verdict);
        status('Complete', false);
    }

    // ---- run a fresh query through the backend, then replay ----
    async function run(query) {
        if (!S) return;
        ++S.runId; reset();
        setState('orchestrator', 'thinking');
        setThought('orchestrator', 'Reading: “' + trunc(query, 64) + '”');
        status('Thinking…', true);
        try {
            const res = await api('/advise', { method: 'POST', body: JSON.stringify({ query, session_id: null }) });
            res.query = query;
            window.__lastRun = res;
            await replay(res);
        } catch (e) {
            status('Something went wrong — check the connection', false);
            setState('orchestrator', 'done');
        }
    }

    // ---- public API ----
    window.AgentFlow = {
        open() {
            if (!S) build();
            if (!S) return;
            layout();
            if (!S.ticker) S.ticker = requestAnimationFrame(tick);
            if (window.__lastRun && window.__lastRun.trace) { replay(window.__lastRun); }
            else { entrance(); status('Idle — ask something to begin', false); setThought('orchestrator', 'Awaiting your question.'); setState('orchestrator', 'show'); }
        },
        replay(r) { if (S && r) replay(r); },
        resize() { if (S) { layout(); redrawEdges(); } },
        close() { if (S) { ++S.runId; cancelAnimationFrame(S.ticker); S.ticker = 0; } },
    };
})();
