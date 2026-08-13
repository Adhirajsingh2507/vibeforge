// ============================================================
// Finora frontend. Structured UI (cards/grid/chat) + an
// AI-reactive WebGL visualization, driven by one state machine.
// ============================================================

// Backend URL: same origin by default (FastAPI serves this SPA). Override with
// ?api=<url> (persisted) to point at a separate backend.
const API_BASE = (() => {
    const q = new URLSearchParams(location.search).get('api');
    if (q) localStorage.setItem('API_BASE', q.replace(/\/$/, ''));
    return localStorage.getItem('API_BASE') || '';
})();

// One conversation session per page load, so follow-ups ("why?", "what if 50k?")
// resolve against prior findings. Shared with the Agent Theatre via window.
const SESSION_ID = (crypto.randomUUID && crypto.randomUUID()) || (`s-${Date.now()}-${Math.random().toString(36).slice(2)}`);
window.SESSION_ID = SESSION_ID;

const formatINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { dashboard: null, transactions: [] };

const els = {
    home: document.getElementById('home-view'),
    cards: document.querySelectorAll('.card'),
    detailContainer: document.getElementById('detail-container'),
    detailViews: document.querySelectorAll('.detail-view'),
    btnBack: document.getElementById('btn-back'),
    sysStatus: document.getElementById('sys-status'),
    // previews
    preNetWorth: document.getElementById('preview-net-worth'),
    preInvestments: document.getElementById('preview-investments'),
    preBills: document.getElementById('preview-bills'),
    // budget detail
    detNetWorth: document.getElementById('detail-net-worth'),
    detIncome: document.getElementById('detail-income'),
    detExpenses: document.getElementById('detail-expenses'),
    detDisposable: document.getElementById('detail-disposable'),
    detSavingsRate: document.getElementById('detail-savings-rate'),
    tableTx: document.getElementById('table-transactions'),
    tableInv: document.getElementById('table-investments'),
    detTotalInv: document.getElementById('detail-total-invested'),
    tableBills: document.getElementById('table-bills'),
    detTotalBills: document.getElementById('detail-total-bills'),
    // chat
    chatDisplay: document.getElementById('chat-display'),
    chatForm: document.getElementById('form-chat'),
    chatInput: document.getElementById('chat-input'),
    btnSend: document.getElementById('btn-send'),
    tracePanel: document.getElementById('trace-panel'),
    traceLogs: document.getElementById('trace-logs'),
    greeting: document.getElementById('greeting'),
    aiStateLabel: document.getElementById('ai-state-label'),
    // modal
    backdrop: document.getElementById('modal-backdrop'),
    modal: document.getElementById('modal-container'),
    modalTitle: document.getElementById('modal-title'),
    modalForm: document.getElementById('modal-form'),
};

// ---------- Navigation (card -> detail) ----------
let currentView = null;
els.cards.forEach((card) => {
    card.addEventListener('click', () => openDetail(card.dataset.target));
});
els.btnBack.addEventListener('click', closeDetail);

function openDetail(id) {
    const view = document.getElementById(id);
    if (!view) return;
    els.home.classList.add('dim');
    els.btnBack.classList.add('visible');
    view.classList.add('active');
    requestAnimationFrame(() => view.classList.add('visible'));
    currentView = view;
    if (id === 'view-chat') { AIViz && AIViz.resize(); AIViz && AIViz.setState('idle'); els.chatInput.focus(); }
    if (id === 'view-forge') window.ForgeViz && ForgeViz.open(state.dashboard);
    if (id === 'view-agents') window.AgentFlow && AgentFlow.open();
    if (id === 'view-scan') scanReset();
}
window.openDetail = openDetail; // used by the 3D hero to route on click
function closeDetail() {
    if (!currentView) return;
    const view = currentView; currentView = null;
    if (view.id === 'view-forge') window.ForgeViz && ForgeViz.close();
    if (view.id === 'view-agents') window.AgentFlow && AgentFlow.close();
    view.classList.remove('visible');
    els.btnBack.classList.remove('visible');
    els.home.classList.remove('dim');
    setTimeout(() => view.classList.remove('active'), 450);
}

