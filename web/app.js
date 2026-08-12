// Backend URL: same origin by default (FastAPI serves this SPA, on Vercel and
// locally). Override with ?api=<url> (persisted) to point at a separate backend.
const API_BASE = (() => {
    const q = new URLSearchParams(location.search).get('api');
    if (q) localStorage.setItem('API_BASE', q.replace(/\/$/, ''));
    return localStorage.getItem('API_BASE') || '';
})();

const formatINR = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

// Escape user-controlled text before it lands in innerHTML (merchant/category/etc).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = {
    dashboard: null,
    transactions: []
};

const els = {
    grid: document.getElementById('home-view'),
    blocks: document.querySelectorAll('.grid-block'),
    detailContainer: document.getElementById('detail-container'),
    detailViews: document.querySelectorAll('.detail-view'),
    btnBack: document.getElementById('btn-back'),
    
    // Preview values
    preNetWorth: document.getElementById('preview-net-worth'),
    preInvestments: document.getElementById('preview-investments'),
    preBills: document.getElementById('preview-bills'),
    
    // Detail values (Budget)
    detNetWorth: document.getElementById('detail-net-worth'),
    detIncome: document.getElementById('detail-income'),
    detExpenses: document.getElementById('detail-expenses'),
    detDisposable: document.getElementById('detail-disposable'),
    detSavingsRate: document.getElementById('detail-savings-rate'),
    
    // Tables & Totals
    tableTx: document.getElementById('table-transactions'),
    tableInv: document.getElementById('table-investments'),
    detTotalInv: document.getElementById('detail-total-invested'),
    tableBills: document.getElementById('table-bills'),
    detTotalBills: document.getElementById('detail-total-bills'),
    
    // Chat
    chatDisplay: document.getElementById('chat-display'),
    chatForm: document.getElementById('form-chat'),
    chatInput: document.getElementById('chat-input'),
    btnSend: document.getElementById('btn-send'),
    tracePanel: document.getElementById('trace-panel'),
    traceLogs: document.getElementById('trace-logs'),
    
    // Modals
    backdrop: document.getElementById('modal-backdrop'),
    modal: document.getElementById('modal-container'),
    modalTitle: document.getElementById('modal-title'),
    modalForm: document.getElementById('modal-form'),
    sysStatus: document.getElementById('sys-status')
};

// --- ROUTING & TRANSITIONS ---
let currentView = null;

