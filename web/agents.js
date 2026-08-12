// ============================================================
// Agent Theatre — a Swiss/International-style reasoning grid.
// Strict modular grid, Helvetica, hairline rules, numeric labels.
// The orchestrator plans, the specialists run in sequence, the judge
// validates, the synthesis resolves — each a cell that changes state
// (IDLE → QUEUED → RUNNING → DONE) as the real /advise trace replays.
// No floating boxes, no glowing dots, no overlap: the grid reflows.
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
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    let S = null;

    function build() {
        const grid = document.getElementById('agents-grid');
        const progress = document.getElementById('agents-progress');
        const form = document.getElementById('agents-form');
        const input = document.getElementById('agents-input');
        if (!grid) return null;

        const cells = {};
        grid.innerHTML = '';
        for (const d of NODE_DEFS) {
            const el = document.createElement('div');
            el.className = 'acell is-idle' + (d.span ? ' acell--span' : '') + (d.id === 'orchestrator' || d.id === 'synthesis' ? ' acell--core' : '');
            el.innerHTML =
                `<div class="acell-top"><span class="acell-idx">${d.idx}</span><span class="acell-state">Idle</span></div>`
                + `<div class="acell-name">${d.label}</div>`
                + `<div class="acell-role">${d.role}</div>`
                + `<div class="acell-body"></div>`;
            grid.appendChild(el);
            cells[d.id] = el;
        }

        S = { grid, progress, cells, runId: 0 };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = input.value.trim();
            if (!q) return;
            input.value = '';
            run(q);
        });
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
    function progress(done, total) { S.progress.textContent = String(done).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'); }

    function reset() {
        for (const d of NODE_DEFS) { setCell(d.id, 'idle'); setBody(d.id, ''); }
        S.progress.textContent = '00 / 00';
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

    // ---- staged replay of the real trace ----
    async function replay(runObj) {
        const my = ++S.runId;
        reset();
        const agentSteps = (runObj.trace || []).filter((s) => s.step === 'agent' && byId[s.tool]);
        const j = (runObj.trace || []).find((s) => s.step === 'judge');
        const total = 1 + agentSteps.length + (j ? 1 : 0) + 1;
        let done = 0; progress(0, total);

        setCell('orchestrator', 'running');
        setBody('orchestrator', 'Reading: “' + trunc(runObj.query || '', 80) + '”');
        await sleep(650); if (my !== S.runId) return;

        if (agentSteps.length) {
            agentSteps.forEach((s) => setCell(s.tool, 'queued'));
            setBody('orchestrator', `Selecting ${agentSteps.length} specialist${agentSteps.length > 1 ? 's' : ''}…`);
            await sleep(620); if (my !== S.runId) return;
        }
        setCell('orchestrator', 'done'); setBody('orchestrator', agentSteps.length ? 'Dispatched. Awaiting findings.' : 'Direct lookup — no specialists needed.');
        done++; progress(done, total);

        for (const s of agentSteps) {
            if (my !== S.runId) return;
            setCell(s.tool, 'running');
            await sleep(470); if (my !== S.runId) return;
            setBody(s.tool, s.summary || 'No finding.');
            setCell(s.tool, 'done'); done++; progress(done, total);
            await sleep(340);
        }

        if (j && my === S.runId) {
            setCell('judge', 'running');
            await sleep(560); if (my !== S.runId) return;
            const conf = typeof j.confidence === 'number' ? ` · ${Math.round(j.confidence * 100)}% confidence` : '';
            setBody('judge', `${j.response_ok ? 'Findings well-founded' : 'Needs revision'} · risk ${j.risk_level}${conf}`);
            setCell('judge', 'done'); done++; progress(done, total);
            await sleep(340);
        }

        if (my !== S.runId) return;
        setCell('synthesis', 'running');
        setBody('synthesis', 'Composing the recommendation…');
        await sleep(600); if (my !== S.runId) return;
        setBodyHTML('synthesis', answerHTML(pickAnswer(runObj), runObj.judge_verdict));
        setCell('synthesis', 'done'); done++; progress(done, total);
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
            if (window.__lastRun && window.__lastRun.trace) replay(window.__lastRun);
            else { reset(); setCell('orchestrator', 'idle'); setBody('orchestrator', 'Ask a question below to begin.'); }
        },
        replay(r) { if (S && r) replay(r); },
        resize() { /* CSS grid reflows on its own */ },
        close() { if (S) ++S.runId; },
    };
})();