// ---------- API ----------
async function api(endpoint, options = {}) {
    const { silent, ...fetchOpts } = options;
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...fetchOpts,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        const data = await res.json();
        if (!res.ok) {
            const err = Array.isArray(data.detail) ? data.detail.map((e) => e.msg).join(', ') : data.detail;
            throw new Error(err || 'Request failed');
        }
        return data;
    } catch (e) {
        if (!silent) alert(e.message);
        throw e;
    }
}

async function checkHealth() {
    if (!els.sysStatus) return; // status indicator removed from the topbar
    try {
        await api('/health', { silent: true });
        els.sysStatus.classList.add('online'); els.sysStatus.classList.remove('offline');
        els.sysStatus.lastChild.textContent = 'Online';
    } catch {
        els.sysStatus.classList.add('offline'); els.sysStatus.classList.remove('online');
        els.sysStatus.lastChild.textContent = 'Offline';
    }
}

async function loadData() {
    try {
        state.dashboard = await api('/dashboard', { silent: true });
        const fd = await api('/financial-data', { silent: true });
        state.transactions = fd.transactions || [];
        render();
    } catch (e) { console.error(e); }
}

// ---------- Render ----------
function render() {
    if (!state.dashboard) return;
    const { profile, budget, investments, bills } = state.dashboard;
    const netWorth = profile.savings_balance + investments.total_invested;
    const sr = budget.income > 0 ? (budget.disposable / budget.income) * 100 : 0;

    els.preNetWorth.textContent = formatINR(netWorth);
    els.preInvestments.textContent = formatINR(investments.total_invested);
    els.preBills.textContent = formatINR(bills.total_upcoming);

    els.detNetWorth.textContent = formatINR(netWorth);
    els.detIncome.textContent = formatINR(budget.income);
    els.detExpenses.textContent = formatINR(budget.expenses);
    els.detDisposable.textContent = formatINR(budget.disposable);
    els.detSavingsRate.textContent = `${sr.toFixed(1)}%`;

    const actions = (type, id) => `<td class="t-actions">
        <button class="icon-btn" onclick="openModal('${type}','${id}')" aria-label="Edit">✎</button>
        <button class="icon-btn" onclick="deleteEntity('${type}','${id}')" aria-label="Delete">✕</button></td>`;

    els.tableTx.innerHTML = state.transactions.slice().reverse().map((t) => `
        <tr>
            <td class="t-date">${t.date}</td>
            <td>${esc(t.merchant)}<br><span class="t-label">${esc(t.category)}</span></td>
            <td class="t-amt">${formatINR(t.amount)}</td>
            ${actions('transaction', t.id)}
        </tr>`).join('') || '<tr><td colspan="4" class="t-empty">No transactions</td></tr>';

    els.tableInv.innerHTML = investments.holdings.map((inv) => `
        <tr>
            <td>${esc(inv.instrument)}<br><span class="badge ${inv.liquid ? '' : 'locked'}">${inv.liquid ? 'Liquid' : 'Locked'}</span></td>
            <td class="t-amt">${formatINR(inv.value)}</td>
            ${actions('investment', inv.id)}
        </tr>`).join('') || '<tr><td colspan="3" class="t-empty">No assets</td></tr>';
    els.detTotalInv.textContent = formatINR(investments.total_invested);

    els.tableBills.innerHTML = bills.upcoming_bills.map((b) => `
        <tr>
            <td>${esc(b.name)}<br><span class="t-label">Due ${b.due_date}${b.autopay ? ' · Auto' : ''}</span></td>
            <td class="t-amt">${formatINR(b.amount)}</td>
            ${actions('bill', b.id)}
        </tr>`).join('') || '<tr><td colspan="3" class="t-empty">No bills</td></tr>';
    els.detTotalBills.textContent = formatINR(bills.total_upcoming);

    // Forge: reflect any add/subtract as Tetris blocks dropping / lifting
    if (window.ForgeViz) ForgeViz.update(state.dashboard);
}