els.blocks.forEach(block => {
    // 3D Tilt Effect
    block.addEventListener('mousemove', (e) => {
        if (block.classList.contains('expanding')) return;
        const rect = block.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -10; // Max 10 deg
        const rotateY = ((x - centerX) / centerX) * 10;
        
        block.style.transform = `perspective(1000px) scale(1.02) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });
    
    block.addEventListener('mouseleave', () => {
        if (block.classList.contains('expanding')) return;
        block.style.transform = 'perspective(1000px) scale(1) rotateX(0) rotateY(0)';
    });

    block.addEventListener('click', () => {
        const targetId = block.dataset.target;
        
        // 1. Expand block
        block.classList.add('expanding');
        block.style.transform = 'none'; // reset tilt
        els.grid.classList.add('transitioning');
        
        // 2. Show back button
        els.btnBack.classList.add('visible');
        
        // 3. Wait for expansion, then fade in detail view
        setTimeout(() => {
            els.detailContainer.classList.add('active');
            const targetView = document.getElementById(targetId);
            targetView.classList.add('active');
            // Slight delay for translation animation
            setTimeout(() => targetView.classList.add('visible'), 50);
            currentView = { block, targetView };
        }, 500); // 500ms allows block to expand enough
    });
});

els.btnBack.addEventListener('click', () => {
    if (!currentView) return;
    
    // 1. Fade out detail view
    currentView.targetView.classList.remove('visible');
    els.btnBack.classList.remove('visible');
    els.detailContainer.classList.remove('active');
    
    setTimeout(() => {
        currentView.targetView.classList.remove('active');
        
        // 2. Collapse block
        currentView.block.classList.remove('expanding');
        els.grid.classList.remove('transitioning');
        currentView = null;
    }, 400); // wait for fade out
});

// --- API ---
async function api(endpoint, options = {}) {
    const { silent, ...fetchOpts } = options;
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...fetchOpts,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        const data = await res.json();
        if (!res.ok) {
            const err = Array.isArray(data.detail) ? data.detail.map(e => e.msg).join(', ') : data.detail;
            throw new Error(err || 'API Error');
        }
        return data;
    } catch (e) {
        if (!silent) alert(e.message);  // background calls (health/initial load) stay quiet
        throw e;
    }
}

async function checkHealth() {
    try {
        await api('/health', { silent: true });
        els.sysStatus.innerText = "SYS.ONLINE";
        els.sysStatus.style.color = "var(--accent)";
    } catch {
        els.sysStatus.innerText = "SYS.OFFLINE";
        els.sysStatus.style.color = "var(--gray)";
    }
}

async function loadData() {
    try {
        state.dashboard = await api('/dashboard', { silent: true });
        const fd = await api('/financial-data', { silent: true });
        state.transactions = fd.transactions || [];
        render();
    } catch (e) {
        console.error(e);
    }
}

// --- RENDER ---
function render() {
    if (!state.dashboard) return;
    const { profile, budget, investments, bills } = state.dashboard;
    const netWorth = profile.savings_balance + investments.total_invested;
    const sr = budget.income > 0 ? (budget.disposable / budget.income) * 100 : 0;

    // PREVIEWS
    els.preNetWorth.innerText = formatINR(netWorth);
    els.preInvestments.innerText = formatINR(investments.total_invested);
    els.preBills.innerText = formatINR(bills.total_upcoming);

    // BUDGET DETAIL
    els.detNetWorth.innerText = formatINR(netWorth);
    els.detIncome.innerText = formatINR(budget.income);
    els.detExpenses.innerText = formatINR(budget.expenses);
    els.detDisposable.innerText = formatINR(budget.disposable);
    els.detSavingsRate.innerText = `${sr.toFixed(1)}%`;

    // TRANSACTIONS
    els.tableTx.innerHTML = state.transactions.slice().reverse().map(t => {
        const isExp = t.amount < 0;
        const colorClass = isExp ? 'glow-red' : 'glow-green';
        return `
        <tr>
            <td class="mono" style="color: rgba(255,255,255,0.4); width: 120px">${t.date}</td>
            <td>${esc(t.merchant)}<br><span class="label">${esc(t.category)}</span></td>
            <td class="mono ${colorClass}" style="text-align:right">${formatINR(t.amount)}</td>
            <td class="actions" style="width: 100px">
                <button class="table-btn" onclick="openModal('transaction', '${t.id}')">✎</button>
                <button class="table-btn" onclick="deleteEntity('transaction', '${t.id}')">✕</button>
            </td>
        </tr>
    `}).join('') || '<tr><td colspan="4" class="label">NO TRANSACTIONS</td></tr>';

    // INVESTMENTS DETAIL
    els.tableInv.innerHTML = investments.holdings.map(inv => `
        <tr>
            <td>${esc(inv.instrument)}<br><span class="label badge-${inv.liquid ? 'liquid' : 'locked'}">${inv.liquid ? 'LIQUID' : 'LOCKED'}</span></td>
            <td class="mono glow-green">${formatINR(inv.value)}</td>
            <td class="actions" style="width: 100px">
                <button class="table-btn" onclick="openModal('investment', '${inv.id}')">✎</button>
                <button class="table-btn" onclick="deleteEntity('investment', '${inv.id}')">✕</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="label">NO ASSETS</td></tr>';
    els.detTotalInv.innerText = formatINR(investments.total_invested);

    // BILLS DETAIL
    els.tableBills.innerHTML = bills.upcoming_bills.map(b => `
        <tr>
            <td>${esc(b.name)}<br><span class="label badge-bill">DUE: ${b.due_date} ${b.autopay ? '(AUTO)' : ''}</span></td>
            <td class="mono glow-red">${formatINR(b.amount)}</td>
            <td class="actions" style="width: 100px">
                <button class="table-btn" onclick="openModal('bill', '${b.id}')">✎</button>
                <button class="table-btn" onclick="deleteEntity('bill', '${b.id}')">✕</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="label">NO BILLS</td></tr>';
    els.detTotalBills.innerText = formatINR(bills.total_upcoming);
}

// --- CHAT & THREE.JS 3D BLOB ---
let blobState = 'idle'; // 'idle', 'thinking', 'replying'

function appendChat(msg, isUser) {
    const div = document.createElement('div');
    div.className = `msg ${isUser ? 'msg-user' : 'msg-ai'}`;
    div.innerText = msg;
    els.chatDisplay.appendChild(div);
    els.chatDisplay.scrollTop = els.chatDisplay.scrollHeight;
}

els.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = els.chatInput.value.trim();
    if (!query) return;

    appendChat(query, true);
    els.chatInput.value = '';
    els.btnSend.disabled = true;
    
    // Hide greeting once chat starts
    const greeting = document.querySelector('.greeting-text');
    if (greeting) greeting.style.opacity = 0;
    
    els.tracePanel.classList.add('hidden');
    blobState = 'thinking'; // Trigger aggressive morphing

    try {
        const res = await api('/advise', { method: 'POST', body: JSON.stringify({ query, session_id: null }) });
        
        blobState = 'replying'; // Pulse
        setTimeout(() => blobState = 'idle', 1500);
        
        let finalResponse = res.answer;
        
        // Remove the generic demo text if present, as the user wants the actual agent responses
        if (finalResponse.includes("Here is your CFO's recommendation") || finalResponse.includes("your CFO's recommendation")) {
            finalResponse = "";
        }
        
        // If there are traces (agent findings), inject them into the blue box
        if (res.trace && res.trace.length > 0) {
            const validTraces = res.trace.filter(t => t.agent && t.summary);
            const traceDetails = validTraces.map(t => `[${t.agent.toUpperCase()}]\n${t.summary}`).join('\n\n');
            
            if (traceDetails) {
                finalResponse = finalResponse ? `${traceDetails}\n\n${finalResponse}` : traceDetails;
            }
            
            // Still populate trace panel if they want to see it, but it's optional now
            const traceHtml = validTraces.map(t => `<div class="trace-item">[${t.agent}] ${t.summary}</div>`).join('');
            els.traceLogs.innerHTML = traceHtml;
            // els.tracePanel.classList.remove('hidden'); // Optional: hide this since it's in the blue box now
        }
        
        appendChat(finalResponse || "Task completed.", false);
    } catch (e) {
        blobState = 'idle';
        appendChat("SYSTEM ERROR.", false);
    } finally {
        els.btnSend.disabled = false;
    }
});

// --- MODALS ---
window.closeModal = () => {
    els.backdrop.classList.add('hidden');
    els.modal.classList.add('hidden');
};

let modalSubmit = null;

window.openModal = (type, id = null) => {
    let html = '';
    
    if (type === 'profile') {
        els.modalTitle.innerText = "EDIT PROFILE";
        const p = state.dashboard.profile;
        html = `
            <label>Name</label><input type="text" id="m-name" value="${esc(p.name)}" required>
            <label>Monthly Income</label><input type="number" id="m-inc" value="${p.monthly_income}" required>
            <label>Savings Balance</label><input type="number" id="m-sav" value="${p.savings_balance}" required>
            <label>Emergency Fund</label><input type="number" id="m-em" value="${p.emergency_fund}" required>
            <label>Credit Score</label><input type="number" id="m-cibil" value="${p.credit_score}" required min="300" max="900">
            <label>Currency</label><input type="text" id="m-cur" value="${esc(p.currency)}" required>
            <div class="form-actions"><button type="submit">SAVE PROFILE</button></div>
        `;
        modalSubmit = async () => {
            await api('/financial-data/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    name: document.getElementById('m-name').value,
                    monthly_income: Number(document.getElementById('m-inc').value),
                    savings_balance: Number(document.getElementById('m-sav').value),
                    emergency_fund: Number(document.getElementById('m-em').value),
                    credit_score: Number(document.getElementById('m-cibil').value),
                    currency: document.getElementById('m-cur').value
                })
            });
        };
    } else if (type === 'transaction') {
        els.modalTitle.innerText = id ? "EDIT TRANSACTION" : "NEW TRANSACTION";
        const t = id ? state.transactions.find(x => x.id === id) : { date: new Date().toISOString().split('T')[0], amount: '', merchant: '', category: '' };
        html = `
            <label>Date</label><input type="date" id="m-date" value="${t.date}" required>
            <label>Amount</label><input type="number" id="m-amt" value="${t.amount}" required min="1">
            <label>Merchant</label><input type="text" id="m-merch" value="${esc(t.merchant)}" required maxlength="80">
            <label>Category</label><input type="text" id="m-cat" value="${esc(t.category)}" required maxlength="40">
            <div class="form-actions"><button type="submit">SAVE TRANSACTION</button></div>
        `;
        modalSubmit = async () => {
            await api(id ? `/financial-data/transactions/${id}` : '/financial-data/transactions', {
                method: id ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    date: document.getElementById('m-date').value,
                    amount: Number(document.getElementById('m-amt').value),
                    merchant: document.getElementById('m-merch').value,
                    category: document.getElementById('m-cat').value
                })
            });
        };
    } else if (type === 'investment') {
        els.modalTitle.innerText = id ? "EDIT ASSET" : "NEW ASSET";
        const v = id ? state.dashboard.investments.holdings.find(x => x.id === id) : { instrument: '', value: '', monthly_contribution: '', liquid: true };
        html = `
            <label>Instrument Name</label><input type="text" id="m-inst" value="${esc(v.instrument)}" required maxlength="80">
            <label>Current Value</label><input type="number" id="m-val" value="${v.value}" required min="0">
            <label>Monthly Contribution</label><input type="number" id="m-sip" value="${v.monthly_contribution}" required min="0">
            <div class="checkbox-row mt-8"><input type="checkbox" id="m-liq" ${v.liquid ? 'checked' : ''}><label>Liquid Asset</label></div>
            <div class="form-actions"><button type="submit">SAVE ASSET</button></div>
        `;
        modalSubmit = async () => {
            await api(id ? `/financial-data/investments/${id}` : '/financial-data/investments', {
                method: id ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    instrument: document.getElementById('m-inst').value,
                    value: Number(document.getElementById('m-val').value),
                    monthly_contribution: Number(document.getElementById('m-sip').value),
                    liquid: document.getElementById('m-liq').checked
                })
            });
        };
    } else if (type === 'bill') {
        els.modalTitle.innerText = id ? "EDIT BILL" : "NEW BILL";
        const b = id ? state.dashboard.bills.upcoming_bills.find(x => x.id === id) : { name: '', amount: '', due_date: new Date().toISOString().split('T')[0], autopay: false };
        html = `
            <label>Bill Name</label><input type="text" id="m-name" value="${esc(b.name)}" required maxlength="80">
            <label>Amount</label><input type="number" id="m-amt" value="${b.amount}" required min="1">
            <label>Due Date</label><input type="date" id="m-date" value="${b.due_date}" required>
            <div class="checkbox-row mt-8"><input type="checkbox" id="m-auto" ${b.autopay ? 'checked' : ''}><label>Autopay</label></div>
            <div class="form-actions"><button type="submit">SAVE BILL</button></div>
        `;
        modalSubmit = async () => {
            await api(id ? `/financial-data/bills/${id}` : '/financial-data/bills', {
                method: id ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    name: document.getElementById('m-name').value,
                    amount: Number(document.getElementById('m-amt').value),
                    due_date: document.getElementById('m-date').value,
                    autopay: document.getElementById('m-auto').checked
                })
            });
        };
    }

    els.modalForm.innerHTML = html;
    els.backdrop.classList.remove('hidden');
    els.modal.classList.remove('hidden');
};

els.modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!modalSubmit) return;
    const btn = els.modalForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
        await modalSubmit();
        await loadData();
        closeModal();
    } catch(err) {
        console.error(err);
    } finally {
        btn.disabled = false;
    }
});

window.deleteEntity = async (type, id) => {
    if (!confirm('DELETE THIS RECORD?')) return;
    const path = type === 'transaction' ? 'transactions' : (type === 'bill' ? 'bills' : 'investments');
    try {
        await api(`/financial-data/${path}/${id}`, { method: 'DELETE' });
        await loadData();
    } catch(e) {}
};

document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('RESET SYSTEM STATE?')) return;
    await api('/financial-data/reset', { method: 'POST' });
    await loadData();
});

// Boot
checkHealth();
loadData();
initBlob();

// --- THREE.JS LIQUID BLOB ---
function initBlob() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Setup Scene
    const scene = new THREE.Scene();
    
    // Camera
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / (window.innerHeight * 0.8), 0.1, 100);
    camera.position.z = 5;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight * 0.8);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Custom ShaderMaterial for fully smooth WebGL displacement and liquid look
    const vertexShader = `
        uniform float u_time;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        // Classic 3D Noise for smooth organic liquid movement
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
        
        float snoise(vec3 v){ 
            const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
            
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx) ;
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );
            
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            
            i = mod(i, 289.0 ); 
            vec4 p = permute( permute( permute( 
                     i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                   
            float n_ = 0.142857142857;
            vec3  ns = n_ * D.wyz - D.xzx;
            
            vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
            
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );
            
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            
            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );
            
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
            
            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);
            
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
        }

        // Apply noise displacement to a given point
        vec3 displace(vec3 p) {
            float noise = snoise(p * 1.5 + u_time) * 0.3;
            // Add a secondary flowing wave
            noise += sin(p.x * 3.0 + u_time * 2.0) * 0.05;
            return p + normalize(p) * noise;
        }

        void main() {
            vec3 p = position;
            vec3 displacedPos = displace(p);
            
            // Analytically compute normal based on neighboring points for perfectly smooth shading
            float eps = 0.01;
            vec3 tangent = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
            if (length(tangent) < 0.1) {
                tangent = normalize(cross(normal, vec3(1.0, 0.0, 0.0)));
            }
            vec3 bitangent = normalize(cross(normal, tangent));
            
            vec3 pTangent = displace(p + tangent * eps);
            vec3 pBitangent = displace(p + bitangent * eps);
            
            vNormal = normalize(cross(pTangent - displacedPos, pBitangent - displacedPos));
            vPosition = displacedPos;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPos, 1.0);
        }
    `;

    const fragmentShader = `
        uniform vec3 u_colorCore;
        uniform vec3 u_colorEdge;
        uniform float u_time;
        uniform int u_state;
        
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vec3 viewDir = normalize(cameraPosition - vPosition);
            
            // Top-right diagonal light source
            vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
            
            // Uniform diffuse illumination (softened for glass feel)
            float diffuse = max(dot(vNormal, lightDir), 0.0);
            diffuse = diffuse * 0.5 + 0.5; // ambient wrap
            
            // Fresnel calculation for glowing glass rim effect
            float fresnel = dot(viewDir, vNormal);
            fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
            fresnel = pow(fresnel, 2.5); // Smooth falloff
            
            // Mix core and edge based on fresnel, then illuminate
            vec3 baseColor = mix(u_colorCore, u_colorEdge, fresnel);
            baseColor *= diffuse; // apply uniform lighting
            
            // If thinking, pulse red/pink glow inside
            if (u_state == 1) {
                float pulse = (sin(u_time * 8.0) * 0.5 + 0.5);
                vec3 pulseColor = vec3(0.9, 0.1, 0.3); // Deep red/pink
                baseColor = mix(baseColor, pulseColor, pulse * (1.0 - fresnel) * 0.7);
            }
            
            // Bright specular highlight from top right
            float spec = max(0.0, dot(reflect(-lightDir, vNormal), viewDir));
            spec = pow(spec, 48.0); // Sharp, bright highlight
            
            vec3 finalColor = baseColor + vec3(1.0) * spec * 0.8;
            
            gl_FragColor = vec4(finalColor, 0.9); // High opacity for beautiful glow
        }
    `;

    const uniforms = {
        u_time: { value: 0 },
        u_colorCore: { value: new THREE.Color(0x0044ff) }, // Deep liquid blue core
        u_colorEdge: { value: new THREE.Color(0xaaeebb) }, // Icy glass cyan/blue edge
        u_state: { value: 0 }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        side: THREE.FrontSide
    });

    // High poly sphere for beautiful displacement
    const geometry = new THREE.IcosahedronGeometry(1.5, 64);
    
    const blob = new THREE.Mesh(geometry, material);
    scene.add(blob);

    let time = 0;
    
    // Mouse / Touch Interaction
    let targetRotationX = 0;
    let targetRotationY = 0;
    
    // Create an invisible overlay over the canvas so it catches events easily
    const interactLayer = document.createElement('div');
    interactLayer.style.position = 'absolute';
    interactLayer.style.inset = '0';
    interactLayer.style.zIndex = '3'; // Below chat display, but above canvas
    container.appendChild(interactLayer);
    
    interactLayer.addEventListener('mousemove', (e) => {
        targetRotationY = (e.clientX / window.innerWidth) * 1.5 - 0.75;
        targetRotationX = (e.clientY / window.innerHeight) * 1.5 - 0.75;
    });
    
    interactLayer.addEventListener('touchmove', (e) => {
        targetRotationY = (e.touches[0].clientX / window.innerWidth) * 1.5 - 0.75;
        targetRotationX = (e.touches[0].clientY / window.innerHeight) * 1.5 - 0.75;
    });
    
    // Resize handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / (window.innerHeight * 0.8);
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight * 0.8);
    });

    // Render Loop
    function animate() {
        requestAnimationFrame(animate);

        let speed = 0.015;
        let scale = 1.0;
        
        if (blobState === 'thinking') {
            speed = 0.05;
            uniforms.u_state.value = 1;
        } else if (blobState === 'replying') {
            speed = 0.03;
            scale = 1.05 + Math.sin(time * 5) * 0.05; // Pulse
            uniforms.u_state.value = 0;
        } else {
            uniforms.u_state.value = 0;
        }

        time += speed;
        uniforms.u_time.value = time;
        
        // Smoothly interpolate rotation towards the mouse/touch target, plus a slow auto-spin
        blob.rotation.y += (targetRotationY - blob.rotation.y) * 0.05 + 0.005;
        blob.rotation.x += (targetRotationX - blob.rotation.x) * 0.05 + 0.002;
        blob.scale.setScalar(scale);

        renderer.render(scene, camera);
    }
    animate();
}
