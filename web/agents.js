// ============================================================
// Agent Theatre — a Swiss/International-style reasoning grid with
// an interconnect layer. Strict modular grid, Helvetica, hairline
// rules, numeric labels. Orthogonal connectors thread the active
// agents in execution order — routed through the grid gutters so
// they never cross cell text — with a travelling pulse. The real
// /advise trace drives every state change (Idle→Queued→Running→Done).
// ============================================================
(function () {
    const NODE_DEFS = [
        { id: 'orchestrator', idx: '00', label: 'Orchestrator', role: 'CFO · plans & routes', span: true },
        { id: 'analyze_budget', idx: '01', label: 'Budget', role: 'income · expenses · runway' },
        { id: 'check_affordability', idx: '02', label: 'Affordability', role: 'pay from savings?' },
        { id: 'evaluate_loan', idx: '03', label: 'Loan', role: 'EMI · income ratio' },
        { id: 'check_upcoming_bills', idx: '04', label: 'Bills', role: 'due this cycle' },
        { id: 'review_investments', idx: '05', label: 'Investment', role: 'holdings · liquidity' },
        { id: 'tax_check', idx: '06', label: 'Tax', role: 'GST · credits' },
        { id: 'check_fraud_risk', idx: '07', label: 'Fraud', role: 'merchant · UPI · URL' },
        { id: 'judge', idx: '08', label: 'Judge', role: 'validates findings', span: true },
        { id: 'synthesis', idx: '09', label: 'Recommendation', role: 'final synthesis', span: true },
    ];
    const byId = Object.fromEntries(NODE_DEFS.map((n) => [n.id, n]));
    const NS = 'http://www.w3.org/2000/svg';
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    let S = null;

    function build() {
        const grid = document.getElementById('agents-grid');
        const progressEl = document.getElementById('agents-progress');
        const form = document.getElementById('agents-form');
        const input = document.getElementById('agents-input');
        if (!grid) return null;

        grid.innerHTML = '';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'agents-wire'); svg.setAttribute('aria-hidden', 'true');
        const thread = document.createElementNS(NS, 'path'); thread.setAttribute('class', 'wire-thread');
        const pulse = document.createElementNS(NS, 'circle'); pulse.setAttribute('r', '2.8'); pulse.setAttribute('class', 'wire-pulse');
        svg.appendChild(thread); svg.appendChild(pulse);
        grid.appendChild(svg);

        const cells = {};
        for (const d of NODE_DEFS) {
            const el = document.createElement('div');
            el.className = 'acell is-idle' + (d.span ? ' acell--span' : '')
                + (d.id === 'orchestrator' || d.id === 'synthesis' ? ' acell--core' : '');
            el.innerHTML =
                `<div class="acell-top"><span class="acell-idx">${d.idx}</span><span class="acell-state">Idle</span></div>`
                + `<div class="acell-name">${d.label}</div>`
                + `<div class="acell-role">${d.role}</div>`
                + `<div class="acell-body"></div>`;
            grid.appendChild(el);
            cells[d.id] = el;
        }

        S = { grid, progressEl, cells, svg, thread, pulse, segs: [], runId: 0, ticker: 0 };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = input.value.trim();
            if (!q) return;
            input.value = '';
            run(q);
        });
        window.addEventListener('resize', () => { if (S) { sizeWire(); redrawWires(); } });
        return S;
    }

    // ---- cell state ----
    const STATE_TXT = { idle: 'Idle', queued: 'Queued', running: 'Running', done: 'Done' };
    function setCell(id, state) {
        const el = S.cells[id]; if (!el) return;
        el.classList.remove('is-idle', 'is-queued', 'is-running', 'is-done');
        el.classList.add('is-' + state);
        el.querySelector('.acell-state').textContent = STATE_TXT[state] || state;
    }
    function setBody(id, text) { const el = S.cells[id]; if (el) el.querySelector('.acell-body').textContent = text || ''; }
    function setBodyHTML(id, html) { const el = S.cells[id]; if (el) el.querySelector('.acell-body').innerHTML = html; }
    function progress(done, total) { S.progressEl.textContent = String(done).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'); }

    // ---- wires ----
    function sizeWire() { if (S.svg) S.svg.style.height = S.grid.scrollHeight + 'px'; }
    function anchor(id) {
        const el = S.cells[id];
        const l = el.offsetLeft, t = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
        return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
    }
    // orthogonal route between two cells, kept in the gutters (never over cell text)
    function routePath(a, b) {
        if (Math.abs(a.cy - b.cy) < 6) {          // same row → straight through the vertical gutter
            return b.l >= a.r ? `M ${a.r} ${a.cy} H ${b.l}` : `M ${a.l} ${a.cy} H ${b.r}`;
        }
        const down = a.cy < b.cy;                  // vertical: exit lower/upper edge, jog along the row gutter
        const ay = down ? a.b : a.t, by = down ? b.t : b.b;
        const midY = down ? (a.b + b.t) / 2 : (b.b + a.t) / 2;
        return `M ${a.cx} ${ay} V ${midY} H ${b.cx} V ${by}`;
    }
    function addWire(fromId, toId, animate) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('class', 'seg');
        S.svg.insertBefore(path, S.thread);
        const seg = { fromId, toId, path };
        S.segs.push(seg);
        drawWire(seg, animate);
        S.thread.setAttribute('d', S.segs.map((s) => s.path.getAttribute('d')).join(' '));
    }
    function drawWire(seg, animate) {
        const d = routePath(anchor(seg.fromId), anchor(seg.toId));
        seg.path.setAttribute('d', d);
        const len = seg.path.getTotalLength();
        seg.path.style.strokeDasharray = len; seg.path.style.strokeDashoffset = '0';
        if (animate) seg.path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
            { duration: 520, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' });
    }
    function redrawWires() {
        S.segs.forEach((s) => drawWire(s, false));
        if (S.segs.length) S.thread.setAttribute('d', S.segs.map((s) => s.path.getAttribute('d')).join(' '));
    }
    function clearWires() {
        S.segs.forEach((s) => s.path.remove());
        S.segs = []; S.thread.setAttribute('d', '');
    }
    function tick() {
        const d = S.thread.getAttribute('d');
        if (d) {
            const len = S.thread.getTotalLength();
            if (len > 0) {
                const p = S.thread.getPointAtLength(((performance.now() / 2600) % 1) * len);
                S.pulse.setAttribute('cx', p.x); S.pulse.setAttribute('cy', p.y);
                S.pulse.style.opacity = '1';
            }
        } else { S.pulse.style.opacity = '0'; }
        S.ticker = requestAnimationFrame(tick);
    }

    function reset() {
        clearWires();
        for (const d of NODE_DEFS) { setCell(d.id, 'idle'); setBody(d.id, ''); }
        S.progressEl.textContent = '00 / 00';
        sizeWire();
    }

    // ---- answer + verdict ----
    function pickAnswer(run) {
        let a = run.answer || '';
        if (/CFO'?s recommendation/i.test(a)) a = '';
        const t = (run.trace || []).filter((x) => x.agent && x.summary);
        if (!a && t.length) a = t.map((x) => x.summary).join('\n\n');
        return a || 'Done.';
    }
    function answerHTML(text, verdict) {
        let chips = '';
        if (verdict) {
            const c = [];
            if (verdict.transaction_safe !== null && verdict.transaction_safe !== undefined)
                c.push(verdict.transaction_safe ? 'Transaction safe' : 'Caution advised');
            if (verdict.risk_level && verdict.risk_level !== 'n/a') c.push('Risk: ' + verdict.risk_level);
            if (typeof verdict.confidence === 'number') c.push(Math.round(verdict.confidence * 100) + '% confidence');
            chips = c.map((x) => `<span class="aa-chip">${x}</span>`).join('');
        }
        return `<div class="acell-answer">${esc(text)}</div>` + (chips ? `<div class="aa-verdict">${chips}</div>` : '');
    }

    // ---- staged replay: state changes + threaded connectors ----
    async function replay(runObj) {
        const my = ++S.runId;
        reset();
        const agentSteps = (runObj.trace || []).filter((s) => s.step === 'agent' && byId[s.tool]);
        const j = (runObj.trace || []).find((s) => s.step === 'judge');
        const total = 1 + agentSteps.length + (j ? 1 : 0) + 1;
        let done = 0, prev = 'orchestrator'; progress(0, total);

        setCell('orchestrator', 'running');
        setBody('orchestrator', 'Reading: “' + trunc(runObj.query || '', 80) + '”');
        await sleep(650); if (my !== S.runId) return;

        if (agentSteps.length) {
            agentSteps.forEach((s) => setCell(s.tool, 'queued'));
            setBody('orchestrator', `Selecting ${agentSteps.length} specialist${agentSteps.length > 1 ? 's' : ''}…`);
            await sleep(620); if (my !== S.runId) return;
        }
        setCell('orchestrator', 'done');
        setBody('orchestrator', agentSteps.length ? 'Dispatched. Awaiting findings.' : 'Direct lookup — no specialists needed.');
        done++; progress(done, total);

        for (const s of agentSteps) {
            if (my !== S.runId) return;
            addWire(prev, s.tool, true); prev = s.tool;
            setCell(s.tool, 'running');
            await sleep(480); if (my !== S.runId) return;
            setBody(s.tool, s.summary || 'No finding.');
            setCell(s.tool, 'done'); done++; progress(done, total);
            await sleep(340);
        }

        if (j && my === S.runId) {
            addWire(prev, 'judge', true); prev = 'judge';
            setCell('judge', 'running');
            await sleep(560); if (my !== S.runId) return;
            const conf = typeof j.confidence === 'number' ? ` · ${Math.round(j.confidence * 100)}% confidence` : '';
            setBody('judge', `${j.response_ok ? 'Findings well-founded' : 'Needs revision'} · risk ${j.risk_level}${conf}`);
            setCell('judge', 'done'); done++; progress(done, total);
            await sleep(340);
        }

        if (my !== S.runId) return;
        addWire(prev, 'synthesis', true);
        setCell('synthesis', 'running');
        setBody('synthesis', 'Composing the recommendation…');
        await sleep(600); if (my !== S.runId) return;
        setBodyHTML('synthesis', answerHTML(pickAnswer(runObj), runObj.judge_verdict));
        setCell('synthesis', 'done'); done++; progress(done, total);
        sizeWire(); redrawWires();
    }

    async function run(query) {
        if (!S) return;
        ++S.runId; reset();
        setCell('orchestrator', 'running');
        setBody('orchestrator', 'Reading: “' + trunc(query, 80) + '”');
        try {
            const res = await api('/advise', { method: 'POST', body: JSON.stringify({ query, session_id: null }) });
            res.query = query;
            window.__lastRun = res;
            await replay(res);
        } catch (e) {
            setCell('orchestrator', 'done');
            setBody('orchestrator', 'Something went wrong — check the connection.');
        }
    }

    window.AgentFlow = {
        open() {
            if (!S) build();
            if (!S) return;
            sizeWire();
            if (!S.ticker) S.ticker = requestAnimationFrame(tick);
            if (window.__lastRun && window.__lastRun.trace) replay(window.__lastRun);
            else { reset(); setCell('orchestrator', 'idle'); setBody('orchestrator', 'Ask a question below to begin.'); }
        },
        replay(r) { if (S && r) replay(r); },
        resize() { if (S) { sizeWire(); redrawWires(); } },
        close() { if (S) { ++S.runId; cancelAnimationFrame(S.ticker); S.ticker = 0; } },
    };
})();