// ---------- Chat ----------
const STATE_LABEL = { idle: 'Idle', listening: 'Listening', thinking: 'Thinking', generating: 'Generating', responding: 'Responding', completed: 'Completed' };
function setAIState(s) { if (AIViz) AIViz.setState(s); if (els.aiStateLabel) els.aiStateLabel.textContent = STATE_LABEL[s] || s; }

function appendChat(msg, isUser) {
    const div = document.createElement('div');
    div.className = `msg ${isUser ? 'msg-user' : 'msg-ai'}`;
    div.textContent = msg;
    els.chatDisplay.appendChild(div);
    els.chatDisplay.scrollTop = els.chatDisplay.scrollHeight;
    return div;
}

function typewrite(el, text) {
    return new Promise((resolve) => {
        el.textContent = '';
        const total = text.length;
        const per = Math.max(6, Math.min(22, 1400 / Math.max(total, 1)));
        let i = 0;
        const step = () => {
            i += Math.ceil(total / 60) || 1;
            el.textContent = text.slice(0, i);
            els.chatDisplay.scrollTop = els.chatDisplay.scrollHeight;
            if (i < total) setTimeout(step, per); else resolve();
        };
        step();
    });
}

els.chatInput.addEventListener('focus', () => { if (currentView && currentView.id === 'view-chat' && !els.btnSend.disabled) setAIState('listening'); });
els.chatInput.addEventListener('blur', () => { if (!els.btnSend.disabled) setAIState('idle'); });

els.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = els.chatInput.value.trim();
    if (!query) return;

    appendChat(query, true);
    els.chatInput.value = '';
    els.btnSend.disabled = true;
    els.greeting.classList.add('hidden');
    els.tracePanel.classList.add('hidden');

    setAIState('thinking');
    const pending = appendChat('', false);
    pending.classList.add('thinking');
    pending.innerHTML = '<i></i><i></i><i></i>';

    try {
        const res = await api('/advise', { method: 'POST', body: JSON.stringify({ query, session_id: SESSION_ID, context_token: window.__ctxToken || null }) });
        if (res.context_token) window.__ctxToken = res.context_token; // stateless follow-up memory
        window.__lastRun = { ...res, query }; // let the Agent Theatre replay this exact run

        // Build the answer: prefer the model's synthesis; drop the generic demo filler.
        let answer = res.answer || '';
        if (/CFO'?s recommendation/i.test(answer)) answer = '';
        const validTraces = (res.trace || []).filter((t) => t.agent && t.summary);
        if (!answer && validTraces.length) answer = validTraces.map((t) => t.summary).join('\n\n');
        if (!answer) answer = 'Done.';

        pending.classList.remove('thinking');
        pending.innerHTML = '';
        setAIState('generating');
        await typewrite(pending, answer);

        // Agent trace chips
        if (validTraces.length) {
            els.traceLogs.innerHTML = validTraces
                .map((t) => `<div class="trace-item"><b>${esc(t.agent)}</b> · ${esc(t.summary)}</div>`)
                .join('');
            els.tracePanel.classList.remove('hidden');
        }

        setAIState('responding');
        setTimeout(() => setAIState('completed'), 500);
        setTimeout(() => setAIState('idle'), 1400);
    } catch (err) {
        pending.classList.remove('thinking');
        pending.textContent = 'Something went wrong. Check the connection and try again.';
        setAIState('idle');
    } finally {
        els.btnSend.disabled = false;
    }
});

// ---------- Modals ----------
let modalSubmit = null;
window.closeModal = () => { els.backdrop.classList.add('hidden'); els.modal.classList.add('hidden'); };

window.openModal = (type, id = null) => {
    let html = '';
    const today = new Date().toISOString().split('T')[0];

    if (type === 'profile') {
        els.modalTitle.textContent = 'Edit profile';
        const p = state.dashboard.profile;
        html = `
            <label>Name</label><input type="text" id="m-name" value="${esc(p.name)}" required>
            <label>Monthly income</label><input type="number" id="m-inc" value="${p.monthly_income}" required min="0">
            <label>Savings balance</label><input type="number" id="m-sav" value="${p.savings_balance}" required min="0">
            <label>Emergency fund</label><input type="number" id="m-em" value="${p.emergency_fund}" required min="0">
            <label>Credit score</label><input type="number" id="m-cibil" value="${p.credit_score}" required min="300" max="900">
            <label>Currency</label><input type="text" id="m-cur" value="${esc(p.currency)}" required>
            <div class="form-actions"><button type="submit">Save profile</button></div>`;
        modalSubmit = () => api('/financial-data/profile', { method: 'PATCH', body: JSON.stringify({
            name: val('m-name'), monthly_income: num('m-inc'), savings_balance: num('m-sav'),
            emergency_fund: num('m-em'), credit_score: num('m-cibil'), currency: val('m-cur') }) });

    } else if (type === 'transaction') {
        els.modalTitle.textContent = id ? 'Edit transaction' : 'New transaction';
        const t = id ? state.transactions.find((x) => x.id === id) : { date: today, amount: '', merchant: '', category: '' };
        html = `
            <label>Date</label><input type="date" id="m-date" value="${t.date}" required>
            <label>Amount</label><input type="number" id="m-amt" value="${t.amount}" required min="1">
            <label>Merchant</label><input type="text" id="m-merch" value="${esc(t.merchant)}" required maxlength="80">
            <label>Category</label><input type="text" id="m-cat" value="${esc(t.category)}" required maxlength="40">
            <div class="form-actions"><button type="submit">Save transaction</button></div>`;
        modalSubmit = () => api(id ? `/financial-data/transactions/${id}` : '/financial-data/transactions', {
            method: id ? 'PATCH' : 'POST', body: JSON.stringify({
                date: val('m-date'), amount: num('m-amt'), merchant: val('m-merch'), category: val('m-cat') }) });

    } else if (type === 'investment') {
        els.modalTitle.textContent = id ? 'Edit asset' : 'New asset';
        const v = id ? state.dashboard.investments.holdings.find((x) => x.id === id) : { instrument: '', value: '', monthly_contribution: '', liquid: true };
        html = `
            <label>Instrument</label><input type="text" id="m-inst" value="${esc(v.instrument)}" required maxlength="80">
            <label>Current value</label><input type="number" id="m-val" value="${v.value}" required min="0">
            <label>Monthly contribution</label><input type="number" id="m-sip" value="${v.monthly_contribution}" required min="0">
            <div class="checkbox-row"><input type="checkbox" id="m-liq" ${v.liquid ? 'checked' : ''}><label>Liquid asset</label></div>
            <div class="form-actions"><button type="submit">Save asset</button></div>`;
        modalSubmit = () => api(id ? `/financial-data/investments/${id}` : '/financial-data/investments', {
            method: id ? 'PATCH' : 'POST', body: JSON.stringify({
                instrument: val('m-inst'), value: num('m-val'), monthly_contribution: num('m-sip'), liquid: document.getElementById('m-liq').checked }) });

    } else if (type === 'bill') {
        els.modalTitle.textContent = id ? 'Edit bill' : 'New bill';
        const b = id ? state.dashboard.bills.upcoming_bills.find((x) => x.id === id) : { name: '', amount: '', due_date: today, autopay: false };
        html = `
            <label>Bill name</label><input type="text" id="m-name" value="${esc(b.name)}" required maxlength="80">
            <label>Amount</label><input type="number" id="m-amt" value="${b.amount}" required min="1">
            <label>Due date</label><input type="date" id="m-date" value="${b.due_date}" required>
            <div class="checkbox-row"><input type="checkbox" id="m-auto" ${b.autopay ? 'checked' : ''}><label>Autopay</label></div>
            <div class="form-actions"><button type="submit">Save bill</button></div>`;
        modalSubmit = () => api(id ? `/financial-data/bills/${id}` : '/financial-data/bills', {
            method: id ? 'PATCH' : 'POST', body: JSON.stringify({
                name: val('m-name'), amount: num('m-amt'), due_date: val('m-date'), autopay: document.getElementById('m-auto').checked }) });
    }

    els.modalForm.innerHTML = html;
    els.backdrop.classList.remove('hidden');
    els.modal.classList.remove('hidden');
};

const val = (id) => document.getElementById(id).value;
const num = (id) => Number(document.getElementById(id).value);

els.modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!modalSubmit) return;
    const btn = els.modalForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try { await modalSubmit(); await loadData(); closeModal(); }
    catch (err) { console.error(err); }
    finally { btn.disabled = false; }
});
els.backdrop.addEventListener('click', closeModal);

window.deleteEntity = async (type, id) => {
    if (!confirm('Delete this record?')) return;
    const path = type === 'transaction' ? 'transactions' : type === 'bill' ? 'bills' : 'investments';
    try { await api(`/financial-data/${path}/${id}`, { method: 'DELETE' }); await loadData(); } catch (e) {}
};
document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('Reset all data to the demo defaults?')) return;
    try { await api('/financial-data/reset', { method: 'POST' }); await loadData(); } catch (e) {}
});

// ---------- Document scan -> import ----------
const scanEls = {
    drop: document.getElementById('scan-drop'),
    file: document.getElementById('scan-file'),
    status: document.getElementById('scan-status'),
    results: document.getElementById('scan-results'),
};
let scanData = { transactions: [], bills: [] };

function scanReset() {
    scanData = { transactions: [], bills: [] };
    scanEls.status.className = 'scan-status hidden';
    scanEls.results.className = 'scan-results hidden';
    scanEls.results.innerHTML = '';
    if (scanEls.file) scanEls.file.value = '';
}

function scanSetStatus(html, isErr) {
    scanEls.status.innerHTML = html;
    scanEls.status.className = 'scan-status' + (isErr ? ' err' : '');
}

async function uploadScan(fileObj) {
    if (!fileObj) return;
    scanEls.results.className = 'scan-results hidden';
    scanEls.results.innerHTML = '';
    scanSetStatus('<span class="spin"></span>Reading ' + esc(fileObj.name) + ' — this can take a few seconds…');
    try {
        const fd = new FormData();
        fd.append('file', fileObj);
        const res = await fetch(`${API_BASE}/scan`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || data.error) { scanSetStatus(esc(data.error || data.detail || 'Scan failed.'), true); return; }
        scanData = { transactions: data.transactions || [], bills: data.bills || [] };
        if (!scanData.transactions.length && !scanData.bills.length) {
            scanSetStatus(esc(data.note || 'Nothing could be read from this document.'), false);
            return;
        }
        scanSetStatus(esc(data.note || 'Review the items below, then import.'), false);
        renderScan();
    } catch (e) {
        scanSetStatus('Upload failed — check the connection and try again.', true);
    }
}

function renderScan() {
    const rows = (list, type) => list.map((it, i) => `
        <label class="scan-row">
            <input type="checkbox" data-type="${type}" data-i="${i}" checked>
            <div class="sr-main">${esc(it.merchant || it.name)}<div class="sr-sub">${type === 'transaction' ? esc(it.category) + ' · ' + it.date : 'Due ' + it.due_date + (it.autopay ? ' · Auto' : '')}</div></div>
            <div class="sr-amt">${formatINR(it.amount)}</div>
        </label>`).join('');
    const group = (title, list, type) => list.length ? `
        <div class="scan-group">
            <div class="scan-group-head"><h3>${title} (${list.length})</h3></div>
            ${rows(list, type)}
        </div>` : '';
    scanEls.results.innerHTML =
        group('Transactions', scanData.transactions, 'transaction') +
        group('Bills', scanData.bills, 'bill') +
        `<div class="scan-actions">
            <button id="scan-import">Import selected</button>
            <button class="scan-clear" id="scan-clear">Cancel</button>
        </div>`;
    scanEls.results.className = 'scan-results';
    document.getElementById('scan-import').addEventListener('click', importScan);
    document.getElementById('scan-clear').addEventListener('click', scanReset);
}

async function importScan() {
    const boxes = [...scanEls.results.querySelectorAll('input[type=checkbox]:checked')];
    if (!boxes.length) { scanSetStatus('Select at least one item to import.', true); return; }
    const btn = document.getElementById('scan-import');
    btn.disabled = true; scanSetStatus('<span class="spin"></span>Importing ' + boxes.length + ' item(s)…');
    let ok = 0;
    for (const b of boxes) {
        const type = b.dataset.type, it = scanData[type === 'transaction' ? 'transactions' : 'bills'][+b.dataset.i];
        try {
            await api(`/financial-data/${type === 'transaction' ? 'transactions' : 'bills'}`, { method: 'POST', body: JSON.stringify(it), silent: true });
            ok++;
        } catch (e) { /* skip failures, keep going */ }
    }
    await loadData();
    scanSetStatus(`Imported ${ok} item(s) into your dashboard.`, false);
    scanEls.results.className = 'scan-results hidden';
    scanEls.results.innerHTML = '';
    scanEls.file.value = '';
}

if (scanEls.drop) {
    scanEls.file.addEventListener('change', (e) => uploadScan(e.target.files[0]));
    ['dragover', 'dragenter'].forEach((ev) => scanEls.drop.addEventListener(ev, (e) => { e.preventDefault(); scanEls.drop.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => scanEls.drop.addEventListener(ev, (e) => { e.preventDefault(); scanEls.drop.classList.remove('dragover'); }));
    scanEls.drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) uploadScan(e.dataTransfer.files[0]); });
}

// ============================================================
// AI-reactive visualization: a glass core + a GPU particle
// shell. State drives amplitude, spread, brightness, spin.
// ============================================================
const NOISE_GLSL = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod(i,289.0);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const STATES = {
    idle:       { amp: 0.10, size: 2.2, bright: 0.45, spread: 1.00, swirl: 0.15, core: 0.10, spin: 0.0009 },
    listening:  { amp: 0.16, size: 2.6, bright: 0.66, spread: 0.94, swirl: 0.32, core: 0.14, spin: 0.0016 },
    thinking:   { amp: 0.44, size: 2.4, bright: 0.82, spread: 1.03, swirl: 0.95, core: 0.28, spin: 0.0060 },
    generating: { amp: 0.30, size: 3.0, bright: 1.00, spread: 1.18, swirl: 0.55, core: 0.20, spin: 0.0032 },
    responding: { amp: 0.20, size: 2.8, bright: 0.86, spread: 1.06, swirl: 0.35, core: 0.16, spin: 0.0022 },
    completed:  { amp: 0.13, size: 2.4, bright: 0.78, spread: 1.00, swirl: 0.22, core: 0.12, spin: 0.0014 },
};

let AIViz = null;
function initViz() {
    const container = document.getElementById('canvas-container');
    if (!container || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5.2;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // --- glass core ---
    const coreUniforms = { u_time: { value: 0 }, u_amp: { value: 0.1 }, u_bright: { value: 0.5 } };
    const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.15, 40),
        new THREE.ShaderMaterial({
            transparent: true, uniforms: coreUniforms,
            vertexShader: NOISE_GLSL + `
                uniform float u_time, u_amp; varying vec3 vN; varying vec3 vP;
                vec3 disp(vec3 p){ float n=snoise(p*1.4+u_time)*u_amp; n+=snoise(p*3.0-u_time*0.6)*u_amp*0.3; return p+normalize(p)*n; }
                void main(){ vec3 p=position; vec3 d=disp(p); float e=0.02;
                    vec3 t=normalize(cross(normal,vec3(0.,1.,0.))); if(length(t)<0.1)t=normalize(cross(normal,vec3(1.,0.,0.)));
                    vec3 b=normalize(cross(normal,t)); vN=normalize(cross(disp(p+t*e)-d,disp(p+b*e)-d)); vP=d;
                    gl_Position=projectionMatrix*modelViewMatrix*vec4(d,1.0); }`,
            fragmentShader: `
                uniform float u_bright; varying vec3 vN; varying vec3 vP;
                void main(){ vec3 V=normalize(cameraPosition-vP); vec3 L=normalize(vec3(1.,1.,1.));
                    float diff=max(dot(vN,L),0.0)*0.5+0.5;
                    float fres=pow(clamp(1.0-dot(V,vN),0.0,1.0),2.2);
                    float spec=pow(max(dot(reflect(-L,vN),V),0.0),40.0);
                    float lum=(0.10+fres*0.9)*diff*u_bright + spec*0.7;
                    gl_FragColor=vec4(vec3(lum),0.42+fres*0.4); }`,
        })
    );
    group.add(core);

    // --- particle shell (fibonacci sphere) ---
    const COUNT = Math.min(window.innerWidth < 600 ? 3500 : 7000, 7000);
    const positions = new Float32Array(COUNT * 3);
    const rand = new Float32Array(COUNT);
    const gold = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
        const y = 1 - (i / (COUNT - 1)) * 2, r = Math.sqrt(1 - y * y), th = gold * i;
        positions[i * 3] = Math.cos(th) * r * 1.75;
        positions[i * 3 + 1] = y * 1.75;
        positions[i * 3 + 2] = Math.sin(th) * r * 1.75;
        rand[i] = Math.random();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    const pUniforms = { u_time: { value: 0 }, u_amp: { value: 0.1 }, u_size: { value: 2.2 }, u_bright: { value: 0.5 }, u_spread: { value: 1 }, u_swirl: { value: 0.15 }, u_dpr: { value: renderer.getPixelRatio() } };
    const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: pUniforms,
        vertexShader: NOISE_GLSL + `
            uniform float u_time,u_amp,u_size,u_spread,u_swirl,u_dpr; attribute float aRand; varying float vB;
            void main(){ vec3 p=position*u_spread; vec3 dir=normalize(position);
                float n=snoise(position*1.3+u_time*0.6+aRand*6.28); p+=dir*n*u_amp;
                float a=u_swirl*(0.6+aRand)* (0.5+0.5*sin(u_time*0.5+aRand*6.28));
                float c=cos(a),s=sin(a); p.xz=mat2(c,-s,s,c)*p.xz;
                vB=0.5+0.5*n;
                vec4 mv=modelViewMatrix*vec4(p,1.0);
                gl_PointSize=u_size*u_dpr*(3.0/-mv.z)*(0.6+aRand*0.8);
                gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `
            uniform float u_bright; varying float vB;
            void main(){ vec2 uv=gl_PointCoord-0.5; float d=length(uv); if(d>0.5)discard;
                float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(vec3(u_bright*(0.6+vB*0.6)),a*0.9); }`,
    }));
    group.add(particles);

    // interaction + state
    let target = { ...STATES.idle }, cur = { ...STATES.idle }, time = 0;
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    container.addEventListener('pointermove', (e) => {
        const r = container.getBoundingClientRect();
        tmx = ((e.clientX - r.left) / r.width - 0.5) * 1.1;
        tmy = ((e.clientY - r.top) / r.height - 0.5) * 1.1;
    });

    function resize() {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
        pUniforms.u_dpr.value = renderer.getPixelRatio();
    }
    window.addEventListener('resize', resize); resize();

    const L = (a, b, k) => a + (b - a) * k;
    function frame() {
        requestAnimationFrame(frame);
        for (const k in target) cur[k] = L(cur[k], target[k], 0.05);
        time += cur.spin * 8 + 0.004;
        coreUniforms.u_time.value = time; coreUniforms.u_amp.value = cur.core; coreUniforms.u_bright.value = cur.bright;
        pUniforms.u_time.value = time; pUniforms.u_amp.value = cur.amp; pUniforms.u_size.value = cur.size;
        pUniforms.u_bright.value = cur.bright; pUniforms.u_spread.value = cur.spread; pUniforms.u_swirl.value = cur.swirl;
        mx = L(mx, tmx, 0.05); my = L(my, tmy, 0.05);
        group.rotation.y += cur.spin; group.rotation.x = my * 0.5;
        camera.position.x = L(camera.position.x, mx * 0.6, 0.05);
        camera.position.y = L(camera.position.y, -my * 0.6, 0.05);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
    }
    frame();

    AIViz = { setState: (s) => { if (STATES[s]) target = { ...STATES[s] }; }, resize };
}

// ---------- Boot ----------
checkHealth();
loadData();
initViz();
setInterval(checkHealth, 20000);
