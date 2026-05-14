// --- IMI STRATEGY STATE ---
let imiP0Strategy = null; // 'min' or 'factory' or 'manual'
let isTriggeredByModal = false;

window.openImiModal = function() {
    document.getElementById('imi-p0-modal')?.classList.remove('hidden');
};

window.closeImiModal = function() {
    document.getElementById('imi-p0-modal')?.classList.add('hidden');
};

window.setImiStrategy = function(strategy) {
    imiP0Strategy = strategy;
    isTriggeredByModal = true;
    window.closeImiModal();

    // Sync with UI Vordruck field
    const vordruckEl = document.getElementById('statico-vordruck');
    if (vordruckEl) {
        if (strategy === 'factory') vordruckEl.value = '1.5';
        else if (strategy === 'min') vordruckEl.value = ''; // Clear for auto (min)
    }
    
    // Re-trigger calculation with full results UI
    window.calculateAll(true);
    isTriggeredByModal = false;
};

window.showToast = function(message) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
};

// --- HELPERS: Math Evaluator for Inputs (CSP-safe, no eval/Function) ---
window.safeMathEval = function (value) {
    if (!value || typeof value !== 'string') return 0;

    // Clean input: replace commas with dots (Swiss/German decimal)
    let s = value.trim().replace(/,/g, '.');

    // Remove all characters that are not digits, operators, dots, or parens
    s = s.replace(/[^0-9+\-*/().]/g, '');
    if (!s) return 0;

    // Remove trailing operator
    s = s.replace(/[+\-*/.]$/, '');
    if (!s) return 0;

    // Simple recursive descent parser (handles +, -, *, /, parentheses)
    let pos = 0;

    function parseExpr() {
        let result = parseTerm();
        while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
            const op = s[pos++];
            const right = parseTerm();
            result = op === '+' ? result + right : result - right;
        }
        return result;
    }

    function parseTerm() {
        let result = parseFactor();
        while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
            const op = s[pos++];
            const right = parseFactor();
            result = op === '*' ? result * right : (right !== 0 ? result / right : 0);
        }
        return result;
    }

    function parseFactor() {
        // Handle unary minus/plus
        if (s[pos] === '-') { pos++; return -parseFactor(); }
        if (s[pos] === '+') { pos++; return parseFactor(); }
        // Handle parentheses
        if (s[pos] === '(') {
            pos++; // skip '('
            const result = parseExpr();
            if (s[pos] === ')') pos++; // skip ')'
            return result;
        }
        // Parse number
        const start = pos;
        while (pos < s.length && (s[pos] >= '0' && s[pos] <= '9' || s[pos] === '.')) pos++;
        const numStr = s.slice(start, pos);
        return numStr ? parseFloat(numStr) : 0;
    }

    try {
        const result = parseExpr();
        return isNaN(result) ? 0 : result;
    } catch (e) {
        // Fallback: first number in string
        const m = s.match(/\d*\.?\d+/);
        return m ? parseFloat(m[0]) : 0;
    }
};

// --- VHS DISPLAY HANDLERS (defined early so they are always available) ---
const vhsGeneratorTypes = [
    { label: "Gusskessel", factor: 1.5 },
    { label: "Stahlkessel", factor: 1.0 },
    { label: "Wandtherme <= 0.2 ℓ/kW", factor: 0.2 },
    { label: "Wärmetauscher", factor: 0.6 },
    { label: "BHKW", factor: 0.6 },
    { label: "Wärmepumpe", factor: 0.6 }
];

window.addVhsGeneratorRow = function (variant) {
    const container = document.querySelector(`#${variant}-vhs-generators .vhs-gen-rows`);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'vhs-gen-row';
    row.style = 'display: flex; align-items: center; gap: 0.4rem;';

    let options = vhsGeneratorTypes.map(t => `<option value="${t.label}">${t.label}</option>`).join('');

    row.innerHTML = `
        <select class="gen-type" style="flex: 1.5; font-size: 0.75rem; padding: 0.1rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff;" onchange="window.calculateVariantVhs('${variant}')">
            ${options}
        </select>
        <div style="position: relative; flex: 0.8; display: flex;">
            <input type="text" inputmode="decimal" class="gen-power" placeholder="kW" style="width: 100%; font-size: 0.8rem; padding: 0.1rem; padding-right: 1.2rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; text-align: center;" oninput="window.calculateVariantVhs('${variant}')">
            <span class="unit-tag" style="font-size: 0.65rem; right: 3px; position: absolute; top: 50%; transform: translateY(-50%); opacity: 0.7; pointer-events: none;">kW</span>
        </div>
        <button type="button" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size: 1rem; padding: 0; margin-left: 0.2rem;" onclick="window.removeVhsGeneratorRow(this, '${variant}')">&times;</button>
    `;
    container.appendChild(row);
};

window.addVhsStorageRow = function (variant) {
    const container = document.querySelector(`#${variant}-vhs-generators .vhs-gen-rows`);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'vhs-storage-row';
    row.style = 'display: flex; align-items: center; gap: 0.4rem;';

    row.innerHTML = `
        <div style="position: relative; flex: 1.5; display: flex;">
            <input type="text" inputmode="decimal" class="st-vol" placeholder="Speicher" style="width: 100%; font-size: 0.8rem; padding: 0.1rem; padding-right: 0.8rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; text-align: center;" oninput="window.calculateVariantVhs('${variant}')">
            <span class="unit-tag" style="font-size: 0.65rem; right: 3px; position: absolute; top: 50%; transform: translateY(-50%); opacity: 0.7; pointer-events: none;">ℓ</span>
        </div>
        <div style="position: relative; flex: 0.8; display: flex;">
            <input type="text" inputmode="decimal" class="st-temp" placeholder="Max. Sys. Temp." style="width: 100%; font-size: 0.8rem; padding: 0.1rem; padding-right: 1.2rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; text-align: center;" oninput="window.calculateVariantVhs('${variant}')">
            <span class="unit-tag" style="font-size: 0.65rem; right: 3px; position: absolute; top: 50%; transform: translateY(-50%); opacity: 0.7; pointer-events: none;">°C</span>
        </div>
        <button type="button" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size: 1rem; padding: 0; margin-left: 0.2rem;" onclick="window.removeVhsGeneratorRow(this, '${variant}')">&times;</button>
    `;
    container.appendChild(row);
};

window.addVhsCustomGeneratorRow = function (variant) {
    const container = document.querySelector(`#${variant}-vhs-generators .vhs-gen-rows`);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'vhs-custom-gen-row';
    row.style = 'display: flex; align-items: center; gap: 0.4rem;';

    row.innerHTML = `
        <input type="text" class="custom-gen-label" placeholder="Spez. Erzeuger" style="flex: 1.2; font-size: 0.75rem; padding: 0.1rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff;">
        <div style="position: relative; flex: 0.6; display: flex;">
            <input type="text" inputmode="decimal" class="custom-gen-factor" placeholder="ℓ/kW" style="width: 100%; font-size: 0.75rem; padding: 0.1rem; padding-right: 1.2rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); color: #fff; text-align: center;" oninput="window.calculateVariantVhs('${variant}')">
            <span class="unit-tag" style="font-size: 0.55rem; right: 2px; position: absolute; top: 50%; transform: translateY(-50%); opacity: 0.5; pointer-events: none;">ℓ/k</span>
        </div>
        <div style="position: relative; flex: 0.7; display: flex;">
            <input type="text" inputmode="decimal" class="custom-gen-power" placeholder="kW" style="width: 100%; font-size: 0.75rem; padding: 0.1rem; padding-right: 1rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; text-align: center;" oninput="window.calculateVariantVhs('${variant}')">
            <span class="unit-tag" style="font-size: 0.55rem; right: 2px; position: absolute; top: 50%; transform: translateY(-50%); opacity: 0.5; pointer-events: none;">kW</span>
        </div>
        <button type="button" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size: 1rem; padding: 0; margin-left: 0.2rem;" onclick="window.removeVhsGeneratorRow(this, '${variant}')">&times;</button>
    `;
    container.appendChild(row);
};

window.removeVhsGeneratorRow = function (btn, variant) {
    const row = btn.parentElement;
    const container = row.parentElement;
    row.remove();

    // Auto-respawn only if it was a generator row and no generator rows left? 
    // Actually, user might want to delete all. Let's not auto-respawn to be less annoying.

    window.calculateVariantVhs(variant);
};

function ensureDefaultVhsRows(variant) {
    const container = document.querySelector(`#${variant}-vhs-generators .vhs-gen-rows`);
    if (!container) return;

    const hasGen = !!container.querySelector('.vhs-gen-row');
    const hasStorage = !!container.querySelector('.vhs-storage-row');

    if (!hasGen) window.addVhsGeneratorRow(variant);
    if (!hasStorage) window.addVhsStorageRow(variant);

    window.calculateVariantVhs(variant);
}

window.calculateVariantVhs = function (variant) {
    // 1. Get manual input (Treat as Storage)
    const inputId = (variant === 'v1') ? 'vol-vhs' : 'vol-vhs-v2-proxy';
    const input = document.getElementById(inputId);
    let manualVol = window.safeMathEval(input ? input.value : "0");
    
    let genTotal = 0;
    let storageTotal = manualVol;

    // 2. Get generator rows
    const genRows = document.querySelectorAll(`#${variant}-vhs-generators .vhs-gen-row`);
    genRows.forEach(row => {
        const typeLabel = row.querySelector('.gen-type').value;
        const typeDef = vhsGeneratorTypes.find(t => t.label === typeLabel);
        const factor = typeDef ? typeDef.factor : 0;
        const powerStr = row.querySelector('.gen-power').value.replace(',', '.');
        const power = parseFloat(powerStr) || 0;
        genTotal += (factor * power);
    });

    // 2b. Get custom generator rows
    const customGenRows = document.querySelectorAll(`#${variant}-vhs-generators .vhs-custom-gen-row`);
    customGenRows.forEach(row => {
        const factor = parseFloat(row.querySelector('.custom-gen-factor').value.replace(',', '.')) || 0;
        const power = parseFloat(row.querySelector('.custom-gen-power').value.replace(',', '.')) || 0;
        genTotal += (factor * power);
    });

    // 3. Get storage rows
    const stRows = document.querySelectorAll(`#${variant}-vhs-generators .vhs-storage-row`);
    stRows.forEach(row => {
        const volStr = row.querySelector('.st-vol').value.replace(',', '.');
        const vol = parseFloat(volStr) || 0;
        storageTotal += vol;
    });

    const totalVol = genTotal + storageTotal;

    // 4. Update display
    const displayId = (variant === 'v1') ? 'vhs-res-v1' : 'vhs-res-v2';
    const display = document.getElementById(displayId);
    if (display) {
        display.textContent = Math.round(totalVol);
    }

    // Category Breakdown Display
    const genLine = document.getElementById(`${variant}-vhs-erzeuger-line`);
    const genVal = document.getElementById(`${variant}-vhs-erzeuger-val`);
    if (genLine && genVal) {
        if (genTotal > 0) {
            genLine.style.display = 'block';
            genVal.innerText = Math.round(genTotal);
        } else {
            genLine.style.display = 'none';
        }
    }
    const stLine = document.getElementById(`${variant}-vhs-speicher-line`);
    const stVal = document.getElementById(`${variant}-vhs-speicher-val`);
    if (stLine && stVal) {
        if (storageTotal > 0) {
            stLine.style.display = 'block';
            stVal.innerText = Math.round(storageTotal);
        } else {
            stLine.style.display = 'none';
        }
    }

    // 5. Trigger global calc
    if (typeof handleVsCalculation === 'function') handleVsCalculation();
    if (typeof autoRefreshSV === 'function') autoRefreshSV();

    return totalVol;
};

window.updateVhsDisplay = function (input) {
    if (!input) return;
    const variant = (input.id === 'vol-vhs') ? 'v1' : 'v2';
    window.calculateVariantVhs(variant);
};

window.finalizeVhsInput = function (input) {
    if (!input) return;
    window.updateVhsDisplay(input);
};

window.catchVhsEnter = function (event, input) {
    if (event.code === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        window.finalizeVhsInput(input);
        input.blur();
    }
};

// Official SWKI HE301-01 Table 1: Expansion coefficients for Water
const tableSWKI = {
    "Water": [[0, 0.0001], [20, 0.0016], [30, 0.0041], [40, 0.0075], [50, 0.0118], [60, 0.0167], [70, 0.0224], [80, 0.0286], [90, 0.0355], [100, 0.0430], [105, 0.0470], [110, 0.0511]],
    "MEG30": [[-14.5, 0.0093], [20, 0.0093], [30, 0.0129], [40, 0.0169], [50, 0.0224], [60, 0.0286], [70, 0.0352], [80, 0.0422], [90, 0.0497], [100, 0.0577], [105, 0.0620], [110, 0.0663]],
    "MEG40": [[-23.9, 0.0144], [20, 0.0144], [30, 0.0189], [40, 0.0240], [50, 0.0300], [60, 0.0363], [70, 0.0432], [80, 0.0505], [90, 0.0582], [100, 0.0663], [105, 0.0706], [110, 0.0750]],
    "MEG50": [[-35.6, 0.0198], [20, 0.0198], [30, 0.0251], [40, 0.0307], [50, 0.0370], [60, 0.0437], [70, 0.0507], [80, 0.0581], [90, 0.0660], [100, 0.0742], [105, 0.0786], [110, 0.0830]],
    "MPG30": [[-12.9, 0.0151], [20, 0.0151], [30, 0.0207], [40, 0.0267], [50, 0.0333], [60, 0.0401], [70, 0.0476], [80, 0.0554], [90, 0.0639], [100, 0.0727], [105, 0.0774], [110, 0.0823]],
    "MPG40": [[-20.9, 0.0211], [20, 0.0211], [30, 0.0272], [40, 0.0338], [50, 0.0408], [60, 0.0481], [70, 0.0561], [80, 0.0644], [90, 0.0731], [100, 0.0826], [105, 0.0873], [110, 0.0924]],
    "MPG50": [[-33.2, 0.0288], [20, 0.0288], [30, 0.0355], [40, 0.0425], [50, 0.0500], [60, 0.0577], [70, 0.0660], [80, 0.0747], [90, 0.0839], [100, 0.0935], [105, 0.0985], [110, 0.1036]]
};

// IMI HySelect Specific coefficients (tuned for benchmark parity)
const tableIMI = {
    "Water": [[0, 0.0001], [20, 0.0016], [30, 0.0041], [40, 0.00744], [50, 0.0118], [60, 0.0167], [70, 0.0224], [80, 0.0286], [90, 0.0355], [100, 0.0430], [105, 0.0470], [110, 0.0511]]
};

// --- DATA: Table 4 (Specific Water Content vs in L/kW) ---
const table4 = {
    // Keys: "tsmax|tr"
    "90|70": { radiators: 14.0, panels: 9.0, convectors: 6.5, ventilation: 5.8, floor: 10.3 },
    "80|60": { radiators: 16.5, panels: 10.1, convectors: 7.0, ventilation: 6.1, floor: 11.4 },
    "70|55": { radiators: 20.1, panels: 12.1, convectors: 8.4, ventilation: 7.2, floor: 13.3 },
    "70|50": { radiators: 20.6, panels: 11.9, convectors: 7.9, ventilation: 6.6, floor: 13.1 },
    "60|40": { radiators: 27.9, panels: 15.1, convectors: 9.6, ventilation: 7.6, floor: 15.8 },
    "50|40": { radiators: 36.6, panels: 20.1, convectors: 13.4, ventilation: 10.8, floor: 20.3 },
    "40|30": { radiators: 0, panels: 0, convectors: 0, ventilation: 0, floor: 29.1 },
    "35|28": { radiators: 0, panels: 0, convectors: 0, ventilation: 0, floor: 37.8 }
};

// --- DATA: Compresso Connect F Vessels CATALOG ---
const vesselData = {
    'CU': {
        '6': [
            { v: 200, ps_ch: 6.0, price: 1207, art: '301010-10400' }, 
            { v: 300, ps_ch: 6.0, price: 1433, art: '301010-10500' },
            { v: 400, ps_ch: 6.0, price: 1735, art: '301010-10600' }, 
            { v: 500, ps_ch: 6.0, price: 2071, art: '301010-10700' },
            { v: 600, ps_ch: 5.0, price: 2377, art: '301010-10800' }, 
            { v: 800, ps_ch: 3.75, price: 2865, art: '301010-10900' }
        ]
    },
    'CG': {
        '6': [
            { v: 300, price: 1884, art: '301010-10501' }, { v: 500, price: 2534, art: '301010-10701' }, 
            { v: 700, price: 3200, art: '301010-10801' }, { v: 1000, price: 4200, art: '301010-11001' }, 
            { v: 1500, price: 5500, art: '301010-11101' }, { v: 2000, price: 6800, art: '301010-11201' },
            { v: 3000, price: 8500, art: '301010-11301' }, { v: 4000, price: 10200, art: '301010-11401' }, 
            { v: 5000, price: 12500, art: '301010-11501' }
        ],
        '10': [
            { v: 300, price: 2200 }, { v: 500, price: 2900 }, { v: 700, price: 3800 },
            { v: 1000, price: 4900 }, { v: 1500, price: 6400 }, { v: 2000, price: 8100 },
            { v: 3000, price: 10500 }
        ]
    }
};

const tecboxPriceData = {
    'C 10.1-3.0 Connect': { price: 3340, art: '301020-10101' },
    'C 10.1-3.75 Connect': { price: 3340, art: '301020-10102' },
    'C 10.1-4.2 Connect': { price: 3340, art: '301020-10103' },
    'C 10.1-5.0 Connect': { price: 3340, art: '301020-10104' },
    'C 10.1-6.0 Connect': { price: 3340, art: '301020-10105' },
    'C 10.1-3.0 F Connect': { price: 3540, art: '301020-10201' },
    'C 10.1-3.75 F Connect': { price: 3540, art: '301020-10202' },
    'C 10.1-4.2 F Connect': { price: 3540, art: '301020-10203' },
    'C 10.1-5 F Connect': { price: 3540, art: '301020-10204' },
    'C 10.1-6 F Connect': { price: 3540, art: '301020-10205' },
    'C 2.1-80': { price: 2810, art: '301021-10001' }
};

// --- DATA: Statico Vessels (from Documentation Seite 9) ---
const staticoDataList = [
    { type: "SD 8.3", vol: 8, p0_factory: 1.0, ps: 3, price: 114, art: '7102000' },
    { type: "SD 12.3", vol: 12, p0_factory: 1.0, ps: 3, price: 126, art: '7102001' },
    { type: "SD 18.3", vol: 18, p0_factory: 1.0, ps: 3, price: 150, art: '7102002' },
    { type: "SD 25.3", vol: 25, p0_factory: 1.0, ps: 3, price: 172, art: '7102003' },
    { type: "SD 35.3", vol: 35, p0_factory: 1.0, ps: 3, price: 210, art: '7102004' },
    { type: "SD 50.3", vol: 50, p0_factory: 1.5, ps: 3, price: 276, art: '7102005' },
    { type: "SD 80.3", vol: 80, p0_factory: 1.5, ps: 3 },
    { type: "SU 140.3", vol: 140, p0_factory: 1.5, ps: 3 },
    { type: "SU 200.3", vol: 200, p0_factory: 1.5, ps: 3 },
    { type: "SU 300.3", vol: 300, p0_factory: 1.5, ps: 3 },
    { type: "SU 400.3", vol: 400, p0_factory: 1.5, ps: 3 },
    { type: "SU 500.3", vol: 500, p0_factory: 1.5, ps: 3 },
    { type: "SU 140.6", vol: 140, p0_factory: 3.5, ps: 6 },
    { type: "SU 200.6", vol: 200, p0_factory: 3.5, ps: 6 },
    { type: "SU 300.6", vol: 300, p0_factory: 3.5, ps: 6 },
    { type: "SU 400.6", vol: 400, p0_factory: 3.5, ps: 6 },
    { type: "SU 500.6", vol: 500, p0_factory: 3.5, ps: 6 },
    { type: "SU 600.6", vol: 600, p0_factory: 3.5, ps: 6 },
    { type: "SU 800.6", vol: 800, p0_factory: 3.5, ps: 6 },
    { type: "SU 140.10", vol: 140, p0_factory: 4.0, ps: 10 },
    { type: "SU 200.10", vol: 200, p0_factory: 4.0, ps: 10 },
    { type: "SU 300.10", vol: 300, p0_factory: 4.0, ps: 10 },
    { type: "SU 400.10", vol: 400, p0_factory: 4.0, ps: 10 },
    { type: "SU 500.10", vol: 500, p0_factory: 4.0, ps: 10 }
];

// --- DATA: Pipe Water Content (L/m based on IMI Specific Tables) ---
const pipeDataExt = [
    { label: "DN 10 (3/8\")", v: 0.12 },
    { label: "DN 15 (1/2\")", v: 0.20 },
    { label: "DN 20 (3/4\")", v: 0.37 },
    { label: "DN 25 (1\")", v: 0.58 },
    { label: "DN 32 (1 1/4\")", v: 1.01 },
    { label: "DN 40 (1 1/2\")", v: 1.37 },
    { label: "DN 50 (2\")", v: 2.21 },
    { label: "DN 65 (2 1/2\")", v: 3.72 },
    { label: "DN 80 (3\")", v: 5.13 },
    { label: "DN 100 (4\")", v: 8.66 },
    { label: "DN 125 (5\")", v: 13.30 },
    { label: "DN 150 (6\")", v: 18.90 },
    { label: "DN 200 (8\")", v: 35.70 },
    { label: "DN 250 (10\")", v: 53.10 },
    { label: "DN 300 (12\")", v: 80.50 },
    { label: "Spezieller Ø", v: 0, custom: true }
];


function getExpansionCoeff(fluid, temp) {
    const isBenchmark = document.getElementById('mode-imi-benchmark')?.checked;
    const activeTable = isBenchmark ? tableIMI : tableSWKI;
    const data = activeTable[fluid] || activeTable["Water"] || tableSWKI["Water"];
    if (temp <= data[0][0]) return data[0][1];
    if (temp >= data[data.length - 1][0]) return data[data.length - 1][1];

    for (let i = 0; i < data.length - 1; i++) {
        if (temp >= data[i][0] && temp <= data[i + 1][0]) {
            const t1 = data[i][0], e1 = data[i][1];
            const t2 = data[i + 1][0], e2 = data[i + 1][1];
            return e1 + ((temp - t1) / (t2 - t1)) * (e2 - e1);
        }
    }
    return 0;
}

// Safety valve capacities (kW)
const svHeating = {
    "2.0": [{ dn: 15, kW: 68 }, { dn: 20, kW: 152 }, { dn: 25, kW: 236 }, { dn: 32, kW: 401 }],
    "2.5": [{ dn: 15, kW: 79 }, { dn: 20, kW: 182 }, { dn: 25, kW: 277 }, { dn: 32, kW: 481 }],
    "3.0": [{ dn: 15, kW: 89 }, { dn: 20, kW: 210 }, { dn: 25, kW: 320 }, { dn: 32, kW: 555 }, { dn: 40, kW: 1040 }, { dn: 50, kW: 1600 }],
    "3.5": [{ dn: 15, kW: 99 }, { dn: 20, kW: 234 }, { dn: 25, kW: 357 }, { dn: 32, kW: 619 }, { dn: 40, kW: 1160 }, { dn: 50, kW: 1790 }],
    "4.0": [{ dn: 15, kW: 109 }, { dn: 20, kW: 258 }, { dn: 25, kW: 393 }, { dn: 32, kW: 682 }, { dn: 40, kW: 1280 }, { dn: 50, kW: 1980 }],
    "4.5": [{ dn: 15, kW: 119 }, { dn: 20, kW: 282 }, { dn: 25, kW: 430 }, { dn: 32, kW: 746 }, { dn: 40, kW: 1400 }, { dn: 50, kW: 2160 }],
    "5.0": [{ dn: 15, kW: 129 }, { dn: 20, kW: 305 }, { dn: 25, kW: 465 }, { dn: 32, kW: 808 }, { dn: 40, kW: 1510 }, { dn: 50, kW: 2330 }],
    "5.5": [{ dn: 15, kW: 139 }, { dn: 20, kW: 329 }, { dn: 25, kW: 501 }, { dn: 32, kW: 870 }, { dn: 40, kW: 1625 }, { dn: 50, kW: 2510 }],
    "6.0": [{ dn: 15, kW: 149 }, { dn: 20, kW: 352 }, { dn: 25, kW: 537 }, { dn: 32, kW: 931 }, { dn: 40, kW: 1740 }, { dn: 50, kW: 2680 }],
    "7.0": [{ dn: 15, kW: 168 }, { dn: 20, kW: 397 }, { dn: 25, kW: 605 }, { dn: 32, kW: 1051 }, { dn: 40, kW: 1965 }, { dn: 50, kW: 3030 }],
    "8.0": [{ dn: 15, kW: 187 }, { dn: 20, kW: 442 }, { dn: 25, kW: 674 }, { dn: 32, kW: 1170 }, { dn: 40, kW: 2190 }, { dn: 50, kW: 3370 }],
    "9.0": [{ dn: 15, kW: 206 }, { dn: 20, kW: 487 }, { dn: 25, kW: 742 }, { dn: 32, kW: 1287 }, { dn: 40, kW: 2400 }, { dn: 50, kW: 3710 }],
    "10.0": [{ dn: 15, kW: 225 }, { dn: 20, kW: 530 }, { dn: 25, kW: 808 }, { dn: 32, kW: 1402 }, { dn: 40, kW: 2620 }, { dn: 50, kW: 4040 }]
};

const svCooling = {
    "2.0": [{ dn: 15, kW: 4500 }, { dn: 20, kW: 8200 }, { dn: 25, kW: 13500 }, { dn: 32, kW: 20200 }, { dn: 40, kW: 34200 }, { dn: 50, kW: 51800 }],
    "2.5": [{ dn: 15, kW: 5000 }, { dn: 20, kW: 9150 }, { dn: 25, kW: 15000 }, { dn: 32, kW: 22500 }, { dn: 40, kW: 38050 }, { dn: 50, kW: 57650 }],
    "3.0": [{ dn: 15, kW: 5500 }, { dn: 20, kW: 10100 }, { dn: 25, kW: 16500 }, { dn: 32, kW: 24800 }, { dn: 40, kW: 41900 }, { dn: 50, kW: 63500 }],
    "3.5": [{ dn: 15, kW: 5950 }, { dn: 20, kW: 10900 }, { dn: 25, kW: 17800 }, { dn: 32, kW: 26750 }, { dn: 40, kW: 45150 }, { dn: 50, kW: 68450 }],
    "4.0": [{ dn: 15, kW: 6400 }, { dn: 20, kW: 11700 }, { dn: 25, kW: 19100 }, { dn: 32, kW: 28700 }, { dn: 40, kW: 48400 }, { dn: 50, kW: 73400 }],
    "4.5": [{ dn: 15, kW: 6750 }, { dn: 20, kW: 12400 }, { dn: 25, kW: 20200 }, { dn: 32, kW: 30400 }, { dn: 40, kW: 51300 }, { dn: 50, kW: 77750 }],
    "5.0": [{ dn: 15, kW: 7100 }, { dn: 20, kW: 13100 }, { dn: 25, kW: 21300 }, { dn: 32, kW: 32100 }, { dn: 40, kW: 54200 }, { dn: 50, kW: 82100 }],
    "5.5": [{ dn: 15, kW: 7450 }, { dn: 20, kW: 13700 }, { dn: 25, kW: 22350 }, { dn: 32, kW: 33600 }, { dn: 40, kW: 56800 }, { dn: 50, kW: 86000 }],
    "6.0": [{ dn: 15, kW: 7800 }, { dn: 20, kW: 14300 }, { dn: 25, kW: 23400 }, { dn: 32, kW: 35100 }, { dn: 40, kW: 59400 }, { dn: 50, kW: 89900 }],
    "7.0": [{ dn: 15, kW: 8400 }, { dn: 20, kW: 15500 }, { dn: 25, kW: 25200 }, { dn: 32, kW: 37900 }, { dn: 40, kW: 64100 }, { dn: 50, kW: 97100 }],
    "8.0": [{ dn: 15, kW: 9000 }, { dn: 20, kW: 16500 }, { dn: 25, kW: 27000 }, { dn: 32, kW: 40600 }, { dn: 40, kW: 68600 }, { dn: 50, kW: 103900 }],
    "9.0": [{ dn: 15, kW: 9600 }, { dn: 20, kW: 17500 }, { dn: 25, kW: 28600 }, { dn: 32, kW: 43000 }, { dn: 40, kW: 72700 }, { dn: 50, kW: 110200 }],
    "10.0": [{ dn: 15, kW: 10100 }, { dn: 20, kW: 18500 }, { dn: 25, kW: 30200 }, { dn: 32, kW: 45400 }, { dn: 40, kW: 76700 }, { dn: 50, kW: 116100 }]
};

window.userManuallySetPsvs = false;
window.isProgrammaticPsvsUpdate = false;
window.hasValidationError = false;

window.resetPsvsToAuto = function (event) {
    if (event) event.stopPropagation();
    window.isProgrammaticPsvsUpdate = true;
    window.userManuallySetPsvs = false;

    // Core calculation to find the recommended psvs immediately
    let Hst = parseFloat(document.getElementById('height-hst').value) || 0;
    let pz = parseFloat(document.getElementById('press-pz').value) || 0;
    let sysType = document.getElementById('system-type').value;
    let p0 = Math.max((Hst / 10.0) + 0.3, pz);
    let pe = p0 + 0.3 + 0.2;
    let min_psvs = (sysType !== 'heating' && sysType !== 'dh') ? Math.max(pe * 1.3, pe + 0.6) : Math.max(pe * 1.15, pe + 0.3);
    const steps = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 9.0, 10.0];
    let recommended = steps.find(p => p >= min_psvs) || 10.0;

    const psvsSelect = document.getElementById('press-psvs');
    if (psvsSelect) {
        psvsSelect.value = recommended.toFixed(1);
        psvsSelect.dispatchEvent(new Event('change'));
    }

    autoRefreshSV();
    window.isProgrammaticPsvsUpdate = false;
    updatePsvsOverrideUi();
}

// Initial setup for the button
window.addEventListener('load', () => {
    const btn = document.getElementById('btn-psvs-auto');
    if (btn) btn.onclick = window.resetPsvsToAuto;
});

function autoRefreshSV() {
    let Hst = parseFloat(document.getElementById('height-hst').value.replace(',', '.')) || 0;
    let pz = parseFloat(document.getElementById('press-pz').value.replace(',', '.')) || 0;
    let sysType = document.getElementById('system-type').value;
    let Q = parseFloat(document.getElementById('power-q').value.replace(',', '.')) || 0;

    // 1. Update Systype Factor Hint
    let x_hint = 1.5;
    if (sysType === 'geothermal') {
        x_hint = 2.5;
    } else {
        if (Q <= 10) x_hint = 3.0;
        else if (Q > 10 && Q <= 150) x_hint = (87 - 0.3 * Q) / 28;
        else x_hint = 1.5;
    }
    const displayX = document.getElementById('display-factor-x');
    if (displayX) {
        displayX.innerText = x_hint.toFixed(2);
    }

    const vgGroup = document.getElementById('grp-vgsolar');
    if (vgGroup) vgGroup.style.display = (sysType === 'solar') ? 'flex' : 'none';

    // 2. Pressures
    const isBenchmark = document.getElementById('mode-imi-benchmark')?.checked;
    const mP0 = isBenchmark ? (Hst <= 10.0 ? 0.28 : 0.23) : (document.getElementById('margin-p0')?.checked ? 0.3 : 0);
    const mPa = isBenchmark ? 0.30 : (document.getElementById('margin-pa')?.checked ? 0.3 : 0);
    const mPe = isBenchmark ? 0.20 : (document.getElementById('margin-pe')?.checked ? 0.2 : 0);
    const totalMargin = mP0 + mPa + mPe;

    const marginDisplay = document.getElementById('margin-total-display');
    if (marginDisplay) marginDisplay.innerText = totalMargin.toFixed(1) + " bar";

    // Auto-calculate Minimum needed psvs
    let p0 = Math.max((Hst / 10.0) + mP0, pz);
    let pa = p0 + mPa;
    let pe = pa + mPe;

    let min_psvs = 0;
    if (sysType === 'cooling' || sysType === 'solar' || sysType === 'geothermal' || sysType === 'heatpump') {
        min_psvs = Math.max(pe * 1.3, pe + 0.6);
    } else {
        min_psvs = Math.max(pe * 1.15, pe + 0.3);
    }

    const steps = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 9.0, 10.0];
    let recommended_psvs = steps.find(p => p >= min_psvs);
    if (!recommended_psvs) recommended_psvs = 10.0;

    let psvsSelect = document.getElementById('press-psvs');
    if (!userManuallySetPsvs) {
        // Force minimum 3.0 bar for the automatically selected value
        let auto_selected_psvs = Math.max(recommended_psvs, 3.0);
        psvsSelect.value = auto_selected_psvs.toFixed(1);
    }

    // Update minimum hint area (shows the theoretical minimum needed)
    const minHintEl = document.getElementById('psvs-min-hint');
    if (minHintEl) {
        minHintEl.innerText = `Minimum: ${recommended_psvs.toFixed(1)} bar`;
        if (parseFloat(psvsSelect.value) < min_psvs) {
            minHintEl.style.color = 'var(--danger)';
            minHintEl.style.fontWeight = '700';
        } else {
            minHintEl.style.color = 'var(--text-muted)';
            minHintEl.style.fontWeight = '400';
        }
    }

    let current_psvs = parseFloat(psvsSelect.value).toFixed(1);
    let svTable = (sysType !== 'heating' && sysType !== 'dh') ? svCooling[current_psvs] : svHeating[current_psvs];

    let selectedSV = null;
    if (svTable) {
        selectedSV = svTable.find(sv => sv.kW >= Q);
    }

    let typeName = (sysType === 'heating') ? "DGHSwiss" : "DGFSwiss";

    // --- Detailed Step-by-Step Selection Breakdown ---
    let stepsHtml = `
        <div style="font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.8rem; margin-bottom: 0.8rem;">
            <div style="font-weight: 700; color: var(--accent); margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Berechnungsschritte (Sicherheitszuschläge):</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem;">
                <div>1. Statische Last:</div><div style="text-align: right;"><b>${(Hst / 10).toFixed(2)} bar</b> (Hst/10)</div>
                <div>2. Mindestdruck p0:</div><div style="text-align: right;"><b>${p0.toFixed(2)} bar</b> (Hst/10 + 0,3)</div>
                <div>3. Fülldruck pa:</div><div style="text-align: right;"><b>${pa.toFixed(2)} bar</b> (p0 + 0,3)</div>
                <div>4. Enddruck pe:</div><div style="text-align: right;"><b>${pe.toFixed(2)} bar</b> (pa + 0,2)</div>
            </div>
            <div style="margin-top: 0.8rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                <span>Erforderlicher psvs (SWKI):</span>
                <span style="font-weight: 800; color: #fff;">≥ ${min_psvs.toFixed(2)} bar</span>
            </div>
            <div style="margin-top: 0.4rem; font-size: 0.75rem; color: var(--accent); opacity: 0.8; font-style: italic;">
                Diese APP wählt automatisch SV mit min. 3.0 bar.
            </div>
        </div>

        <div style="margin-bottom: 0.8rem;">
            <div style="font-weight: 700; color: var(--accent); margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Prüfungs-Check:</div>
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 6px;">
                <span>Eingestellt: <b>${current_psvs} bar</b></span>
                <span style="font-size: 0.8rem;">${parseFloat(current_psvs) >= min_psvs ?
            '<span style="color:var(--accent)">✅ OK (Konform)</span>' :
            '<span style="color:var(--danger)">❌ Zu niedrig!</span>'}</span>
            </div>
        </div>
    `;

    const recommendationEl = document.getElementById('sv-recommendation');
    if (selectedSV) {
        let isLow = parseFloat(psvsSelect.value) < min_psvs;
        recommendationEl.innerHTML = `
            ${stepsHtml}
            <div style="font-weight: 700; color: var(--accent); margin-bottom: 0.4rem; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Empfehlung / Dimensionierung:</div>
            <div style="background: ${isLow ? 'rgba(255, 78, 100, 0.1)' : 'rgba(0, 228, 161, 0.1)'}; border: 1px solid ${isLow ? 'var(--danger)' : 'var(--accent)'}; padding: 0.8rem; border-radius: 6px;">
                <div style="font-size: 1.1rem; font-weight: 800; margin-bottom: 0.2rem;">${typeName} DN ${selectedSV.dn} - ${current_psvs} bar</div>
                <div style="font-size: 0.8rem; opacity: 0.8;">Leistungreserve: bis <b>${selectedSV.kW} kW</b> (Bedarf: ${Q} kW)</div>
            </div>
        `;
        let rText = document.getElementById('sv-result-text');
        if (rText) rText.innerText = `${typeName} DN ${selectedSV.dn} - ${current_psvs} bar`;
    } else {
        recommendationEl.innerHTML = `
            ${stepsHtml}
            <div style="font-weight: 700; color: var(--danger); margin-bottom: 0.4rem; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Warnung:</div>
            <div style="background: rgba(255, 78, 100, 0.15); border: 1px solid var(--danger); padding: 0.8rem; border-radius: 6px;">
                <strong style="color:var(--danger)">Kein passendes einzelnes Ventil für ${Q} kW bei ${current_psvs} bar gefunden. Setzen Sie mehrere Ventile in Parallelschaltung ein.</strong>
            </div>
        `;
        let rText = document.getElementById('sv-result-text');
        if (rText) rText.innerText = `Parallele Ventile nötig`;
    }

    updatePsvsOverrideUi();
    checkQSync();
    if (typeof updateSidePanel === 'function') updateSidePanel();
}

window.userManuallySetQ = false;
let lastAutoQValue = null;
window.isProgrammaticQUpdate = false;

function setQInputValue(value) {
    const qEl = document.getElementById('power-q');
    if (!qEl) return;
    window.isProgrammaticQUpdate = true;
    qEl.value = value;
    window.isProgrammaticQUpdate = false;
}

function setQFromAuto(autoValue) {
    lastAutoQValue = autoValue;
    if (!userManuallySetQ) {
        setQInputValue(lastAutoQValue.toFixed(1));
    }
    syncQManualStateWithAuto();
    updateQOverrideUi();
}

function syncQManualStateWithAuto() {
    const qEl = document.getElementById('power-q');
    if (!qEl) return;

    const raw = qEl.value.trim();
    if (raw === '') {
        userManuallySetQ = false;
        return;
    }

    if (lastAutoQValue === null || isNaN(lastAutoQValue)) {
        userManuallySetQ = false;
        return;
    }

    const current = parseFloat(raw.replace(',', '.'));
    userManuallySetQ = Math.abs(current - lastAutoQValue) > 0.05;
}

function updateQOverrideUi() {
    const qEl = document.getElementById('power-q');
    const resetBtn = document.getElementById('btn-reset-power-q');
    if (!qEl || !resetBtn) return;

    if (userManuallySetQ) {
        qEl.style.background = 'rgba(255, 193, 7, 0.15)';
        qEl.style.borderColor = '#ffc107';
        resetBtn.style.display = 'block';
    } else {
        qEl.style.background = 'rgba(255, 255, 255, 0.05)';
        qEl.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        resetBtn.style.display = 'none';
    }
}

function checkQSync() {
    const globalQ = parseFloat(document.getElementById('power-q').value.replace(',', '.')) || 0;
    const activeVarSelect = document.querySelector('input[name="vs-variant"]:checked');
    if (!activeVarSelect) return;
    const activeVar = activeVarSelect.value;
    const hintEl = document.getElementById('q-sync-hint');
    if (!hintEl) return;

    let sumQ = 0;
    if (activeVar === 'v1') {
        let sumConsumers = 0;
        let sumGenerators = 0;

        // Sum up heating surfaces (consumers)
        document.querySelectorAll('#vs-variant-1 .v1-input-q, #vs-variant-1 .v1-custom-q').forEach(el => {
            sumConsumers += parseFloat(el.value.replace(',', '.')) || 0;
        });

        // Sum up heat sources (generators)
        document.querySelectorAll('#v1-vhs-generators .gen-power, #v1-vhs-generators .custom-gen-power').forEach(el => {
            sumGenerators += parseFloat(el.value.replace(',', '.')) || 0;
        });

        // The system power Q is the maximum of the consumer load and the generator capacity
        sumQ = Math.max(sumConsumers, sumGenerators);
    } else {
        // Variant 2 typically details generators; sum them up
        document.querySelectorAll('#v2-vhs-generators .gen-power, #v2-vhs-generators .custom-gen-power').forEach(el => {
            sumQ += parseFloat(el.value.replace(',', '.')) || 0;
        });
    }

    // Auto-update if not manually set
    if (sumQ > 0) {
        setQFromAuto(sumQ);
    }

    // Update mini-displays in variants
    const displayEl = document.getElementById(`${activeVar}-q-sum-display`);
    if (displayEl) {
        displayEl.textContent = `${sumQ.toFixed(1)} kW`;
    }

    if (sumQ > 0 && Math.abs(sumQ - globalQ) > 0.1) {
        hintEl.style.display = 'block';
        hintEl.style.color = '#ff4e64';
        hintEl.innerHTML = `⚠️ Abweichung: Summe in Details = <b>${sumQ.toFixed(1)} kW</b>`;
    } else if (sumQ > 0) {
        hintEl.style.display = 'block';
        hintEl.style.color = 'var(--accent)';
        hintEl.innerHTML = `✅ Synchron mit Details (${sumQ.toFixed(1)} kW)`;
    } else {
        hintEl.style.display = 'none';
    }
}


function updatePsvsOverrideUi() {
    const psvsEl = document.getElementById('press-psvs');
    if (!psvsEl) return;
    if (userManuallySetPsvs) {
        psvsEl.style.background = 'rgba(255, 165, 0, 0.15)'; // Amber tint
        psvsEl.style.borderColor = 'orange';
    } else {
        psvsEl.style.background = 'rgba(0, 0, 0, 0.2)';
        psvsEl.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    }
}

// Sync Visibility of Nested Selections
function syncNestedVisibility() {
    const isStatico = document.getElementById('fav-statico').checked;
    const isSimply = document.getElementById('fav-simply').checked;
    const isConnect = document.getElementById('fav-connectf').checked || document.getElementById('fav-connect-floor').checked;
    const isTransfero = document.getElementById('fav-transfero').checked;

    document.getElementById('grp-statico-vordruck').style.display = isStatico ? 'block' : 'none';
    document.getElementById('grp-nachspeisung').style.display = isSimply ? 'block' : 'none';
    document.getElementById('grp-vessel-series').style.display = isConnect ? 'block' : 'none';
    document.getElementById('grp-transfero-series').style.display = isTransfero ? 'block' : 'none';
}

function updateVordruckHint(p0_auto) {
    const vordruckEl = document.getElementById('statico-vordruck');
    const hintEl = document.getElementById('statico-vordruck-hint');
    if (!vordruckEl || !hintEl) return;
    const custom = parseFloat(vordruckEl.value);
    if (!isNaN(custom) && vordruckEl.value.trim() !== '') {
        hintEl.textContent = `= ${custom.toFixed(2)} bar (benutzerdefiniert)`;
        hintEl.style.color = 'var(--accent)';
    } else {
        hintEl.textContent = `= ${p0_auto.toFixed(2)} bar (p₀ aus Hst)`;
        hintEl.style.color = 'var(--text-muted)';
    }
}

document.querySelectorAll('#fav-statico, #fav-simply, #fav-connectf, #fav-connect-floor, #fav-transfero').forEach(cb => {
    cb.addEventListener('change', (e) => {
        const triggerIds = ['fav-simply', 'fav-connectf', 'fav-connect-floor', 'fav-transfero'];
        const marginPe = document.getElementById('margin-pe');

        // AUTOMATION: If one of the "Druckautomaten" is checked
        if (e.target.checked && triggerIds.includes(e.target.id)) {
            if (marginPe && !marginPe.checked) {
                marginPe.checked = true;
                // Subtle hint when auto-activated
                showCustomAlert("Der +0.2 bar Arbeitsbereich wurde automatisch für den Druckautomaten aktiviert.", "System-Info");
            }
        } 
        // DEACTIVATION: If one is unchecked, check if ANY other is still checked
        else if (!e.target.checked && triggerIds.includes(e.target.id)) {
            const anyChecked = triggerIds.some(id => document.getElementById(id)?.checked);
            if (!anyChecked && marginPe && marginPe.checked) {
                marginPe.checked = false;
                showCustomAlert("Sicherheitszuschlag (+0.2 bar) wurde deaktiviert, da kein Druckautomat gewählt ist.", "System-Info");
            }
        }

        syncNestedVisibility();
        autoRefreshSV();
    });
});

// PREVENT MANUAL DEACTIVATION: If a Druckautomat is selected, pe margin MUST stay active
document.getElementById('margin-pe').addEventListener('click', function(e) {
    const triggerIds = ['fav-simply', 'fav-connectf', 'fav-connect-floor', 'fav-transfero'];
    const anyChecked = triggerIds.some(id => document.getElementById(id)?.checked);
    
    if (anyChecked && !this.checked) {
        // Force stay checked if any automation is active
        e.preventDefault();
        this.checked = true;
        
        showCustomAlert(
            "Der Arbeitsbereich von +0.2 bar ist für Präzisions-Druckautomaten zwingend erforderlich. Er garantiert eine stabile Druckhaltung und verhindert, dass das Sicherheitsventil unnötig anspricht.",
            "Zuschlag erforderlich"
        );
    }
});

document.getElementById('btn-reset-statico-vordruck').addEventListener('click', () => {
    const factoryEl = document.getElementById('statico-p0-factory');
    // Hole den numerischen Wert (z.B. "1.5 bar" -> 1.5)
    const factoryVal = factoryEl ? parseFloat(factoryEl.value) : 1.5;
    const p0 = isNaN(factoryVal) ? 1.5 : factoryVal;
    
    document.getElementById('statico-vordruck').value = p0.toFixed(1);
    autoRefreshSV();
    if (typeof window.showToast === 'function') {
        window.showToast(`Auf Werkseinstellung (${p0.toFixed(1)} bar) gesetzt.`);
    }
});
document.getElementById('statico-vordruck').addEventListener('input', autoRefreshSV);

// --- CUSTOM ALERT LOGIC ---
window.showCustomAlert = function(message, title = "System-Hinweis") {
    const modal = document.getElementById('custom-alert');
    const msgEl = document.getElementById('custom-alert-message');
    const titleEl = document.getElementById('custom-alert-title');
    
    if (modal && msgEl) {
        msgEl.innerText = message;
        if (titleEl) titleEl.innerText = title;
        modal.classList.remove('hidden');
        modal.classList.add('active');
    } else {
        alert(title + ": " + message);
    }
};

window.closeCustomAlert = function() {
    const modal = document.getElementById('custom-alert');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

window.userManuallySetVs = false;
let lastAutoVsValue = null;
window.isProgrammaticVsUpdate = false;

function setVsInputValue(value) {
    const vsEl = document.getElementById('vol-vs');
    if (!vsEl) return;
    window.isProgrammaticVsUpdate = true;
    vsEl.value = value;
    window.isProgrammaticVsUpdate = false;
}

function setVsFromAuto(autoValue) {
    lastAutoVsValue = Math.round(autoValue);
    if (!userManuallySetVs) {
        setVsInputValue(lastAutoVsValue);
    }
    syncVsManualStateWithAuto();
    updateVsOverrideUi();
}

function syncVsManualStateWithAuto() {
    const vsEl = document.getElementById('vol-vs');
    if (!vsEl) return;

    const raw = vsEl.value.trim();
    if (raw === '') {
        userManuallySetVs = false;
        return;
    }

    if (lastAutoVsValue === null || isNaN(lastAutoVsValue)) {
        // Auto baseline not ready yet -> keep default auto mode
        userManuallySetVs = false;
        return;
    }

    const current = window.safeMathEval(raw);
    userManuallySetVs = Math.abs(current - lastAutoVsValue) > 0.0001;
}

function updateVsOverrideUi() {
    const vsEl = document.getElementById('vol-vs');
    const resetBtn = document.getElementById('btn-reset-vs');
    if (!vsEl || !resetBtn) return;

    if (userManuallySetVs) {
        vsEl.style.background = 'rgba(255, 193, 7, 0.15)';
        vsEl.style.borderColor = '#ffc107';
        resetBtn.style.display = 'block';
    } else {
        vsEl.style.background = 'rgba(0, 228, 161, 0.05)';
        vsEl.style.borderColor = 'var(--accent)';
        resetBtn.style.display = 'none';
    }
}

document.getElementById('vol-vs').addEventListener('input', () => {
    if (window.isProgrammaticVsUpdate) return;
    syncVsManualStateWithAuto();
    updateVsOverrideUi();
    autoRefreshSV();
});

document.getElementById('btn-reset-vs').addEventListener('click', () => {
    userManuallySetVs = false;
    if (lastAutoVsValue !== null) {
        setVsInputValue(lastAutoVsValue);
    }
    updateVsOverrideUi();
    autoRefreshSV();
});

document.getElementById('power-q').addEventListener('input', () => {
    if (window.isProgrammaticQUpdate) return;
    syncQManualStateWithAuto();
    updateQOverrideUi();
    autoRefreshSV();
});

document.getElementById('btn-reset-power-q').addEventListener('click', () => {
    userManuallySetQ = false;
    if (lastAutoQValue !== null) {
        setQInputValue(lastAutoQValue.toFixed(1));
    }
    updateQOverrideUi();
    autoRefreshSV();
});

// --- UI RESET: Hide results when core parameters change ---
function hideResults() {
    const results = document.getElementById('results');
    const report = document.getElementById('report-view');
    if (results) {
        results.classList.add('hidden');
        results.style.display = 'none'; // Force hide
    }
    if (report) {
        report.classList.add('hidden');
        report.style.display = 'none';
    }
}

// Vhs inputs are intentionally independent per variant (no sync)
document.querySelectorAll('#calc-form input, #calc-form select').forEach(el => {
    if (el.id === 'press-psvs') {
        el.addEventListener('change', () => {
            if (!window.isProgrammaticPsvsUpdate) {
                window.userManuallySetPsvs = true;
                updatePsvsOverrideUi();
                hideResults(); // Collapse results on manual change
            }
            autoRefreshSV();
        });
    } else if (el.id === 'height-hst' || el.id === 'press-pz') {
        // ALWAYS reset manual psvs mode when core pressure-defining parameters change
        el.addEventListener('input', () => {
            window.userManuallySetPsvs = false;
            autoRefreshSV();
            hideResults();
        });
        el.addEventListener('change', () => {
            window.userManuallySetPsvs = false;
            autoRefreshSV();
            hideResults();
        });
    } else {
        el.addEventListener('input', () => {
            autoRefreshSV();
            // Don't hide for every minor typing in project name, but for system params
            if (['power-q', 'vol-vs', 'temp-smax', 'temp-r', 'system-type', 'fluid-type', 'makeup-water', 'statico-vordruck'].includes(el.id)) {
                hideResults();
            }
        });
        el.addEventListener('change', () => {
            autoRefreshSV();
            if (['power-q', 'vol-vs', 'temp-smax', 'temp-r', 'system-type', 'fluid-type', 'makeup-water', 'statico-vordruck'].includes(el.id)) {
                hideResults();
            }
        });
    }
});

// ==========================================
// WATER CONTENT CALCULATION LOGIC (Vs)
// ==========================================

function handleVsCalculation() {
    // When switching variants, we assume the user wants to use the calculated result of that variant.
    // Therefore, we reset the manual override flag.
    userManuallySetVs = false;

    const variant = document.querySelector('input[name="vs-variant"]:checked').value;
    const v1Section = document.getElementById('vs-variant-1');
    const v2Section = document.getElementById('vs-variant-2');
    const v1Band = document.getElementById('v1-band');
    const v2Band = document.getElementById('v2-band');

    if (variant === 'v1') {
        v1Section.classList.remove('hidden');
        v2Section.classList.add('hidden');
        v1Band.style.borderColor = 'var(--accent)';
        v2Band.style.borderColor = 'var(--border-color)';
        updateV1Estimate();
    } else {
        v1Section.classList.add('hidden');
        v2Section.classList.remove('hidden');
        v1Band.style.borderColor = 'var(--border-color)';
        v2Band.style.borderColor = 'var(--accent)';
        updateV2Detailed();
    }
    if (typeof autoRefreshSV === 'function') autoRefreshSV();
    if (typeof updateSidePanel === 'function') updateSidePanel();
}

function updateV1Estimate() {
    let heatingVs = 0;

    document.querySelectorAll('.v1-item').forEach(item => {
        const type = item.getAttribute('data-type');
        const tempPair = item.querySelector('.v1-temp-select').value;
        const q = parseFloat(item.querySelector('.v1-input-q').value) || 0;

        let vsFactor = 0;
        if (table4[tempPair]) {
            vsFactor = table4[tempPair][type] || 0;
        }

        const res = q * vsFactor;
        heatingVs += res;

        // Update info text
        const info = item.querySelector('.v1-calc-info');
        info.innerHTML = `<span>${vsFactor.toFixed(1)}</span> ℓ/kW &times; <span>${q}</span> kW = <strong>${res.toFixed(1)}</strong><span style="color:var(--accent);font-weight:700;"> ℓ</span>`;
    });

    // Add Custom V1 Items
    document.querySelectorAll('.v1-custom-item').forEach(item => {
        const factor = parseFloat(item.querySelector('.v1-custom-factor').value.replace(',', '.')) || 0;
        const q = parseFloat(item.querySelector('.v1-custom-q').value.replace(',', '.')) || 0;
        const res = factor * q;
        heatingVs += res;

        const info = item.querySelector('.v1-calc-info');
        if (info) {
            info.innerHTML = `<span>${factor.toFixed(1)}</span> ℓ/kW &times; <span>${q}</span> kW = <strong>${res.toFixed(1)}</strong><span style="color:var(--accent);font-weight:700;"> ℓ</span>`;
        }
    });

    // Add V1 Pipes
    let pipeVs = 0;
    document.querySelectorAll('#v1-pipe-list .pipe-row').forEach(row => {
        pipeVs += calcSinglePipeRow(row);
    });

    // Add V1 apparatus
    let appVs = 0;
    document.querySelectorAll('#v1-apparatus-list .app-row').forEach(row => {
        const vol = parseFloat(row.querySelector('.app-vol').value) || 0;
        appVs += vol;
    });

    // Vhs inclusion
    const vhsVol = parseFloat(document.getElementById('vhs-res-v1').innerText) || 0;

    const totalVs = heatingVs + pipeVs + appVs + vhsVol;
    document.getElementById('v1-result-val').innerText = totalVs.toFixed(1);

    // Only update main Vs if this variant is active and not manually overridden
    const activeVariant = document.querySelector('input[name="vs-variant"]:checked').value;
    if (activeVariant === 'v1') {
        setVsFromAuto(totalVs);
    }

    if (typeof window.updatePipePreview === 'function') window.updatePipePreview('v1');
    if (typeof autoRefreshSV === 'function') autoRefreshSV();
}

function updateV2Detailed() {
    // Add V2 Pipes
    let totalPipes = 0;
    document.querySelectorAll('#vs-variant-2 #pipe-rows-container .pipe-row').forEach(row => {
        totalPipes += calcSinglePipeRow(row);
    });

    // Special custom diameter rows (Variant 2 only)
    document.querySelectorAll('#vs-variant-2 .pipe-row-special').forEach(row => {
        const dia = parseFloat(row.querySelector('.pipe-spec-dia').value) || 0;
        const length = parseFloat(row.querySelector('.pipe-length').value) || 0;

        // Formula: PI * (d/2)^2 * 1000 / 1000000 = PI * d^2 / 4000
        let l_per_m = (Math.PI * Math.pow(dia, 2)) / 4000;
        const rowTotal = length * l_per_m;

        row.querySelector('.spec-calc-preview').innerText = l_per_m.toFixed(2) + " ℓ/m";
        totalPipes += rowTotal;
        row.querySelector('.row-res').innerText = rowTotal.toFixed(1) + " ℓ";
    });

    let totalApp = 0;
    document.querySelectorAll('#vs-variant-2 #app-rows-container .app-row').forEach(row => {
        totalApp += parseFloat(row.querySelector('.app-vol').value) || 0;
    });

    // Vhs inclusion
    const vhsVol = parseFloat(document.getElementById('vhs-res-v2').innerText) || 0;

    const total = totalPipes + totalApp + vhsVol;
    document.getElementById('v2-result-val').innerText = total.toFixed(1);

    // Only update main Vs if this variant is active and not manually overridden
    const activeVariant = document.querySelector('input[name="vs-variant"]:checked').value;
    if (activeVariant === 'v2') {
        setVsFromAuto(total);
    }

    refreshPipeVisibility();
    refreshAppVisibility();
    if (typeof window.updatePipePreview === 'function') window.updatePipePreview('v2');
    if (typeof autoRefreshSV === 'function') autoRefreshSV();
}


function calcSinglePipeRow(row) {
    const select = row.querySelector('.pipe-dn');
    const customInput = row.querySelector('.pipe-custom-v');
    const customUnit = row.querySelector('.custom-unit-tag');
    const length = parseFloat(row.querySelector('.pipe-length').value) || 0;

    let l_per_m = 0;
    const selectedIndex = select.value;
    const selectedItem = (selectedIndex === "custom") ? pipeDataExt.find(i => i.custom) : pipeDataExt[selectedIndex];

    if (selectedItem && selectedItem.custom) {
        customInput.style.display = 'block';
        if (customUnit) customUnit.style.display = 'block';
        const dia = parseFloat(customInput.value) || 0;
        l_per_m = (Math.PI * Math.pow(dia, 2)) / 4000;
    } else {
        customInput.style.display = 'none';
        if (customUnit) customUnit.style.display = 'none';
        l_per_m = (selectedItem && selectedItem.v) ? selectedItem.v : 0;
    }

    const rowTotal = length * l_per_m;
    row.querySelector('.row-res').innerText = rowTotal.toFixed(1) + " ℓ";
    return rowTotal;
}

function addPipeRow(initialIndex = null, containerId = 'pipe-rows-container', updateFn = updateV2Detailed) {
    const container = document.getElementById(containerId);
    const div = document.createElement('div');
    div.className = 'calc-row pipe-row animate-in';

    let optionsHtml = pipeDataExt.map((item, index) => {
        const val = item.custom ? "custom" : index;
        const label = item.custom ? item.label : `${item.label} (${item.v.toFixed(2)} ℓ/m)`;
        return `<option value="${val}">${label}</option>`;
    }).join('');

    div.innerHTML = `
        <div style="flex: 1.8; display: flex; flex-direction: column; gap: 4px; min-width: 0;">
            <select class="pipe-dn" tabindex="-1" onkeydown="event.preventDefault(); this.blur(); return false;" onchange="this.blur();" style="width: 100%;">
                ${optionsHtml}
            </select>
            <div class="input-group" style="width: 100%;">
                <input type="text" inputmode="decimal" class="pipe-custom-v" placeholder="Ø eingeben" step="0.1" style="display:none; margin-top: 4px;">
                <span class="unit-tag custom-unit-tag" style="display:none; margin-top: 5px;">mm</span>
            </div>
        </div>
        <div class="input-group" style="flex: 1;">
            <input type="text" inputmode="decimal" class="pipe-length" placeholder="Länge" step="0.1" min="0">
            <span class="unit-tag">m</span>
        </div>
        <div class="row-res" style="flex: 0 0 75px; text-align: right; font-weight: 700; color: var(--accent); font-size: 0.9rem;">0.0 l</div>
        <button type="button" class="btn-remove-row" style="width: 40px; height: 40px; font-size: 1rem; flex: 0 0 40px;">&times;</button>
    `;

    if (initialIndex !== null) {
        div.querySelector('.pipe-dn').value = initialIndex;
    }

    div.querySelector('.btn-remove-row').onclick = () => { div.remove(); updateFn(); };

    const sel = div.querySelector('.pipe-dn');
    sel.onchange = () => {
        calcSinglePipeRow(div);
        updateFn();
    };

    div.querySelectorAll('input').forEach(el => {
        el.oninput = updateFn;
    });

    container.appendChild(div);
    // Initial state
    calcSinglePipeRow(div);
}

function initPipeRows() {
    const container = document.getElementById('pipe-rows-container');
    container.innerHTML = '';
    pipeDataExt.forEach((item, index) => {
        if (!item.custom) {
            addPipeRow(index);
        }
    });
    updateV2Detailed();
}

window.addV1CustomItemRow = function () {
    const container = document.getElementById('v1-custom-items-container');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'calc-row v1-custom-item animate-in';
    div.style = "display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;";

    div.innerHTML = `
        <input type="text" class="v1-custom-label" placeholder="Bezeichnung" 
            style="flex: 1.2; font-size: 0.85rem; padding: 0.4rem; background: #fff !important; border: 1px solid #ccc !important; color: #000 !important; border-radius: 6px;">
        <div style="position: relative; flex: 0.6; display: flex;">
            <input type="text" inputmode="decimal" class="v1-custom-factor" placeholder="ℓ/kW" 
                style="width: 100%; font-size: 0.85rem; padding: 0.4rem; background: #fff !important; border: 1px solid #ccc !important; color: #000 !important; text-align: center; border-radius: 6px;">
        </div>
        <div style="position: relative; flex: 0.7; display: flex;">
            <input type="text" inputmode="decimal" class="v1-custom-q" placeholder="Q [kW]" 
                style="width: 100%; font-size: 0.85rem; padding: 0.4rem; background: #fff !important; border: 1px solid #ccc !important; color: #000 !important; text-align: center; border-radius: 6px;">
        </div>
        <div class="v1-calc-info" style="flex: 1.5; font-size: 0.75rem; text-align: right; opacity: 0.8; color: #fff;">
            0 ℓ/kW &times; 0 kW = <strong>0</strong> ℓ
        </div>
        <button type="button" class="btn-remove-row" style="width: 32px; height: 32px; font-size: 1.5rem; flex: 0 0 32px; background: none; border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center;">&times;</button>
    `;

    div.querySelector('.btn-remove-row').onclick = () => {
        div.remove();
        updateV1Estimate();
    };

    div.querySelectorAll('input').forEach(el => {
        el.oninput = updateV1Estimate;
    });

    container.appendChild(div);
};

function refreshPipeVisibility() {
    const content = document.getElementById('pipes-collapsible');
    if (!content) return;

    // Legacy guard: this block is controlled by compact mode, not hidden-section
    content.classList.remove('hidden-section');

    const isCompact = content.classList.contains('is-compact-mode');
    const rows = document.querySelectorAll('#pipe-rows-container .pipe-row, #pipe-rows-container .pipe-row-special');

    rows.forEach(row => {
        if (isCompact) {
            const lengthInput = row.querySelector('.pipe-length');
            const length = lengthInput ? (window.safeMathEval(lengthInput.value) || 0) : 0;
            if (length <= 0) {
                row.style.display = 'none';
            } else {
                row.style.display = 'flex';
            }
        } else {
            // Force full expanded state
            row.style.display = 'flex';
        }
    });
}

function togglePipes() {
    const content = document.getElementById('pipes-collapsible');
    const icon = document.getElementById('pipes-toggle-icon');
    if (!content || !icon) return;

    // Legacy guard: ensure this section is never collapsed by hidden-section
    content.classList.remove('hidden-section');

    // We don't hide the container itself; compact mode only hides empty rows.
    const isCompact = content.classList.toggle('is-compact-mode');
    icon.style.transform = isCompact ? 'rotate(-90deg)' : 'rotate(0deg)';

    refreshPipeVisibility();
}

function addSpecialPipeRow() {
    const container = document.getElementById('pipe-rows-container');
    const div = document.createElement('div');
    div.className = 'calc-row pipe-row-special animate-in';
    div.innerHTML = `
        <input type="text" class="pipe-spec-label" placeholder="Bezeichnung" style="flex: 0.7;">
        <div class="input-group" style="flex: 0.6;">
            <input type="text" inputmode="decimal" class="pipe-spec-dia" placeholder="Ø i" step="0.1">
            <span class="unit-tag">mm</span>
        </div>
        <div class="spec-calc-preview" style="flex: 0.6; font-size: 0.85rem; color: var(--text-muted); text-align: center; white-space: nowrap;">0.00 ℓ/m</div>
        <div class="input-group" style="flex: 1;">
            <input type="text" inputmode="decimal" class="pipe-length" placeholder="Länge" step="0.1" min="0">
            <span class="unit-tag">m</span>
        </div>
        <div class="row-res" style="flex: 0 0 80px; text-align: right; font-weight: 600; color: var(--accent);">0.0 l</div>
        <button type="button" class="btn-remove-row">&times;</button>
    `;
    div.querySelector('.btn-remove-row').onclick = () => { div.remove(); updateV2Detailed(); };
    div.querySelectorAll('input').forEach(el => el.oninput = updateV2Detailed);
    container.appendChild(div);
}

function refreshAppVisibility() {
    const content = document.getElementById('app-collapsible');
    if (!content) return;
    const isHidden = content.classList.contains('hidden-section');
    const rows = document.querySelectorAll('#app-rows-container .app-row');

    rows.forEach(row => {
        if (isHidden) {
            const vol = parseFloat(row.querySelector('.app-vol').value) || 0;
            if (vol <= 0) {
                row.style.display = 'none';
            } else {
                row.style.display = 'flex';
            }
        } else {
            row.style.display = 'flex';
        }
    });
}

function toggleApparatus() {
    const content = document.getElementById('app-collapsible');
    const icon = document.getElementById('app-toggle-icon');
    const isHidden = content.classList.toggle('hidden-section');
    icon.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
    refreshAppVisibility();
}

function addAppRow(containerId = 'app-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'calc-row app-row animate-in';
    div.innerHTML = `
        <input type="text" class="app-label" placeholder="Zus. Vol./Bezeichnung" style="flex: 1.8;">
        <div class="input-group" style="flex: 1;">
            <input type="text" inputmode="decimal" class="app-vol" placeholder="Inhalt" step="1" min="0">
            <span class="unit-tag">ℓ</span>
        </div>
        <div style="flex: 0 0 75px;"></div> <!-- Spacer to match pipe result field -->
        <button type="button" class="btn-remove-row" style="width: 40px; height: 40px; font-size: 1rem; flex: 0 0 40px;">&times;</button>
    `;
    const updateFn = (containerId === 'v1-apparatus-list') ? updateV1Estimate : updateV2Detailed;

    div.querySelector('.btn-remove-row').onclick = () => {
        const rows = container.querySelectorAll('.app-row');
        if (rows.length > 1) {
            div.remove();
            updateFn();
        } else {
            // Immer eine Zeile vorhanden lassen (Felder leeren)
            div.querySelector('.app-label').value = '';
            div.querySelector('.app-vol').value = '';
            updateFn();
        }
    };

    div.querySelectorAll('input').forEach(el => el.oninput = updateFn);
    container.appendChild(div);
}

// Initial row for Variant 2
addAppRow('app-rows-container');

// Global click listeners
document.getElementById('btn-v1-add-apparatus').onclick = () => addAppRow('v1-apparatus-list');

// Initializing Vs Logic
document.querySelectorAll('input[name="vs-variant"]').forEach(radio => {
    radio.addEventListener('change', handleVsCalculation);
});

document.querySelectorAll('.v1-input-q, .v1-temp-select').forEach(el => {
    el.addEventListener('input', updateV1Estimate);
});

document.getElementById('btn-add-pipe').onclick = () => addPipeRow();
document.getElementById('btn-add-pipe-spec').onclick = addSpecialPipeRow;
document.getElementById('btn-v1-add-pipe').onclick = () => addPipeRow(null, 'v1-pipe-list', updateV1Estimate);
document.getElementById('btn-v1-add-apparatus').onclick = () => addAppRow('v1-apparatus-list');
document.getElementById('btn-add-app').onclick = () => addAppRow('app-rows-container');

function toggleAlternatives() {
    const content = document.getElementById('alternatives-collapsible');
    const icon = document.getElementById('alternatives-toggle-icon');
    const isHidden = content.classList.toggle('hidden-section');
    icon.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
}

// ===== LEXICON DATA (Terminologie) =====
const LEXICON = {
    "B": "Charakteristische Baubreite des Gerätes",
    "D": "Charakteristischer Durchmesser des Gerätes",
    "DN": "Nennweite; numerische Grössenangabe für Rohrdimensionen",
    "dpu": "Arbeitsdruckbereich, für den ein Gerät ausgelegt ist",
    "e": "Ausdehnungskoeffizient nach EN 12828",
    "ehs": "Ausdehnungskoeffizient Speicher für Wärme/Kältespeicher",
    "Hst": "Statische Höhe; Wassersäule zwischen höchstem Punkt und Anschluss",
    "pa": "Anfangsdruck; Unterwert für eine optimale Druckhaltung",
    "pe": "Enddruck; Oberwert für eine optimale Druckhaltung",
    "Pel": "Elektrische Anschlussleistung für ein Elektrogerät",
    "PF": "Druckfaktor; Verhältnis des erforderlichen Nennvolumens zum Wasser-Aufnahmevolumen",
    "p0": "Vordruck; Gasvordruck im Gefäss (bei Compresso = pa - 0.3)",
    "psvs": "Ansprechdruck Sicherheitsventil (psv)",
    "pv": "Verdampfungsdruck nach EN 12828",
    "Q": "Wärmeleistung zur Grössenbestimmung der Geräte",
    "Ve": "Ausdehnungsvolumen nach EN 12828",
    "Vi": "Teilwasserinhalt: Das Wasservolumen eines ganz bestimmten Teils oder Abschnitts i der Anlage (z.B. nur die Fussbodenheizung, nur die Steigleitungen oder nur ein spezieller Pufferspeicher)",
    "ei": "Teilspezifischer Ausdehnungskoeffizient: Der Ausdehnungskoeffizient, der exakt für die Temperatur gilt, die in diesem Abschnitt i herrscht",
    "Vhs": "Gesamtwasserinhalt von Wärme- und Kältespeichern",
    "VN": "Nennvolumen; gesamtes inneres Volumen des Druckraumes",
    "Vs": "Wasserinhalt Anlage gesamt nach EN 12828",
    "Vwr": "Wasservorlage nach EN 12828 (Reservematerial)",
    "X": "Reservefaktor / Wasservorlage (Zuschlag)",
    "tsmax": "Maximale Systemtemperatur zur Berechnung der Ausdehnung"
};

/**
 * Helper: Get mini-legend for a piece of text
 */
window.showContextHelp = function (btn) {
    const section = btn.closest('.report-step');
    const text = section.innerText;
    let found = [];

    // Scan text for keys (simple check for now)
    Object.keys(LEXICON).forEach(key => {
        // Use regex for whole word match to avoid 'e' matching everywhere
        const regex = new RegExp("\\b" + key + "\\b", "g");
        if (regex.test(text)) {
            found.push(`<li><strong>${key}:</strong> ${LEXICON[key]}</li>`);
        }
    });

    if (found.length === 0) return;

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'context-help-popup';
    popup.innerHTML = `
        <div class="help-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #ddd; padding-bottom:5px;">
                <h4 style="margin:0; color:var(--accent)">Erklärung der Kürzel</h4>
                <button onclick="this.closest('.context-help-popup').remove()" style="background:none; border:none; color:#666; cursor:pointer; font-size:20px; font-weight:bold;">&times;</button>
            </div>
            <ul style="margin:0; padding-left:15px; font-size:0.85rem; color:#333; list-style:disc;">
                ${found.join('')}
            </ul>
        </div>
    `;

    // Position near button
    const rect = btn.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = (rect.left - 200) + 'px';
    popup.style.top = (rect.top + 25) + 'px';

    document.body.appendChild(popup);

    // Close on click outside
    setTimeout(() => {
        const closer = (e) => {
            if (!popup.contains(e.target) && e.target !== btn) {
                popup.remove();
                document.removeEventListener('click', closer);
            }
        };
        document.addEventListener('click', closer);
    }, 10);
};

// Global state and UI references
let previewTimer = null;
const previewPopup = document.createElement('div');
previewPopup.className = 'vessel-preview-popup';
document.body.appendChild(previewPopup);

function attachImagePreview(el, labelText) {
    el.style.cursor = 'help';

    el.onmouseenter = (e) => {
        let type = 'connectf';
        const text = labelText.toLowerCase();

        if (text.includes('statico') || text.includes('sd') || text.includes('su')) {
            if (text.includes('sd')) type = 'statico SD';
            else if (text.includes('su')) type = 'statico SU';
            else type = 'statico';
        }
        else if (text.includes('c 10.1') && text.includes('f') && text.includes('connect')) type = 'Compresso C 10.1 F Connect Steue';
        else if (text.includes('c 10.1') && text.includes('connect')) type = 'Compresso C 10.1 Connect Steue';
        else if (text.includes('cu')) type = 'Compresso CU';
        else if (text.includes('simply')) type = 'simply';
        else if (text.includes('transfero')) type = 'transfero';
        else if (text.includes('connect f')) type = 'connectf';
        else if (text.includes('compresso')) type = 'connect'; // Standalone fallback

        previewTimer = setTimeout(() => {
            const rect = el.getBoundingClientRect();
            let fileName = type + ".png";
            if (type.includes('Compresso C 10.1')) fileName = type + ".PNG";

            previewPopup.innerHTML = `
                <div class="vessel-preview-tag">IMI Pneumatex</div>
                <div class="vessel-preview-title">${type.toUpperCase()} Serie</div>
                <img src="${fileName}" alt="${type}">
                <div class="vessel-preview-tag" style="font-size:0.7rem; opacity:0.5;">Farbige Produktansicht</div>
            `;

            // Positioning (fixed to viewport)
            let x = rect.left + (rect.width / 2) - 140;
            let y = rect.top - 310;
            if (y < 10) y = rect.bottom + 10;

            // Boundary checks
            if (x < 10) x = 10;
            if (x + 280 > window.innerWidth) x = window.innerWidth - 290;

            previewPopup.style.left = x + 'px';
            previewPopup.style.top = y + 'px';
            previewPopup.classList.add('visible');
        }, 500); // Snappier 0.5s delay
    };

    el.onmouseleave = () => {
        clearTimeout(previewTimer);
        previewPopup.classList.remove('visible');
    };
}

// Helper for alternative calculations
function calcVesselsAlt(VN, psvs, series, type = 'ConnectF') {

    let basePS = '6';
    if (series === 'CU' && psvs <= 4.0) basePS = '4';
    else if (psvs > 6.0) basePS = '10';

    const sizes = vesselData[series][basePS] || vesselData[series]['6'];
    const maxV = sizes[sizes.length - 1];
    let res = [];
    let rem = VN;

    let b = sizes.find(i => i.v >= rem);
    if (b) {
        res.push(`1x ${series} ${b.v}.${basePS}`);
    } else {
        res.push(`1x ${series} ${maxV.v}.${basePS} Basis`);
        rem -= maxV.v;
        while (rem > 0) {
            let e = sizes.find(i => i.v >= rem);
            if (e) {
                res.push(`1x ${series} ${e.v}.${basePS} E`);
                rem -= e.v;
            } else {
                res.push(`1x ${series} ${maxV.v}.${basePS} E`);
                rem -= maxV.v;
            }
        }
    }
    return res.join(" + ");
}

document.addEventListener('DOMContentLoaded', () => {
    handleVsCalculation();
    initPipeRows(); // Pre-populate pipe rows
    ensureDefaultVhsRows('v1');
    ensureDefaultVhsRows('v2');
    syncNestedVisibility();
});




// Removed redundant DOMContentLoaded listener as initializeApp handles it on 'load'

let isCalculating = false;
window.calculateAll = function (showResultsUI = true) {
    if (isCalculating) return;
    isCalculating = true;

    try {
        if (showResultsUI && !isTriggeredByModal) {
            // Force re-ask for strategy every time "Start" is clicked (only for IMI Benchmark + Statico)
            const isBenchmark = document.getElementById('mode-imi-benchmark')?.checked;
            const favStatico = document.getElementById('fav-statico')?.checked;
            if (isBenchmark && favStatico) {
                imiP0Strategy = null;
            }
        }

        const activeVar = document.querySelector('input[name="vs-variant"]:checked').value;
    const vhsId = (activeVar === 'v1') ? 'vol-vhs' : 'vol-vhs-v2-proxy';

    const inputs = {
        'power-q': document.getElementById('power-q'),
        'vol-vs': document.getElementById('vol-vs'),
        'vol-vhs': document.getElementById(vhsId),
        'temp-smax': document.getElementById('temp-smax'),
        'temp-r': document.getElementById('temp-r'),
        'height-hst': document.getElementById('height-hst'),
        'press-pz': document.getElementById('press-pz'),
        'system-type': document.getElementById('system-type'),
        'fluid-type': document.getElementById('fluid-type'),
        'press-psvs': document.getElementById('press-psvs')
    };

    let hasErrors = false;

    // Clear previous errors and highlights
    if (showResultsUI) {
        for (const key in inputs) {
            if (!inputs[key]) continue;
            inputs[key].style.borderColor = '';
            inputs[key].style.boxShadow = '';
            inputs[key].style.backgroundColor = ''; // Clear yellow
        }
    }

    // Validate inputs
    for (const key in inputs) {
        if (!inputs[key]) continue;
        const val = inputs[key].value.trim();
        const isSelect = inputs[key].tagName === 'SELECT';
        
        // Validation logic
        let isInvalid = false;
        if (val === '') {
            isInvalid = true;
        } else if (!isSelect && isNaN(parseFloat(val.replace(',', '.')))) {
            // Only check for numeric validity if it's NOT a select field
            isInvalid = true;
        }

        if (isInvalid) {
            // Vhs fields can be empty (defaults to 0), don't mark as error if empty
            if (key === 'vol-vhs' && val === '') {
                continue; 
            }
            
            if (showResultsUI) {
                // MISSING/INVALID FIELDS -> VIBRANT YELLOW
                inputs[key].style.backgroundColor = 'rgba(255, 255, 0, 0.25)';
                inputs[key].style.borderColor = '#FFFF00';
                inputs[key].style.boxShadow = '0 0 12px rgba(255, 255, 0, 0.4)';
            }
            hasErrors = true;
        } else {
            // Field is valid -> Keep normal background
            if (showResultsUI) {
                inputs[key].style.backgroundColor = ''; 
                inputs[key].style.borderColor = '';
                inputs[key].style.boxShadow = '';
            }
        }
    }

    if (hasErrors) {
        if (showResultsUI) {
            const resHtml = document.getElementById('results');
            resHtml.style.display = 'block';
            resHtml.classList.remove('hidden');

            // HIDE ALL RESULTS COMPONENTS EXCEPT STATUS MESSAGE
            const resultGrid = resHtml.querySelector('.result-grid');
            const infoLayout = resHtml.querySelector('.results-info-layout');
            const altsCard = document.getElementById('alternatives-section');
            const printBar = resHtml.querySelector('.print-btn-bar');

            if (resultGrid) resultGrid.style.display = 'none';
            if (infoLayout) infoLayout.style.display = 'none';
            if (altsCard) altsCard.style.display = 'none';
            if (printBar) printBar.style.display = 'none';

            const statusBox = document.getElementById('status-message');
            const statusIcon = statusBox.querySelector('.status-icon');
            const statusText = document.getElementById('status-text');

            statusBox.classList.add('error');
            statusIcon.innerText = '!';
            statusText.innerText = "Bitte füllen Sie alle gelb markierten Felder mit gültigen Zahlen aus.";
        }
        window.hasValidationError = true;
        if (typeof window.updateSidePanel === 'function') window.updateSidePanel();
        isCalculating = false;
        return;
    } else {
        window.hasValidationError = false;
        // Validation PASSED -> Restore visibility
        if (showResultsUI) {
            const resHtml = document.getElementById('results');
            const resultGrid = resHtml.querySelector('.result-grid');
            const infoLayout = resHtml.querySelector('.results-info-layout');
            const altsCard = document.getElementById('alternatives-section');
            const printBar = resHtml.querySelector('.print-btn-bar');

            if (resultGrid) resultGrid.style.display = 'grid';
            if (infoLayout) infoLayout.style.display = 'grid';
            if (altsCard) altsCard.style.display = 'block';
            if (printBar) printBar.style.display = 'block';
        }
    }

    const sysType = document.getElementById('system-type').value;
    const fluid = document.getElementById('fluid-type').value;
    const Q = parseFloat(inputs['power-q'].value.replace(',', '.')) || 0;
    const Vs = parseFloat(inputs['vol-vs'].value.replace(',', '.')) || 0;
    const activeVsVariant = document.querySelector('input[name="vs-variant"]:checked').value;
    const VhsId = (activeVsVariant === 'v1') ? 'vhs-res-v1' : 'vhs-res-v2';
    const Vhs = parseFloat(document.getElementById(VhsId).innerText) || 0;
    const tsmax = parseFloat(inputs['temp-smax'].value.replace(',', '.')) || 0;
    const tr = parseFloat(inputs['temp-r'].value.replace(',', '.')) || 0;
    const Hst = parseFloat(inputs['height-hst'].value.replace(',', '.')) || 0;
    const pz = parseFloat(inputs['press-pz'].value.replace(',', '.')) || 0;
    const psvs = parseFloat(document.getElementById('press-psvs').value);
    const vento = document.getElementById('vento-installed').value;
    const vesselSeries = document.getElementById('vessel-series').value;
    const Vgsolar = (sysType === 'solar') ? (parseFloat(document.getElementById('vol-vgsolar').value) || 0) : 0;

    // Track chosen models for report summary
    let chosenTecBoxName = "";
    let chosenVesselName = "";
    const vgGroup = document.getElementById('grp-vgsolar');
    if (vgGroup) vgGroup.style.display = (sysType === 'solar') ? 'flex' : 'none';

    // 1. Calculate X (Footnote 1: IMI Planung & Berechnung)
    let X = 1.5;
    if (sysType === 'geothermal') {
        X = 2.5;
    } else {
        // Heating, Kälte, Solar, Heatpump, Fernwärme follow the power curve
        if (Q <= 10) {
            X = 3.0;
        } else if (Q > 10 && Q <= 150) {
            X = (87 - 0.3 * Q) / 28;
        } else {
            X = 1.5;
        }
    }

    // 2. Expansion coefficients for the system (standard)
    let e = 0;
    if (sysType === 'cooling' || sysType === 'geothermal' || sysType === 'solar' || sysType === 'heatpump') {
        e = getExpansionCoeff(fluid, tsmax); // Use stagnation/max temp
    } else {
        e = getExpansionCoeff(fluid, (tsmax + tr) / 2.0); // Heating avg
    }

    // NEW: IMI Safety Minimum for System Expansion (approx. 45°C)
    // Even at lower temperatures, IMI uses 0.00900 as a base safety margin for heating.
    if (sysType === 'heating') {
        e = Math.max(e, 0.00900);
    }

    // 3. Expansion Volume Ve (Include Vhs and Storage with their specific temps)
    const vhsContainerId = (activeVsVariant === 'v1') ? 'v1-vhs-generators' : 'v2-vhs-generators';

    // Generator Expansion (using tsmax)
    let vhsVol = 0;
    const manualInputId = (activeVsVariant === 'v1') ? 'vol-vhs' : 'vol-vhs-v2-proxy';
    const manualInputEl = document.getElementById(manualInputId);
    vhsVol += window.safeMathEval(manualInputEl ? manualInputEl.value : "0");

    const genRows = document.querySelectorAll(`#${vhsContainerId} .vhs-gen-row`);
    genRows.forEach(row => {
        const factor = parseFloat(row.querySelector('.gen-type').value) || 0;
        const powerStr = row.querySelector('.gen-power').value.replace(',', '.');
        const power = parseFloat(powerStr) || 0;
        vhsVol += (factor * power);
    });

    let e_hs = getExpansionCoeff(fluid, tsmax);

    // NEW: IMI Safety Minimum for Storage/Boiler (approx. 50°C)
    // IMI uses 0.0107 as a base safety for central units (Vhs/Storage).
    if (sysType === 'heating') {
        e_hs = Math.max(e_hs, 0.0107);
    }

    let expansionSum = vhsVol * e_hs;

    // Storage Expansion (using individual temps)
    let totalStorageVol = 0;
    const stRows = document.querySelectorAll(`#${vhsContainerId} .vhs-storage-row`);
    stRows.forEach(row => {
        const volStr = row.querySelector('.st-vol').value.replace(',', '.');
        const vol = parseFloat(volStr) || 0;
        const tempStr = row.querySelector('.st-temp').value.replace(',', '.');
        const temp = parseFloat(tempStr) || tsmax;
        totalStorageVol += vol;
        let st_e = getExpansionCoeff(fluid, temp);
        if (sysType === 'heating') {
            st_e = Math.max(st_e, 0.0107);
        }
        expansionSum += (vol * st_e);
    });

    // Remainder of System (Vs - Vhs - Vst) at average system temp 'e'
    let remainderVs = Vs - vhsVol - totalStorageVol;
    if (remainderVs < 0) remainderVs = 0; // Guard against negative (user input error)

    // IMI Logic: X factor is applied only to the system volume (remainder), 
    // but NOT to the fixed storage/boiler volumes (expansionSum).
    let Ve = (remainderVs * e * X) + expansionSum;

    // 4. Pressures
    const benchmarkEl = document.getElementById('mode-imi-benchmark');
    const isBenchmarkMode = benchmarkEl && benchmarkEl.checked;

    // ASK for IMI Strategy if not set
    if (isBenchmarkMode && !imiP0Strategy && showResultsUI) {
        window.openImiModal();
        return; // Wait for user choice
    }
    
    const HstValue = Hst;
    let mP0 = 0.3; 
    if (isBenchmarkMode) {
        if (imiP0Strategy === 'min') {
            mP0 = (HstValue <= 10.0 ? 0.28 : 0.23);
        } else if (imiP0Strategy === 'factory') {
            // Strategy B: Maintain 1.5 bar factory if possible, but at least 0.23 margin
            mP0 = Math.max(0.23, 1.5 - (HstValue / 10.0));
        } else if (imiP0Strategy === 'manual') {
            // Strategy C: Use manually entered value
            const manualP0 = parseFloat(document.getElementById('statico-vordruck')?.value.replace(',', '.') || (HstValue / 10.0 + 0.3));
            mP0 = manualP0 - (HstValue / 10.0);
        }
    } else {
        mP0 = (document.getElementById('margin-p0')?.checked ? 0.3 : 0);
    }

    const mPa = isBenchmarkMode ? 0.30 : (document.getElementById('margin-pa')?.checked ? 0.3 : 0);
    const mPe = isBenchmarkMode ? 0.20 : (document.getElementById('margin-pe')?.checked ? 0.2 : 0);
    const totalMargin = mP0 + mPa + mPe;

    let p0 = Math.max((Hst / 10.0) + mP0, pz);

    // Compresso Specific Pressures
    let pa = p0 + mPa; // Compresso starting pressure
    let pe = pa + mPe; // Compresso end pressure

    // 5. Check pe against psvs limits (SWKI)
    let isPeValid = true;
    let peErrorMsg = "";
    let lim1, lim2, p_lim_f;

    if (sysType === 'cooling' || sysType === 'solar' || sysType === 'geothermal' || sysType === 'heatpump') {
        // SWKI HE301-01 Cooling/Solar/WP (Higher safety margin: Factor 1.3 / -0.6 bar)
        lim1 = psvs / 1.3;
        lim2 = psvs - 0.6;
        p_lim_f = "MIN( psvs / 1.3 , psvs - 0.6 )";
        if (pe > lim1 || pe > lim2) {
            isPeValid = false;
            peErrorMsg = `Für Kühlung/Solar darf pe max. min(${lim1.toFixed(2)}, ${lim2.toFixed(2)}) bar sein. pe=${pe.toFixed(2)} bar. Bitte psvs erhöhen oder Hst verringern!`;
        }
    } else {
        // SWKI HE301-01 Heating
        lim1 = psvs / 1.15;
        lim2 = psvs - 0.3;
        p_lim_f = "MIN( psvs / 1.15 , psvs - 0.3 )";
        if (pe > lim1 || pe > lim2) {
            isPeValid = false;
            peErrorMsg = `Für Heizung darf pe max. min(${lim1.toFixed(2)}, ${lim2.toFixed(2)}) bar sein. pe=${pe.toFixed(2)} bar. Bitte psvs erhöhen oder Hst verringern!`;
        }
    }

    const ok = isPeValid ? "OK (Eingehalten)" : "Fehler (Druck zu hoch)";
    const okColor = isPeValid ? "var(--accent)" : "var(--danger)";


    // 6. Nominal Volume VN (SWKI HE301-01: include 2x Kollektorenvolumen for Solar)
    // (benchmarkEl and isBenchmarkMode are already declared above)

    let ventoZuschlag = (vento === 'yes') ? 2 : 0;
    let solarZuschlag = (sysType === 'solar') ? 2 * Vgsolar : 0;
    
    // SWKI: 0.5% of Vs, min 3L | IMI APP: Minimal reserve (0.1L)
    let Vwr = isBenchmarkMode ? 0.1 : Math.max(Vs * 0.005, 3.0);
    
    // VN for Compresso/Druckautomaten
    let margin = isBenchmarkMode ? 1.0 : 1.1; 
    let VN = (Ve + Vwr + ventoZuschlag + solarZuschlag) * margin;

    // 7. PRODUCT SELECTION ALGORITHM
    let recList = [];
    const favStatico = document.getElementById('fav-statico').checked;
    const favSimply = document.getElementById('fav-simply').checked;
    const favConnectF = document.getElementById('fav-connectf').checked;
    const favConnectFloor = document.getElementById('fav-connect-floor').checked;
    const favTransfero = document.getElementById('fav-transfero').checked;

    // Helper: Can Simply handle this?
    let maxSimplyQ = (sysType !== 'heating' && sysType !== 'dh') ? 600 : 400; 

    // Statico Calculation (PF = (peStatico + 1)/(peStatico - vordruck))
    let peStatico = (sysType === 'heating' || sysType === 'dh') ? Math.min(psvs / 1.15, psvs - 0.3) : Math.min(psvs / 1.3, psvs - 0.6);
    const vordruckInputEl = document.getElementById('statico-vordruck');
    let p0_statico = p0; 
    if (vordruckInputEl && vordruckInputEl.value.trim() !== '') {
        const customP0 = parseFloat(vordruckInputEl.value.replace(',', '.'));
        if (!isNaN(customP0)) p0_statico = customP0;
    }
    updateVordruckHint(p0);
    let PF = (peStatico + 1) / (peStatico - p0_statico);
    // VN for Statico (Gefässe)
    let VN_Statico = (Ve + Vwr + ventoZuschlag + solarZuschlag) * PF;

    // DEBUG: Log to console to see what's happening
    console.log(`VN_Statico Calculation: (Ve:${Ve.toFixed(2)} + Vwr:${Vwr.toFixed(2)} + Vento:${ventoZuschlag} + Solar:${solarZuschlag}) * PF:${PF.toFixed(3)} = ${VN_Statico.toFixed(2)}`);

    // --- FALLBACK CHECK: Does Statico fit? ---
    let suggestionMsg = "";
    let forceDruckautomat = false;

    if (favStatico) {
        const barTag = (psvs <= 3.0) ? 3 : (psvs <= 6.0) ? 6 : (psvs <= 10.0) ? 10 : 0;
        const matchingVessels = staticoDataList.filter(v => v.ps >= barTag && v.vol >= VN_Statico);
        const hasValidStaticoVessel = matchingVessels.length > 0 && p0_statico <= 3.5;

        if (!hasValidStaticoVessel) {
            forceDruckautomat = true;
            suggestionMsg = "Kein passendes Statico-Gefäss gefunden (Volumen zu gross oder Vordruck p₀ > 3.5 bar). Das System wurde automatisch auf einen Druckautomaten umgestellt.";
            
            // Auto-activate pe margin if not yet active
            const marginPeEl = document.getElementById('margin-pe');
            if (marginPeEl && !marginPeEl.checked) {
                marginPeEl.checked = true;
                // RE-CALCULATE PRESSURES for the Druckautomat logic
                pe = pa + 0.2; 
                
                // Re-validate pe
                if (sysType === 'cooling' || sysType === 'solar' || sysType === 'geothermal' || sysType === 'heatpump') {
                    lim1 = psvs / 1.3; lim2 = psvs - 0.6;
                    if (pe > lim1 || pe > lim2) {
                        isPeValid = false;
                        peErrorMsg = `pe (${pe.toFixed(2)} bar) überschreitet SWKI-Grenzen für Kühlung/Solar.`;
                    }
                } else {
                    lim1 = psvs / 1.15; lim2 = psvs - 0.3;
                    if (pe > lim1 || pe > lim2) {
                        isPeValid = false;
                        peErrorMsg = `pe (${pe.toFixed(2)} bar) überschreitet SWKI-Grenzen für Heizung.`;
                    }
                }
                
                showCustomAlert("Statico nicht möglich: +0.2 bar Arbeitsbereich (pe) wurde für den Druckautomaten aktiviert. Bitte Sicherheitsventil prüfen!", "System-Anpassung");
            }
        }
    }

    let simplyFits = (psvs <= 4.0 && pe <= 3.5 && Q <= maxSimplyQ);
    let sysFamily = "";

    // Decision Engine
    if (favStatico && !forceDruckautomat) {
        sysFamily = 'Statico';
    } else {
        // Fallback or Druckautomat chosen directly
        if (favSimply && simplyFits) sysFamily = 'Simply';
        else if (favConnectFloor) sysFamily = 'ConnectFloor';
        else if (favConnectF) sysFamily = 'ConnectF';
        else if (favTransfero) sysFamily = 'Transfero';
        else sysFamily = 'ConnectF';
    }

    if (suggestionMsg) {
        recList.push({ label: '<span style="color:#FFA500">Hinweis</span>', val: `<span style="color:#FFA500">${suggestionMsg}</span>` });
    }

    const makeupWater = document.getElementById('makeup-water').value;

    if (sysFamily === 'Statico') {
        const barTag = (psvs <= 3.0) ? 3 : (psvs <= 6.0) ? 6 : (psvs <= 10.0) ? 10 : 0;
        const matchingVessels = staticoDataList.filter(v => v.ps >= barTag && v.vol >= VN_Statico);

        // Find smallest fitting by volume, then smallest pressure rating (ps)
        let chosenV = null;
        if (matchingVessels.length > 0) {
            // Filter out SD vessels if p0 > 1.5
            const validVessels = matchingVessels.filter(v => {
                if (v.type.startsWith('SD') && p0_statico > 1.5) return false;
                return true;
            });

            if (validVessels.length > 0) {
                chosenV = validVessels.reduce((prev, curr) => {
                    if (curr.vol < prev.vol) return curr;
                    if (curr.vol === prev.vol && curr.ps < prev.ps) return curr;
                    return prev;
                });
            }
        }

        // Hard Limit check for Statico (IMI Standard Practical Limit: SU max 3.5 bar p0)
        if (p0_statico > 3.5) {
            chosenV = null;
        }

        if (chosenV) {
            recList.push({ label: 'Ausdehnungsgefäss', val: `${chosenV.type}` });
            recList.push({
                label: '<span style="color:#00FF87">Inbetriebnahme</span>',
                val: `Werkseitiger Vordruck: <b>${chosenV.p0_factory.toFixed(1)} bar</b>. Auf <b>${p0_statico.toFixed(2)} bar</b> einstellen.`
            });
            // Update UI Field (Readonly line)
            const factoryEl = document.getElementById('statico-p0-factory');
            if (factoryEl) factoryEl.value = chosenV.p0_factory.toFixed(1) + " bar";

            // Store for report
            window.chosenStatico = chosenV;
        } else {
            let errMsg = 'Kein passendes Statico-Gefäss für diesen Druck/Inhalt gefunden.';
            if (p0_statico > 3.5) {
                errMsg = '<span style="color:var(--danger)">Statico Gefäss mit diesem Vordruck ist nicht verfügbar (p<sub>0</sub> max. 3.5 bar). Bitte Compresso oder Transfero wählen.</span>';
            }
            recList.push({ label: '⚠️ Hinweis', val: errMsg });
            const factoryEl = document.getElementById('statico-p0-factory');
            if (factoryEl) factoryEl.value = "-";
            window.chosenStatico = null;
        }
    } else if (sysFamily === 'ConnectF' || sysFamily === 'ConnectFloor') {
        const isWallMounted = (sysFamily === 'ConnectF');
        let chosenTecBoxName = "";

        // 1. Vessel Selection First (To know the pressure limit)
        let basePS = '6';
        if (vesselSeries === 'CG' && psvs > 6.0) {
            basePS = '10';
        }
        
        const sizes = vesselData[vesselSeries][basePS] || vesselData[vesselSeries]['6'];
        const maxVessel = sizes[sizes.length - 1];
        let remainingVN = VN;
        let bChosen = sizes.find(item => item.v >= remainingVN);
        let vesselPSLimit = 6.0; // Default

        if (bChosen !== undefined) {
            chosenVesselName = `${vesselSeries} ${bChosen.v}.${basePS}`;
            vesselPSLimit = bChosen.ps_ch || parseFloat(basePS);
            recList.push({ 
                label: 'Basisgefäss', 
                val: `Compresso ${chosenVesselName}`,
                price: bChosen.price,
                art: bChosen.art
            });
        } else {
            chosenVesselName = `${vesselSeries} ${maxVessel.v}.${basePS}`;
            vesselPSLimit = maxVessel.ps_ch || parseFloat(basePS);
            recList.push({ 
                label: 'Basisgefäss', 
                val: `Compresso ${chosenVesselName}`,
                price: maxVessel.price,
                art: maxVessel.art
            });
            remainingVN -= maxVessel.v;

            let extensionCount = 0;
            while (remainingVN > 0) {
                extensionCount++;
                let eChosen = sizes.find(item => item.v >= remainingVN);
                if (eChosen !== undefined) {
                    recList.push({ 
                        label: 'Erweiterungsgefäss', 
                        val: `Compresso ${vesselSeries} ${eChosen.v}.${basePS} E`,
                        price: eChosen.price,
                        art: eChosen.art
                    });
                    remainingVN -= eChosen.v;
                } else {
                    recList.push({ 
                        label: 'Erweiterungsgefäss', 
                        val: `Compresso ${vesselSeries} ${maxVessel.v}.${basePS} E`,
                        price: maxVessel.price,
                        art: maxVessel.art
                    });
                    remainingVN -= maxVessel.v;
                }
            }
            if (extensionCount >= 3) {
                recList.push({
                    label: '<span style="color:#FFA500">System-Hinweis</span>',
                    val: `<span style="color:#FFA500">Das errechnete Volumen bedingt ${extensionCount} Erweiterungsgefässe. Wir raten dazu, ein Transfero-System auf wirtschaftliche Sinnhaftigkeit zu prüfen.</span>`
                });
            }
        }

        // 2. TecBox Selection (Respecting vessel limit)
        const effectivePSLimit = Math.min(psvs, vesselPSLimit);

        if (vesselSeries === 'CU' && isWallMounted) {
            // C ... F series
            if (effectivePSLimit <= 3.75) {
                chosenTecBoxName = 'C 10.1-3.75 F Connect';
            } else if (effectivePSLimit <= 4.2) {
                chosenTecBoxName = 'C 10.1-4.2 F Connect';
            } else if (effectivePSLimit <= 5.0) {
                chosenTecBoxName = 'C 10.1-5 F Connect';
            } else if (effectivePSLimit <= 6.0) {
                chosenTecBoxName = 'C 10.1-6 F Connect';
            } else {
                chosenTecBoxName = 'C 10.1-10 F Connect';
            }
        } else {
            // Floor-standing
            if (Q <= 1000) {
                if (effectivePSLimit <= 3.0) {
                    chosenTecBoxName = 'C 10.1-3.0 Connect';
                } else if (effectivePSLimit <= 3.75) {
                    chosenTecBoxName = 'C 10.1-3.75 Connect';
                } else if (effectivePSLimit <= 4.2) {
                    chosenTecBoxName = 'C 10.1-4.2 Connect';
                } else if (effectivePSLimit <= 5.0) {
                    chosenTecBoxName = 'C 10.1-5.0 Connect';
                } else {
                    chosenTecBoxName = 'C 10.1-6.0 Connect';
                }
            } else {
                if (effectivePSLimit <= 6.0) {
                    chosenTecBoxName = 'C 15.1-6.0 Connect';
                } else {
                    chosenTecBoxName = 'C 15.1-10.0 Connect';
                }
            }
        }

        if (chosenTecBoxName) {
            // IMI Benchmark override: If CU and psvs >= 3 bar, usually they prefer the 6.0 unit unless it's a huge vessel
            // But if vesselPSLimit is lower, we MUST stick to it.
            if (isBenchmarkMode && vesselSeries === 'CU' && psvs >= 3.0 && vesselPSLimit >= 6.0) {
                chosenTecBoxName = isWallMounted ? 'C 10.1-6 F Connect' : 'C 10.1-6.0 Connect';
            }
            const tInfo = tecboxPriceData[chosenTecBoxName] || {};
            recList.push({ 
                label: 'Steuereinheit (TecBox)', 
                val: chosenTecBoxName,
                price: tInfo.price,
                art: tInfo.art
            });
        } else {
            recList.push({ label: 'Fehler', val: 'Druck übersteigt verfügbare Serie' });
        }
        
        recList.push({ label: 'Features', val: 'Präzisionsdruckhaltung ±0.1 bar, F-Control mit BrainCube Connect, 1-2 Kompressoren.' });

    } else if (sysFamily === 'Transfero') {
        // --- TRANSFERO CONNECT LOGIC ---
        // Select TecBox
        if (psvs <= 10.0) {
            recList.push({ label: 'Steuereinheit (Transfero)', val: 'TV 4.1 E Connect BrainCube' });
        } else {
            recList.push({ label: 'Steuereinheit (Transfero)', val: 'TI 4.1 Connect BrainCube (Spezialausführung)' });
        }

        const tSeries = document.getElementById('transfero-series').value;
        const transferoVesselData = {
            'TU': {
                '6': [
                    { v: 200 }, { v: 300 }, { v: 500 },
                    { v: 750 }, { v: 1000 }, { v: 1500 },
                    { v: 2000 }, { v: 3000 }, { v: 4000 },
                    { v: 5000 }
                ],
                '10': [
                    { v: 300 }, { v: 500 }, { v: 750 },
                    { v: 1000 }, { v: 1500 }, { v: 2000 },
                    { v: 3000 }
                ]
            },
            'TG': {
                '6': [
                    { v: 300 }, { v: 500 }, { v: 750 },
                    { v: 1000 }, { v: 1500 }, { v: 2000 },
                    { v: 3000 }, { v: 4000 }, { v: 5000 }
                ],
                '10': [
                    { v: 300 }, { v: 500 }, { v: 750 },
                    { v: 1000 }, { v: 1500 }, { v: 2000 },
                    { v: 3000 }
                ]
            }
        };

        let tPS = (psvs <= 6.0) ? '6' : '10';
        const tSizes = transferoVesselData[tSeries][tPS];
        const tMax = tSizes[tSizes.length - 1];
        let tRem = VN;
        let tB = tSizes.find(i => i.v >= tRem);

        if (tB) {
            recList.push({ label: 'Basisgefäss', val: `Transfero ${tSeries} ${tB.v}.${tPS}` });
        } else {
            recList.push({ label: 'Basisgefäss', val: `Transfero ${tSeries} ${tMax.v}.${tPS}` });
            tRem -= tMax.v;
            while (tRem > 0) {
                let tE = tSizes.find(i => i.v >= tRem);
                if (tE) {
                    recList.push({ label: 'Erweiterungsgefäss', val: `Transfero ${tSeries} ${tE.v}.${tPS} E` });
                    tRem -= tE.v;
                } else {
                    recList.push({ label: 'Erweiterungsgefäss', val: `Transfero ${tSeries} ${tMax.v}.${tPS} E` });
                    tRem -= tMax.v;
                }
            }
        }
        recList.push({ label: 'Features', val: 'Präzisionsdruckhaltung ±0.2 bar, integrierte Entgasung/Nachspeisung, BrainCube Connect.' });
    } else if (sysFamily === 'Simply') {
        // --- SIMPLY COMPRESSO LOGIC ---
        let simplyValid = true;

        // 1. Validate psvs (max 4 bar for the series)
        if (psvs > 4.0) {
            recList.push({ label: '<span style="color:#FF4757">System-Fehler</span>', val: '<span style="color:#FF4757">Simply Compresso ist nur für Sicherheitsventile bis max. 4 bar zugelassen.</span>' });
            simplyValid = false;
        }

        // 2. Validate max working pressure (dpu max = 3.5 bar)
        if (pe > 3.5) {
            recList.push({ label: '<span style="color:#FF4757">Druck-Fehler</span>', val: `<span style="color:#FF4757">Enddruck pe (${pe.toFixed(2)} bar) überschreitet max. Arbeitsdruck von Simply (3.5 bar).</span>` });
            simplyValid = false;
        }

        // 3. Power warning
        let maxQ = (sysType !== 'heating' && sysType !== 'dh') ? 600 : 400;
        if (Q > maxQ) {
            recList.push({ label: '<span style="color:#FFA500">System-Hinweis</span>', val: `<span style="color:#FFA500">Ihre Leistung von ${Q} kW überschreitet das Maximum für Simply Compresso (${maxQ} kW).</span>` });
        }

        if (simplyValid) {
            // TecBox and Base Vessel are combined in Simply
            let modelName = (makeupWater === 'SWM') ? 'Simply Compresso C 2.1-80 SWM Connect' : 'Simply Compresso C 2.1-80 S Connect';
            recList.push({ label: 'Steuereinheit + Basisgefäss', val: modelName });
            recList.push({ label: 'Features', val: 'Präzisionsdruckhaltung +/- 0,1 bar, ECO-night Modus. 1 Kompressor, 1 Überströmventil, 1 Basisgefäß.' });

            let remainingVN = VN - 80;
            let extensionCount = 0;

            while (remainingVN > 0) {
                extensionCount++;
                recList.push({ label: 'Erweiterungsgefäss (80L)', val: `Compresso CD 80.4 E` });
                remainingVN -= 80;
            }

            if (extensionCount >= 3) {
                recList.push({
                    label: '<span style="color:#FFA500">Empfehlung</span>',
                    val: `<span style="color:#FFA500">Ab 3 Erweiterungsgefässen ist Connect F meist techn./wirtschaftl. sinnvoller.</span>`
                });
            }
        }
    }

    // Render Product Recommendations
    if (showResultsUI) {
        const recHtml = document.getElementById('recommendation-list');
        recHtml.innerHTML = '';
        recList.forEach(item => {
        let li = document.createElement('li');
        let cleanLabel = item.label.replace(/:/g, '');
        let lowerLabel = cleanLabel.toLowerCase();

        // Main equipment titles get the large highlight style
        const isMain = ['basisgefäss', 'erweiterungsgefäss', 'steuereinheit', 'vhs'].some(k => lowerLabel.includes(k.toLowerCase()));
        // Note: 'Steuereinheit + Basisgefäss' in Simply fits 'steuereinheit'

        if (isMain) {
            let formattedVal = item.val.replace(/(\(.*\))/g, '<span class="hint-text">$1</span>');
            let priceHtml = "";
            if (item.price) {
                priceHtml = `<div class="price-info-row" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.3rem;">
                    <span>Art: ${item.art || '-'}</span> | <span style="color:var(--accent)">Brutto: ${item.price.toLocaleString('de-CH')}.00 CHF</span>
                </div>`;
            }
            li.innerHTML = `
                <div class="rec-label-row">
                    <span class="d-label">${cleanLabel}</span>
                </div>
                <div class="rec-val-row">
                    <span class="res-val-highlight">${formattedVal}</span>
                    ${priceHtml}
                </div>`;
        } else {
            // Features, hints, errors, warnings - all use hint-text (smaller)
            li.innerHTML = `
                <div class="rec-label-row">
                    <span class="d-label">${cleanLabel}</span>
                </div>
                <div class="rec-val-row">
                    <span class="hint-text" style="display:inline; margin-top:0">${item.val}</span>
                </div>`;
        }

        // Add image preview if it's an expansion vessel OR a TecBox
        const needsPreview = ['gefäss', 'tecbox', 'steuereinheit'].some(k => lowerLabel.includes(k));
        if (needsPreview) {
            attachImagePreview(li, item.val);
        }

        recHtml.appendChild(li);
    });

    // --- CALCULATE ALTERNATIVES ---
    const altHtml = document.getElementById('alternatives-list');
    altHtml.innerHTML = '';
    let alts = [];

    // 1. Cross-Series Alternative (CU vs CG)
    const otherSeries = (vesselSeries === 'CU') ? 'CG' : 'CU';
    const seriesTitle = (otherSeries === 'CG') ? 'Connect F (Premium CG)' : 'Connect F (Standard CU)';
    alts.push({ label: seriesTitle, val: calcVesselsAlt(VN, psvs, otherSeries) });

    // 2. Simply Compresso if possible and not already chosen
    if (sysFamily !== 'Simply' && simplyFits) {
        let sc = `Simply Compresso (80L Basis)`;
        let remSC = VN - 80;
        if (remSC > 0) {
            let count = Math.ceil(remSC / 80);
            sc += ` + ${count}x 80.4 E extension`;
        }
        alts.push({ label: 'Simply Compresso (Compact)', val: sc });
    }

    // 3. Statico if possible and not already chosen
    if (sysFamily !== 'Statico' && VN_Statico <= 800) {
        const staticoSizes = [8, 12, 18, 25, 35, 50, 80, 140, 200, 300, 400, 500, 600, 800];
        let chosenS = staticoSizes.find(v => v >= VN_Statico);
        if (chosenS) {
            let bar = (psvs <= 3.0) ? "3" : (psvs <= 6.0) ? "6" : "10";
            alts.push({ label: 'Statico (Alternative)', val: `Statico ${chosenS}.${bar}` });
        }
    }

    // 4. Smaller Vessel Alternative if using large CG
    if (vesselSeries === 'CG' && VN > 700 && VN <= 1600) {
        // Show option with 2x 800L or 2x 600L CU if it fits
        alts.push({ label: 'Modular Alternative (2 Gefässe)', val: `2x Compresso CU 800.6 (Modularer Aufbau)` });
    }

    alts.forEach(alt => {
        let li = document.createElement('li');
        li.innerHTML = `<span class="d-label">${alt.label}</span> 
                        <span class="res-val-highlight" style="font-size:1.1rem">${alt.val}</span>`;

        attachImagePreview(li, alt.val);

        altHtml.appendChild(li);
    });



    }

    // Output formatting
    document.getElementById('res-x').innerText = X.toFixed(3);
    document.getElementById('det-e').innerText = e.toFixed(5);
    document.getElementById('det-ehs').innerText = e_hs.toFixed(5);

    document.getElementById('res-ve').innerText = Ve.toFixed(1);

    // Final Nominal Volume display - matches the recommended system logic
    // FINAL UI OUTPUT - FOOLPROOF OVERRIDE
    const vnFinal = (sysFamily === 'Statico') ? VN_Statico : VN;
    const peFinal = (sysFamily === 'Statico') ? peStatico : pe;
    
    // Set UI directly
    const resVnEl = document.getElementById('res-vn');
    if (resVnEl) resVnEl.innerText = vnFinal.toFixed(1);
    
    const resPeEl = document.getElementById('res-pe');
    if (resPeEl) resPeEl.innerText = peFinal.toFixed(2);
    
    // Show PF in UI for Statico
    const pfHint = document.getElementById('res-pf-hint');
    if (pfHint) {
        if (sysFamily === 'Statico') {
            pfHint.innerText = `(PF: ${PF.toFixed(3)})`;
            pfHint.style.color = "var(--accent)";
        } else {
            pfHint.innerText = isBenchmarkMode ? "(Marge: 1.0)" : "(Marge: 1.1)";
            pfHint.style.color = "rgba(255,255,255,0.5)";
        }
    }
    
    // DEBUG: Force re-verify in 50ms to catch any overwrites
    setTimeout(() => {
        if (resVnEl && resVnEl.innerText !== vnFinal.toFixed(1)) {
            console.warn("VN Display was overwritten! Re-forcing correct value.");
            resVnEl.innerText = vnFinal.toFixed(1);
        }
    }, 50);

    document.getElementById('res-p0').innerText = p0.toFixed(2);
    document.getElementById('res-pa').innerText = pa.toFixed(2);

    // Status Box UI
    if (showResultsUI) {
        // Automatic copy to clipboard on 'Start'
        const reportText = window.getBenchmarkReportText();
        window.copyToClipboard(reportText, true);

        const results = document.getElementById('results');
        results.classList.remove('hidden');
        results.style.display = 'block';

        const statusBox = document.getElementById('status-message');
        const statusIcon = statusBox.querySelector('.status-icon');
        const statusText = document.getElementById('status-text');

        if (isPeValid) {
            statusBox.classList.remove('error');
            statusIcon.innerText = '✓';
            statusText.innerText = "Berechnung erfolgreich. Die Drücke nach SWKI HE301-01 für Compresso Connect F sind sicher abgedeckt.";
        } else {
            statusBox.classList.add('error');
            statusIcon.innerText = '!';
            statusText.innerText = peErrorMsg;
        }

        const resultsEl = document.getElementById('results');
        if (resultsEl) window.scrollTo({ top: resultsEl.offsetTop - 100, behavior: 'smooth' });
        
        // Update Sidepanel after calculation
        if (typeof window.updateSidePanel === 'function') window.updateSidePanel();
    }

    // ===== GENERATE DETAILED REPORT =====
    const projectName = document.getElementById('project-name').value || "Neue Berechnung";
    let rep = `
        <div class="print-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; font-size: 0.95rem;">
            <span style="text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-size: 0.8rem;">Berechnungsnachweis</span>
            <span style="color: #fff; font-weight: 800; font-size: 1.2rem;">${projectName}</span>
            <span style="width: 150px;"></span> 
        </div>
    `;

    const renderStep = (title, formula, applied, resultLabel, resultVal, resultUnit = "") => {
        return `
        <div class="report-step">
            <h4 style="margin-top: 0; display: flex; justify-content: space-between; align-items: center;">
                <span><span>📊</span> ${title}</span>
                <button type="button" class="btn-context-help" title="Erklärung der Kürzel" onclick="showContextHelp(this)">?</button>
            </h4>
            <div class="formula-row">
                <span class="formula-label">Formel</span>
                <span class="formula-content">${formula}</span>
            </div>
            <div class="formula-row">
                <span class="formula-label">Eingesetzt</span>
                <span class="formula-content">${applied}</span>
            </div>
            <div class="result-row">
                <span class="result-label">${resultLabel}</span>
                <span class="result-value">${resultVal}${resultUnit ? ' ' + resultUnit : ''}</span>
            </div>
        </div>`;
    };

    // 1. Gegeben
    const sysTypeName = document.querySelector(`#system-type option[value='${sysType}']`).innerText;
    const fluidName = document.querySelector(`#fluid-type option[value='${fluid}']`).innerText;
    let serieText = "";
    if (sysFamily === 'Statico') {
        serieText = (window.chosenStatico) ? window.chosenStatico.type : 'Statico';
    }
    else if (sysFamily === 'Simply') {
        serieText = 'Simply Compresso C 2.1-4 S (80ℓ)';
    }
    else if (sysFamily === 'ConnectF' || sysFamily === 'ConnectFloor') {
        serieText = `${chosenTecBoxName} | ${chosenVesselName}`;
    }
    else {
        serieText = 'Transfero (Pumpenstation) | ' + vesselSeries;
    }

    rep += `
    <div class="report-step" style="margin-bottom: 30px; padding: 1.5rem; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--border-color);">
        <h3 style="color:var(--accent); margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
            <span><span>📋</span> 1. Gegeben (Eingabewerte)</span>
            <button type="button" class="btn-context-help" title="Erklärung der Kürzel" onclick="showContextHelp(this)">?</button>
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; font-size: 0.9rem;">
            <div><b style="color:var(--text-muted)">Anlagentyp:</b><br>${sysTypeName}</div>
            <div><b style="color:var(--text-muted)">Leistung Q:</b><br>${Q} kW</div>
            <div><b style="color:var(--text-muted)">Medium:</b><br>${fluidName}</div>
            <div><b style="color:var(--text-muted)">Sys-Volumen Vs:</b><br>${Vs} Liter</div>
            <div><b style="color:var(--text-muted)">Stat. Höhe Hst:</b><br>${Hst} m</div>
            <div><b style="color:var(--text-muted)">Kessel-Vol Vhs:</b><br>${Vhs} Liter</div>
            <div><b style="color:var(--text-muted)">Pumpendruck pz:</b><br>${pz} bar</div>
            <div><b style="color:var(--text-muted)">Temperatur:</b><br>${tsmax} °C / ${tr} °C</div>
            <div><b style="color:var(--text-muted)">SV-Ansprechdruck:</b><br>${psvs.toFixed(1)} bar</div>
            <div><b style="color:var(--text-muted)">Gewähltes System:</b><br>${serieText}</div>
        </div>
    </div>`;

    // 2. Gesucht
    rep += `<div style="margin-bottom: 30px;">
        <h3 style="color:var(--accent); margin-bottom: 10px;">🔍 2. Gesucht</h3>
        <p style="margin:0; opacity: 0.8; font-size: 0.95rem; line-height: 1.5;">
            Sicherheitsfaktor (X), Ausdehnungskoeffizienten (e, e<sub>hs</sub>), Ausdehnungsvolumen (V<sub>e</sub>), 
            Nennvolumen (V<sub>N</sub>), Mindestdruck (p<sub>0</sub>), Enddruck (p<sub>e</sub>) und die Dimensionierung 
            Gefäss & Steuerung nach <b>SWKI HE301-01</b>.
        </p>
    </div>`;

    // 3. Berechnungsschritte
    rep += `<div style="margin-bottom: 30px;"><h3 style="color:var(--accent); margin-bottom: 20px;">🧮 3. Berechnungsschritte (Formeln & Zahlen)</h3>`;

    // --- MOVED: 3.1 Sicherheitsventil & Sicherheitszuschläge ---
    let min_psvs_text = (sysType !== 'heating' && sysType !== 'dh') ?
        `MAX( p<sub>e</sub> \u00D7 1.30 , p<sub>e</sub> + 0.6 )` :
        `MAX( p<sub>e</sub> \u00D7 1.15 , p<sub>e</sub> + 0.3 )`;

    let min_psvs_val = (sysType !== 'heating' && sysType !== 'dh') ?
        Math.max(pe * 1.3, pe + 0.6) :
        Math.max(pe * 1.15, pe + 0.3);

    let svCheckHtml = `
        <div class="report-step" style="background: rgba(0,228,161,0.03); border: 1px solid rgba(0,228,161,0.2);">
            <h4 style="margin-top: 0; color:var(--accent);">🛡️ 3.1 Sicherheitsventil & Sicherheitszuschläge</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                <span>1. Statische Last (Hst/10):</span><span style="text-align:right;">${(Hst / 10).toFixed(2)} bar</span>
                <span>2. Zuschlag Überdruck Hochpunkt:</span><span style="text-align:right;">+${mP0.toFixed(1)} bar</span>
                <span>3. Zuschlag Wasservorlage (p<sub>a</sub>):</span><span style="text-align:right;">+${mPa.toFixed(1)} bar</span>
                <span>4. Zuschlag Arbeitsbereich Druckautomat:</span><span style="text-align:right;"><b>+${mPe.toFixed(1)} bar</b></span>
            </div>
            <div class="formula-row">
                <span class="formula-label">Erforderlich</span>
                <span class="formula-content">psv<sub>s</sub> \u2265 ${min_psvs_text}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin: -5px 0 10px 110px;">
                Beispiel: MAX( ${pe.toFixed(2)} \u00D7 ${sysType !== 'heating' && sysType !== 'dh' ? '1.30' : '1.15'} , ${pe.toFixed(2)} + ${sysType !== 'heating' && sysType !== 'dh' ? '0.6' : '0.3'} ) = ${min_psvs_val.toFixed(2)} bar
            </div>

            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin: 15px 0; font-size: 0.85rem; border-left: 3px solid var(--accent);">
                <strong style="display:block; margin-bottom: 5px;">Einfache "Hausformel":</strong>
                psv<sub>s</sub> \u2265 ( (H<sub>st</sub> / 10) + ${totalMargin.toFixed(1)} bar ) \u00D7 ${sysType !== 'heating' && sysType !== 'dh' ? '1.30' : '1.15'} <br>
                <span style="font-size: 0.8rem; color: #aaa;">
                    Rechnung: ( ${(Hst / 10).toFixed(2)} + ${totalMargin.toFixed(1)} ) \u00D7 ${sysType !== 'heating' && sysType !== 'dh' ? '1.30' : '1.15'} = <b>${((Hst / 10 + totalMargin) * (sysType !== 'heating' && sysType !== 'dh' ? 1.30 : 1.15)).toFixed(2)} bar</b>
                </span>
            </div>
            <div class="formula-row">
                <span class="formula-label">Prüfung</span>
                <span class="formula-content">${psvs.toFixed(1)} bar (gewählt) \u2265 ${min_psvs_val.toFixed(2)} bar</span>
            </div>
            <div class="result-row">
                <span class="result-label">Status:</span>
                <span class="result-value" style="color:${psvs >= min_psvs_val ? 'var(--accent)' : 'var(--danger)'}">${psvs >= min_psvs_val ? '✅ Konform' : '❌ Zu niedrig'}</span>
            </div>
        </div>
    `;
    rep += svCheckHtml;

    // 3.2 X
    let f_x = ""; let ei_x = "";
    if (sysType === 'geothermal') { f_x = "X = 2.5"; ei_x = "Fixwert Erdsonden nach SWKI"; }
    else {
        if (Q <= 10) { f_x = "X = 3.0"; ei_x = "Fixwert für Q \u2264 10 kW"; }
        else if (Q > 150) { f_x = "X = 1.5"; ei_x = "Fixwert für Q > 150 kW"; }
        else {
            f_x = "X = (87 - 0.3 \u00B7 Q) / 28";
            ei_x = `X = (87 - 0.3 \u00B7 ${Q}) / 28`;
        }
    }
    rep += renderStep("3.2 Sicherheitsfaktor Volumen (X)", f_x, ei_x, "Resultat: X =", X.toFixed(3));

    // 3.3 e
    let f_e = ""; let ei_e = "";
    if (sysType === 'cooling' || sysType === 'solar' || sysType === 'geothermal' || sysType === 'heatpump') {
        f_e = "e = f(Medium, t<sub>smax</sub>)";
        ei_e = `e = f(${fluidName}, ${tsmax} °C)`;
    } else {
        f_e = "e = f(Medium, (t<sub>smax</sub> + t<sub>r</sub>) / 2)";
        ei_e = `e = f(${fluidName}, (${tsmax} + ${tr}) / 2 = ${(tsmax + tr) / 2} °C)`;
    }
    rep += renderStep("3.3 Ausdehnungskoeffizienten (e, e<sub>hs</sub>)",
        f_e + " | e<sub>hs</sub> = f(Medium, t<sub>smax</sub>)",
        ei_e + ` | e<sub>hs</sub> = f(${fluidName}, ${tsmax} °C)`,
        "Resultat:", `e = ${e.toFixed(5)}, e<sub>hs</sub> = ${e_hs.toFixed(5)}`);

    // 3.4 Ve
    rep += renderStep("3.4 Ausdehnungsvolumen (V<sub>e</sub>)",
        "V<sub>e</sub> = (V<sub>s</sub> - V<sub>hs,st</sub>) \u00B7 e \u00B7 X + \u2211(V<sub>i</sub> \u00B7 e<sub>i</sub>)",
        `V<sub>e</sub> = (${Vs} - ${vhsVol + totalStorageVol}) \u00B7 ${e.toFixed(5)} \u00B7 ${X.toFixed(3)} + ${expansionSum.toFixed(2)}`,
        "Resultat: V<sub>e</sub> =", Ve.toFixed(2), "Liter");

    // 3.5 p0
    rep += renderStep("3.5 Überdruck am höchsten Punkt (p<sub>0</sub>)",
        `p<sub>0</sub> = MAX( (H<sub>st</sub> / 10) + ${mP0.toFixed(1)} , p<sub>z</sub> )`,
        `p<sub>0</sub> = MAX( (${Hst} / 10) + ${mP0.toFixed(1)} , ${pz} )`,
        "Resultat: p<sub>0</sub> =", p0.toFixed(2), "bar");

    if (sysFamily === 'Statico') {
        rep += renderStep("Statico Enddruck & Nennvolumen",
            `p<sub>e</sub> = min(p<sub>svs</sub> / ${sysType === 'heating' ? '1.15, p<sub>svs</sub> - 0.3' : '1.3, p<sub>svs</sub> - 0.6'})`,
            `p<sub>e</sub> = ${peStatico.toFixed(2)} bar (nach SWKI)`,
            "Resultat: V<sub>N</sub> =", VN_Statico.toFixed(2), "Liter");

        if (window.chosenStatico) {
            rep += `
            <div class="info-box-highlight" style="margin-top:15px; padding:10px; background:rgba(0,255,135,0.05); border-left:4px solid var(--accent); font-size:0.9rem;">
                <b>Vordruck-Konfiguration (Service):</b><br>
                Gefäss wird mit <b>${window.chosenStatico.p0_factory.toFixed(1)} bar</b> ausgeliefert.<br>
                Soll-Einstellung vor Ort: <b>${p0_statico.toFixed(2)} bar</b>.<br>
                <small style="opacity:0.7">${(p0_statico > window.chosenStatico.p0_factory) ? '→ Gas nachfüllen' : '→ Gas ablassen'}</small>
            </div>`;
        }
    } else {
        rep += renderStep("Enddruck & Toleranzprüfung",
            "p<sub>a</sub> = p<sub>0</sub> + 0.3 | p<sub>e</sub> = p<sub>a</sub> + 0.2",
            `p<sub>a</sub> = ${p0.toFixed(2)} + 0.3 = ${pa.toFixed(2)} | p<sub>e</sub> = ${pa.toFixed(2)} + 0.2 = ${pe.toFixed(pe.toFixed(2).split('.')[1]?.length || 2)}`,
            `Prüfung (p<sub>e</sub> \u2264 PN<sub>max</sub>):`, ok);

        rep += renderStep("Theoretisches Nennvolumen (V<sub>N</sub>)",
            `V<sub>N</sub> = (V<sub>e</sub> + Vento<sub>Zuschlag</sub> + Solar) \u00B7 1.1`,
            `V<sub>N</sub> = (${Ve.toFixed(2)} + ${ventoZuschlag} + ${solarZuschlag}) \u00B7 1.1`,
            "Resultat: V<sub>N</sub> =", VN.toFixed(2), "Liter");
    }

    rep += `</div>`;

    // 4. Resultat Hardware
    rep += `<div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
            <h3 style="color:var(--accent); margin-bottom: 12px;">4. Resultat: Stückliste / Komponentenwahl</h3>
            <ul style="list-style-type: square; padding-left: 20px; line-height: 1.8;">`;
    recList.forEach(i => {
        rep += `<li>${i.label}: <b style="color:white; font-size: 1.05rem;">${i.val}</b></li>`;
    });
    // Add current safety valve logic visually
    const svTextStr = document.getElementById('sv-result-text')?.innerText;
    if (svTextStr && svTextStr !== "-") rep += `<li>Sicherheitsventil: <b style="color:white; font-size: 1.05rem;">${svTextStr} (${psvs.toFixed(1)} bar)</b></li>`;
    rep += `</ul></div>`;

    document.getElementById('report-content').innerHTML = rep;
    const reportView = document.getElementById('report-view');
    reportView.style.display = 'block';
    reportView.classList.remove('hidden');
    // ===== END GENERATE REPORT =====

    // Show Results smoothly
    const resHtml = document.getElementById('results');
    if (showResultsUI) {
        resHtml.style.display = 'block';
        setTimeout(() => {
            resHtml.classList.remove('hidden');
        }, 50);
    }
    } finally {
        isCalculating = false;
    }
};

document.getElementById('calc-form').addEventListener('submit', function (event) {
    event.preventDefault();
    window.calculateAll(true);
});

window.getBenchmarkReportText = function() {
    try {
        const activeVar = document.querySelector('input[name="vs-variant"]:checked')?.value || 'v1';
        const vhsTotalEl = document.getElementById((activeVar === 'v1') ? 'vhs-res-v1' : 'vhs-res-v2');
        const VhsTotal = parseFloat(vhsTotalEl ? vhsTotalEl.innerText.replace(',', '.') : "0") || 0;
        
        const sysType = document.getElementById('system-type')?.value || "-";
        const fluid = document.getElementById('fluid-type')?.value || "-";
        const Q = parseFloat(document.getElementById('power-q')?.value.replace(',', '.') || "0") || 0;
        const Vs = parseFloat(document.getElementById('vol-vs')?.value.replace(',', '.') || "0") || 0;
        const tsmax = parseFloat(document.getElementById('temp-smax')?.value.replace(',', '.') || "0") || 0;
        const tr = parseFloat(document.getElementById('temp-r')?.value.replace(',', '.') || "0") || 0;
        const Hst = parseFloat(document.getElementById('height-hst')?.value.replace(',', '.') || "0") || 0;
        const pz = parseFloat(document.getElementById('press-pz')?.value.replace(',', '.') || "0") || 0;
        const psvs = parseFloat(document.getElementById('press-psvs')?.value.replace(',', '.') || "0") || 0;
        
        const e = document.getElementById('det-e')?.innerText || "0.00000";
        const ehs = document.getElementById('det-ehs')?.innerText || "0.00000";
        const X = document.getElementById('res-x')?.innerText || "1.500";
        const Ve = document.getElementById('res-ve')?.innerText || "0.0";
        const Vn = document.getElementById('res-vn')?.innerText || "0.0";
        const p0 = document.getElementById('res-p0')?.innerText || "0.00";
        const pa = document.getElementById('res-pa')?.innerText || "0.00";
        const pe = document.getElementById('res-pe')?.innerText || "0.00";
        
        const recListItems = document.querySelectorAll('#recommendation-list li');
        let hardwareStr = "";
        let totalPrice = 0;
        recListItems.forEach(li => {
            const label = li.querySelector('.d-label')?.innerText || "";
            const val = li.querySelector('.res-val-highlight')?.innerText || li.querySelector('.hint-text')?.innerText || "";
            
            // Extract price from the price row if present
            const priceText = li.querySelector('.price-info-row span[style*="color:var(--accent)"]')?.innerText || "";
            let pVal = 0;
            if (priceText) {
                // "Brutto: 3'340.00 CHF" -> 3340
                pVal = parseInt(priceText.replace(/[^0-9]/g, '')) / 100 || 0;
                totalPrice += pVal;
            }

            if (label && val) {
                let lineLabel = label.trim();
                let lineValue = val.trim();
                
                // Special handling for long feature lists or any text with many commas: wrap and indent
                if (lineValue.includes(',') && (lineLabel.toUpperCase().includes("FEATURES") || lineValue.length > 50)) {
                    const parts = lineValue.split(',');
                    lineValue = parts.map((part, idx) => {
                        let p = part.trim();
                        if (idx < parts.length - 1) p += ',';
                        // Indent subsequent lines by 17 spaces (16 for label + 1 space)
                        return idx === 0 ? p : "\n".padEnd(18) + p;
                    }).join('');
                }

                let line = `${lineLabel.padEnd(16)} ${lineValue}`;
                if (pVal > 0) line += ` (${pVal.toLocaleString('de-CH')}.00 CHF)`;
                hardwareStr += line + "\n";
            }
        });
        if (!hardwareStr) hardwareStr = "Keine Empfehlung (Berechnung starten!)\n";

        const sv = document.getElementById('sv-result-text')?.innerText || "-";
        const isBenchmark = document.getElementById('mode-imi-benchmark')?.checked;
        const t_avg = (tsmax + tr) / 2;
        
        const e_num = parseFloat(e.replace(',', '.')) || 0;
        const ehs_num = parseFloat(ehs.replace(',', '.')) || 0;
        const X_num = parseFloat(X.replace(',', '.')) || 1.5;
        const Ve_num = parseFloat(Ve.replace(',', '.')) || 0;
        const p0_num = parseFloat(p0.replace(',', '.')) || 0;
        const pa_num = parseFloat(pa.replace(',', '.')) || 0;
        const pe_num = parseFloat(pe.replace(',', '.')) || 0;

        const Ve_sys = ((Vs - VhsTotal) * e_num * X_num).toFixed(1);
        const Ve_hs = (VhsTotal * ehs_num).toFixed(1);
        const vwr_val = isBenchmark ? 0.1 : Math.max(Vs * 0.005, 3.0);
        
        // For Compresso/Transfero in HySelect, VN is often (Ve + Vwr) * 1.1
        const isCompressoTrans = (hardwareStr.toLowerCase().includes('compresso') || hardwareStr.toLowerCase().includes('transfero'));
        const isStatico = (hardwareStr.toLowerCase().includes('ausdehnungsgefäss') || hardwareStr.toLowerCase().includes('statico'));
        
        let benchmarkVN = (Ve_num + vwr_val);
        if (isCompressoTrans) {
            benchmarkVN *= 1.1;
        } else if (isStatico) {
            // For Statico, use the actual calculated PF from the UI or recalculate
            const pf_val = parseFloat(document.getElementById('res-pf-hint')?.innerText.replace(/[^0-9.]/g, '')) || 1.0;
            if (pf_val > 1.0) {
                benchmarkVN *= pf_val;
            } else {
                // Fallback: try to get it from the report's pe and p0
                const pf_calc = (pe_num + 1) / (pe_num - p0_num);
                if (isFinite(pf_calc) && pf_calc > 1) benchmarkVN *= pf_calc;
            }
        }

        const vhsErzeuger = parseFloat(document.getElementById(`${activeVar}-vhs-erzeuger-val`)?.innerText || "0") || 0;
        const vhsSpeicher = parseFloat(document.getElementById(`${activeVar}-vhs-speicher-val`)?.innerText || "0") || 0;

        const systemVs = Vs - vhsSpeicher;

        let text = `Vergleichdaten\n`;
        text += `Modus:           ${isBenchmark ? 'IMI APP' : 'SWKI Standard'}\n`;
        text += `Projekt:         ${document.getElementById('project-name')?.value || 'Unbenannt'}\n`;
        text += `Datum:           ${new Date().toLocaleString()}\n`;
        text += `--------------------------------------\n\n`;
        
        text += `EINGABEN (INPUTS):\n`;
        text += `Typ/Medium:      ${sysType} / ${fluid}\n`;
        text += `Leistung Q:      ${Q} kW\n`;
        text += `Systemvol. Vs:   ${systemVs} l${vhsErzeuger > 0 ? ` (inkl. Erzeuger: ${vhsErzeuger}l)` : ''}\n`;
        text += `Speichervol. Vsto: ${vhsSpeicher} l\n`;
        text += `Gesamtvolumen:    ${Vs} l\n`;
        text += `Temp (max/r):    ${tsmax} / ${tr} °C\n`;
        text += `Stat. Höhe Hst:  ${Hst} m\n`;
        text += `Zulaufdruck pz:  ${pz} bar\n`;
        text += `Sich.-Ventil:    ${psvs.toFixed(1)} bar\n\n`;
        
        text += `BERECHNUNGSWERTE:\n`;
        text += `Koeffizient e:   ${e_num.toFixed(5)}\n`;
        text += `Faktor X:        ${X_num.toFixed(3)}\n`;
        text += `Ve System:       ${Ve_sys} l\n`;
        text += `Koeffizient ehs: ${ehs_num.toFixed(5)}\n`;
        text += `Ve Zentrale:     ${Ve_hs} l\n`;
        text += `Ve Gesamt:       ${Ve_num.toFixed(1)} l\n`;
        text += `Vn Nennvolumen:  ${benchmarkVN.toFixed(1)} l\n`;
        text += `Wasserreserve:   ${vwr_val.toFixed(2)} l\n`;
        text += `Vordruck p0:     ${p0_num.toFixed(2)} bar\n`;
        text += `Fülldruck pa:    ${pa_num.toFixed(2)} bar\n`;
        text += `Enddruck pe:     ${pe_num.toFixed(2)} bar\n`;
        
        // Match HySelect PF display: Compresso/Transfero use 1.10 as PF in the summary
        if (isCompressoTrans) {
            text += `Druckfaktor PF:  1.100\n`;
        } else {
            const pf_denom = pe_num - p0_num;
            const pf_calc = (pf_denom > 0) ? (pe_num + 1) / pf_denom : 0;
            text += `Druckfaktor PF:  ${pf_calc.toFixed(3)}\n`;
        }
        text += `Summe Ve+Vwr:    ${(Ve_num + vwr_val).toFixed(2)} l\n\n`;
        text += `HARDWARE EMPFEHLUNG:\n`;
        text += `--------------------\n`;
        text += hardwareStr;
        text += `Sicherheitsv.:   ${sv}\n`;
        if (totalPrice > 0) {
            text += `\nGESAMTPREIS (Budget):\n`;
            text += `--------------------\n`;
            text += `Brutto (CHF):    ${totalPrice.toLocaleString('de-CH')}.00\n`;
            text += `(Exkl. MwSt, Preisliste 2026-03)\n`;
        }
        text += `--------------------------------------`;
        return text;
    } catch (err) {
        return "Fehler bei Report-Erstellung: " + err.message;
    }
};

window.copyToClipboard = function(text, silent = false) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (!silent) window.showToast("In Zwischenablage kopiert!");
        }).catch(err => {
            if (!silent) alert("Kopieren fehlgeschlagen: " + err);
        });
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            if (!silent) window.showToast("In Zwischenablage kopiert!");
        } catch (err) {
            if (!silent) alert("Kopieren fehlgeschlagen.");
        }
        document.body.removeChild(textArea);
    }
};

const projectInputs = [
    'project-name', 'system-type', 'fluid-type', 'height-hst', 'press-pz',
    'power-q', 'press-psvs', 'vol-vs', 'vol-vhs', 'vol-vgsolar',
    'vol-vhs-v2-proxy', 'statico-vordruck',
    'temp-smax', 'temp-r', 'vento-installed', 'vessel-series', 'makeup-water',
    'transfero-series', 'fav-statico', 'fav-simply', 'fav-connectf', 'fav-connect-floor', 'fav-transfero',
    'margin-p0', 'margin-pa', 'margin-pe'
];

// 1. Get Library from LocalStorage
function getProjectLibrary() {
    const lib = localStorage.getItem('compresso_project_library');
    return lib ? JSON.parse(lib) : {};
}

// --- CENTRALIZED DATA COLLECTION ---
function collectAllProjectData() {
    const data = {};

    // 1. Static fields
    projectInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            data[id] = (el.type === 'checkbox') ? el.checked : el.value;
        }
    });

    // 1b. Radio buttons (Vs Variant)
    const vsVar = document.querySelector('input[name="vs-variant"]:checked');
    if (vsVar) data['vs-variant'] = vsVar.value;

    // 1c. State flags
    data.userManuallySetVs = userManuallySetVs;
    data.userManuallySetPsvs = userManuallySetPsvs;

    // 2. Variant 1 Apparatus
    data.v1Apparatus = [];
    document.querySelectorAll('#v1-apparatus-list .app-row').forEach(row => {
        data.v1Apparatus.push({
            label: row.querySelector('.app-label').value,
            vol: row.querySelector('.app-vol').value
        });
    });

    // 2b. Variant 1 Estimation Items (Radiators, Panels, etc.)
    data.v1EstimationItems = [];
    document.querySelectorAll('.v1-item').forEach(item => {
        data.v1EstimationItems.push({
            type: item.dataset.type,
            temp: item.querySelector('.v1-temp-select').value,
            q: item.querySelector('.v1-input-q').value
        });
    });

    // 2c. Variant 1 Custom Estimation Items
    data.v1CustomEstimationItems = [];
    document.querySelectorAll('.v1-custom-item').forEach(item => {
        data.v1CustomEstimationItems.push({
            label: item.querySelector('.v1-custom-label').value,
            factor: item.querySelector('.v1-custom-factor').value,
            q: item.querySelector('.v1-custom-q').value
        });
    });

    // 3. Variant 2 Pipes
    data.v2Pipes = [];
    document.querySelectorAll('#pipe-rows-container .pipe-row').forEach(row => {
        data.v2Pipes.push({
            dn: row.querySelector('.pipe-dn').value,
            len: row.querySelector('.pipe-length').value
        });
    });

    // 4. Variant 2 Apparatus
    data.v2Apparatus = [];
    document.querySelectorAll('#app-rows-container .app-row').forEach(row => {
        data.v2Apparatus.push({
            label: row.querySelector('.app-label').value,
            vol: row.querySelector('.app-vol').value
        });
    });

    // 5. Vhs Logs (Boilers/Storages)
    ['v1', 'v2'].forEach(v => {
        const key = v + 'VhsData';
        data[key] = { gens: [], storages: [] };
        const containerId = (v === 'v1') ? 'v1-vhs-generators' : 'v2-vhs-generators';

        document.querySelectorAll(`#${containerId} .vhs-gen-row`).forEach(row => {
            data[key].gens.push({
                type: row.querySelector('.gen-type').value,
                power: row.querySelector('.gen-power').value
            });
        });
        data[key].customGens = [];
        document.querySelectorAll(`#${containerId} .vhs-custom-gen-row`).forEach(row => {
            data[key].customGens.push({
                label: row.querySelector('.custom-gen-label').value,
                factor: row.querySelector('.custom-gen-factor').value,
                power: row.querySelector('.custom-gen-power').value
            });
        });
        document.querySelectorAll(`#${containerId} .vhs-storage-row`).forEach(row => {
            data[key].storages.push({
                vol: row.querySelector('.st-vol').value,
                temp: row.querySelector('.st-temp').value
            });
        });
    });

    return data;
}

// --- CENTRALIZED DATA APPLICATION ---
window.applyAllProjectData = function (data) {
    if (!data) return;
    try {
        // 1. Static fields
        projectInputs.forEach(id => {
            if (data[id] !== undefined) {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = data[id];
                    else el.value = data[id];
                }
            }
        });

        // 1b. Restore Radios
        if (data['vs-variant']) {
            const radio = document.querySelector(`input[name="vs-variant"][value="${data['vs-variant']}"]`);
            if (radio) radio.checked = true;
        }

        // 1c. Restore state flags
        if (data.userManuallySetVs !== undefined) window.userManuallySetVs = data.userManuallySetVs;
        if (data.userManuallySetPsvs !== undefined) window.userManuallySetPsvs = data.userManuallySetPsvs;

        // 2. Rebuild V1 Apparatus
        const v1AppList = document.getElementById('v1-apparatus-list');
        if (v1AppList) {
            v1AppList.innerHTML = '';
            if (data.v1Apparatus) {
                data.v1Apparatus.forEach(item => {
                    addAppRow('v1-apparatus-list');
                    const lastRow = v1AppList.lastElementChild;
                    if (lastRow) {
                        lastRow.querySelector('.app-label').value = item.label;
                        lastRow.querySelector('.app-vol').value = item.vol;
                    }
                });
            }
        }

        // 2b. Restore V1 Estimation Items (Radiators, Panels, etc.)
        if (data.v1EstimationItems) {
            data.v1EstimationItems.forEach(item => {
                const row = document.querySelector(`.v1-item[data-type="${item.type}"]`);
                if (row) {
                    const tempSel = row.querySelector('.v1-temp-select');
                    const qInp = row.querySelector('.v1-input-q');
                    if (tempSel) tempSel.value = item.temp;
                    if (qInp) qInp.value = item.q;
                }
            });
        }

        // 2c. Rebuild V1 Custom Estimation Items
        const v1CustomContainer = document.getElementById('v1-custom-items-container');
        if (v1CustomContainer) {
            v1CustomContainer.innerHTML = '';
            if (data.v1CustomEstimationItems) {
                data.v1CustomEstimationItems.forEach(item => {
                    window.addV1CustomItemRow();
                    const lastRow = v1CustomContainer.lastElementChild;
                    if (lastRow) {
                        lastRow.querySelector('.v1-custom-label').value = item.label || '';
                        lastRow.querySelector('.v1-custom-factor').value = item.factor || '';
                        lastRow.querySelector('.v1-custom-q').value = item.q || '';
                    }
                });
            }
        }

        // 3. Rebuild V2 Pipes
        const v2PipeList = document.getElementById('pipe-rows-container');
        if (v2PipeList) {
            v2PipeList.innerHTML = '';
            if (data.v2Pipes) {
                data.v2Pipes.forEach(item => {
                    addPipeRow(item.dn, 'pipe-rows-container', updateV2Detailed);
                    const lastRow = v2PipeList.lastElementChild;
                    if (lastRow) {
                        lastRow.querySelector('.pipe-dn').value = item.dn;
                        lastRow.querySelector('.pipe-length').value = item.len;
                        lastRow.querySelector('.pipe-dn').dispatchEvent(new Event('change'));
                    }
                });
            }
        }

        // 4. Rebuild V2 Apparatus
        const v2AppList = document.getElementById('app-rows-container');
        if (v2AppList) {
            v2AppList.innerHTML = '';
            if (data.v2Apparatus) {
                data.v2Apparatus.forEach(item => {
                    addAppRow('app-rows-container');
                    const lastRow = v2AppList.lastElementChild;
                    if (lastRow) {
                        lastRow.querySelector('.app-label').value = item.label;
                        lastRow.querySelector('.app-vol').value = item.vol;
                    }
                });
            }
        }

        // 5. Rebuild Vhs Data
        ['v1', 'v2'].forEach(v => {
            const key = v + 'VhsData';
            const vData = data[key];
            if (!vData) return;

            const genContainer = document.querySelector(`#${v}-vhs-generators .vhs-gen-rows`);
            const stContainer = document.querySelector(`#${v}-vhs-generators .vhs-storage-row-container`) || document.querySelector(`#${v}-vhs-generators .vhs-gen-rows`);
            // Note: Vhs rows are appended to vhs-gen-rows usually

            const container = document.querySelector(`#${v}-vhs-generators .vhs-gen-rows`);
            if (container) container.innerHTML = '';

            if (vData.gens) {
                vData.gens.forEach(g => {
                    window.addVhsGeneratorRow(v);
                    const lastRow = container.querySelector('.vhs-gen-row:last-child');
                    if (lastRow) {
                        lastRow.querySelector('.gen-type').value = g.type;
                        lastRow.querySelector('.gen-power').value = g.power;
                    }
                });
            }
            if (vData.customGens) {
                vData.customGens.forEach(g => {
                    window.addVhsCustomGeneratorRow(v);
                    const lastRow = container.querySelector('.vhs-custom-gen-row:last-child');
                    if (lastRow) {
                        lastRow.querySelector('.custom-gen-label').value = g.label;
                        lastRow.querySelector('.custom-gen-factor').value = g.factor;
                        lastRow.querySelector('.custom-gen-power').value = g.power;
                    }
                });
            }
            if (vData.storages) {
                vData.storages.forEach(s => {
                    window.addVhsStorageRow(v);
                    const lastRow = container.querySelector('.vhs-storage-row:last-child');
                    if (lastRow) {
                        lastRow.querySelector('.st-vol').value = s.vol;
                        lastRow.querySelector('.st-temp').value = s.temp;
                    }
                });
            }
            ensureDefaultVhsRows(v);
        });

        // Trigger full refresh
        window.isProgrammaticPsvsUpdate = true;
        projectInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.dispatchEvent(new Event('change'));
                el.dispatchEvent(new Event('input'));
            }
        });
        window.isProgrammaticPsvsUpdate = false;

        if (typeof handleVsCalculation === 'function') handleVsCalculation();
        if (typeof autoRefreshSV === 'function') autoRefreshSV();

    } catch (err) {
        console.error("Fehler beim Laden der Projektdaten:", err);
    }
};

// 2. Save to Library (INTERNAL OVERWRITE)
function saveProjectInternal() {
    const name = document.getElementById('project-name').value.trim();
    if (!name) {
        alert("Bitte geben Sie eine Projektbezeichnung ein.");
        return;
    }

    const library = getProjectLibrary();
    const data = collectAllProjectData();

    const isOverwrite = !!library[name];
    library[name] = data;
    localStorage.setItem('compresso_project_library', JSON.stringify(library));

    updateProjectDropdown();

    // Feedback
    const btn = document.getElementById('btn-save-internal');
    const originalText = btn.innerHTML;
    btn.innerHTML = isOverwrite ? "<span>✓</span> Überschrieben" : "<span>✓</span> Gespeichert";
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
}

// 3. Update Dropdown Menu
function updateProjectDropdown() {
    const library = getProjectLibrary();
    const select = document.getElementById('project-select');

    // Clear existing except first
    select.innerHTML = '<option value="">-- Gespeicherte Projekte --</option>';

    Object.keys(library).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        select.appendChild(opt);
    });
}

// 3.5 Clear Library & Reset Form
function clearProjectLibrary() {
    if (confirm("Möchten Sie den gesamten Cache und alle gespeicherten Projekte unwiderruflich löschen? Die App wird komplett zurückgesetzt.")) {
        // Remove all app related cache keys to avoid stale leftovers
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('compresso_')) {
                localStorage.removeItem(key);
            }
        });

        updateProjectDropdown();

        const projectSelect = document.getElementById('project-select');
        if (projectSelect) projectSelect.value = '';

        // Reset the UI
        resetFullForm(true); // Call reset without an extra confirm

        // Re-apply true factory defaults after cache purge
        applyUserDefaultsToUI();
        loadUserDefaultsToSettingsUI();

        alert("Der gesamte Cache wurde vollständig geleert. Die Anwendung wurde auf Werkzustand zurückgesetzt.");
    }
}

// 4. Load from Library
function loadProjectFromLibrary() {
    const name = document.getElementById('project-select').value;
    if (!name) return;

    const library = getProjectLibrary();
    const data = library[name];

    if (data) {
        applyAllProjectData(data);
    }
}

// 5. Export to File (Download)
function exportProjectToFile() {
    const data = collectAllProjectData();
    const projectName = document.getElementById('project-name').value || 'Unbenanntes Projekt';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_CompressoCalc.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 6. Import from File
function importProjectFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            applyAllProjectData(data);
            event.target.value = '';
        } catch (err) {
            alert('Fehler: Ungültiges Dateiformat.');
        }
    };
    reader.readAsText(file);
}

// Auto-save temporary state
window.saveTempState = function () {
    const data = collectAllProjectData();
    localStorage.setItem('compresso_temp_state', JSON.stringify(data));
};

window.loadTempState = function () {
    const saved = localStorage.getItem('compresso_temp_state');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            window.applyAllProjectData(data);
        } catch (e) { }
    }
};

// Listeners
// Listeners moved to the bottom of the file with settings logic


// ==========================================
// SETTINGS & DEFAULT VALUES
// ==========================================

const FACTORY_DEFAULTS = {
    'system-type': 'heating',
    'fluid-type': 'Water',
    'height-hst': '',
    'press-pz': '0.5',
    'power-q': '',
    // vol-vs is auto-calculated by default
    'vol-vs': '',
    // vol-vhs intentionally excluded – always starts empty
    'temp-smax': '',
    'temp-r': '',
    'margin-left': '300',
    'app-width': '1100',
    'side-height': '550',
    'side-width': '420',
    'permanent-benchmark': false
};

const settingsInputs = [
    'def-system-type', 'def-fluid-type', 'def-height-hst', 'def-press-pz',
    'def-power-q', 'def-vol-vs', 'def-temp-smax', 'def-temp-r', 'def-margin-left', 
    'def-app-width', 'def-side-height', 'def-side-width', 'def-permanent-benchmark'
];

function getUserDefaults() {
    try {
        const saved = localStorage.getItem('compresso_user_defaults');
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error("Failed to load user defaults:", e);
    }
    return { ...FACTORY_DEFAULTS };
}

function saveUserDefaults() {
    const defaults = {};
    settingsInputs.forEach(id => {
        const el = document.getElementById(id);
        const mainId = id.replace('def-', '');
        if (el.type === 'checkbox') {
            defaults[mainId] = el.checked;
        } else {
            defaults[mainId] = el.value;
        }
    });

    localStorage.setItem('compresso_user_defaults', JSON.stringify(defaults));

    // Feedback
    const btn = document.getElementById('btn-save-defaults');
    const originalText = btn.innerHTML;
    btn.innerHTML = "<span>✓</span> Gespeichert";
    setTimeout(() => {
        btn.innerHTML = originalText;
        toggleSettings(false);
    }, 1500);

    // If no temp state or if we want to apply immediately
    applyUserDefaultsToUI();
}

function resetToFactoryDefaults() {
    if (confirm("Möchten Sie alle Standardwerte auf die Werkseinstellungen zurücksetzen?")) {
        localStorage.removeItem('compresso_user_defaults');
        loadUserDefaultsToSettingsUI();
        alert("Werkseinstellungen wiederhergestellt.");
    }
}

function loadUserDefaultsToSettingsUI() {
    const defaults = getUserDefaults();
    settingsInputs.forEach(id => {
        const mainId = id.replace('def-', '');
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = (defaults[mainId] === true || defaults[mainId] === "true");
            } else {
                el.value = defaults[mainId];
            }
        }
    });
}

function applyUserDefaultsToUI(onlyPreferences = false) {
    const defaults = getUserDefaults();
    
    if (!onlyPreferences) {
        // Never set Vhs fields from defaults – they always start empty
        const skipIds = ['vol-vhs', 'vol-vhs-v2-proxy'];
        window.isProgrammaticPsvsUpdate = true;
        Object.keys(defaults).forEach(id => {
            if (skipIds.includes(id) || id === 'margin-left') return;
            const el = document.getElementById(id);
            if (el) {
                el.value = defaults[id];
                el.dispatchEvent(new Event('change'));
                el.dispatchEvent(new Event('input'));
            }
        });
        window.isProgrammaticPsvsUpdate = false;

        // Vs should be auto by default after applying defaults/reset
        userManuallySetVs = false;
        const vsEl = document.getElementById('vol-vs');
        if (vsEl) vsEl.value = '';
        updateVsOverrideUi();

        if (typeof handleVsCalculation === 'function') handleVsCalculation();
        autoRefreshSV();
    }

    // APPLY PERMANENT BENCHMARK
    if (defaults['permanent-benchmark'] === true || defaults['permanent-benchmark'] === "true") {
        const benchToggle = document.getElementById('mode-imi-benchmark');
        if (benchToggle && !benchToggle.checked) {
            benchToggle.checked = true;
            // Explicitly call the logic instead of just dispatching event, 
            // as listeners might not be ready yet during early init
            const banner = document.getElementById('benchmark-warning-banner');
            if (banner) banner.classList.remove('hidden');
            if (typeof autoRefreshSV === 'function') autoRefreshSV();
            if (typeof window.updateSidePanel === 'function') window.updateSidePanel();
        }
    }

    // Apply Margin-Left to app-container
    if (defaults['margin-left']) {
        const container = document.querySelector('.app-container');
        if (container) {
            container.style.marginLeft = defaults['margin-left'] + 'px';
            container.style.marginRight = 'auto'; // Ensure right is auto if we set left
        }
    }

    // Apply App-Width to app-container
    if (defaults['app-width']) {
        const container = document.querySelector('.app-container');
        if (container) {
            container.style.maxWidth = defaults['app-width'] + 'px';
        }
    }

    // Apply Side-Height to CSS variable
    if (defaults['side-height']) {
        document.documentElement.style.setProperty('--side-report-max-height', defaults['side-height'] + 'px');
    }

    // Apply Side-Width to CSS variable
    if (defaults['side-width']) {
        document.documentElement.style.setProperty('--side-panel-width', defaults['side-width'] + 'px');
    }
}

function toggleSettings(forceState) {
    const panel = document.getElementById('settings-panel');
    if (forceState !== undefined) {
        panel.classList.toggle('hidden', !forceState);
    } else {
        panel.classList.toggle('hidden');
    }

    if (!panel.classList.contains('hidden')) {
        loadUserDefaultsToSettingsUI();
    }
}

function resetFullForm(skipConfirm = false) {
    if (skipConfirm || confirm("Möchten Sie alle Eingaben zurücksetzen? (Gespeicherte Standards werden geladen)")) {
        localStorage.removeItem('compresso_temp_state');

        // Clear dynamic rows
        const v1App = document.getElementById('v1-apparatus-list');
        const v2Pipe = document.getElementById('pipe-rows-container');
        const v2App = document.getElementById('app-rows-container');
        if (v1App) v1App.innerHTML = '';
        if (v2Pipe) v2Pipe.innerHTML = '';
        if (v2App) v2App.innerHTML = '';

        document.querySelectorAll('.vhs-gen-rows').forEach(container => {
            container.innerHTML = '';
        });

        applyUserDefaultsToUI();

        // Rebuild dynamic defaults after clearing containers
        if (typeof initPipeRows === 'function') initPipeRows();
        if (typeof addAppRow === 'function') addAppRow('app-rows-container');
        if (typeof addAppRow === 'function') addAppRow('v1-apparatus-list');
        ensureDefaultVhsRows('v1');
        ensureDefaultVhsRows('v2');

        // Reset results UI
        const results = document.getElementById('results');
        const report = document.getElementById('report-view');
        if (results) {
            results.classList.add('hidden');
            results.style.display = '';
        }
        if (report) {
            report.classList.add('hidden');
            report.style.display = '';
        }

        const projName = document.getElementById('project-name');
        if (projName) projName.value = "Neue Berechnung";

        // Reset safety margins
        document.getElementById('margin-p0').checked = false;
        document.getElementById('margin-pa').checked = true;
        document.getElementById('margin-pe').checked = false;

        handleVsCalculation();
    }
}

// Logic for Initialization
// --- UI Helpers & Side Panel ---


window.updateSidePanel = function () {
    const content = document.getElementById('side-results-content');
    if (!content) return;

    // Retrieve core values to check if calculation was run
    const Vn = document.getElementById('res-vn')?.innerText || "0.0";
    const Ve = document.getElementById('res-ve')?.innerText || "0.0";
    const hasResults = parseFloat(Vn.replace(',', '.')) > 0 || parseFloat(Ve.replace(',', '.')) > 0;

    if (window.hasValidationError || !hasResults) {
        content.innerHTML = '<p class="placeholder-text">Werte eingeben für Live-Resultate...</p>';
        return;
    }

    const reportText = window.getBenchmarkReportText();
    
    let html = `
        <div class="side-report-preview">
            ${reportText}
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted); text-align:center; margin-top:0.8rem;">
            (Werte wurden automatisch in Zwischenablage kopiert)
        </div>
    `;

    content.innerHTML = html;
};

function initializeApp() {
    const hasTempState = localStorage.getItem('compresso_temp_state');

    if (hasTempState) {
        loadTempState();

        // One-time conversion: Force clear old persistent dummy values
        const idsToCheck = ['height-hst', 'temp-smax', 'temp-r', 'press-pz', 'power-q'];
        // Expanded list of old defaults to hunt down (including 1000 for Q)
        const oldDefaults = {
            'height-hst': ['15'],
            'temp-smax': ['80'],
            'temp-r': ['60'],
            'press-pz': [], // Don't clear 0.5 for pz
            'power-q': ['100', '1000']
        };

        let foundOldDefault = false;
        idsToCheck.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const val = (el.value || "").trim();
                if (oldDefaults[id].includes(val)) {
                    el.value = '';
                    foundOldDefault = true;
                }
            }
        });

        if (foundOldDefault) {
            if (typeof window.saveTempState === 'function') window.saveTempState();
        }

    }
    
    // Always apply global UI preferences (like margin) regardless of temp state
    applyUserDefaultsToUI(true);

    updateProjectDropdown();
    ensureDefaultVhsRows('v1');
    ensureDefaultVhsRows('v2');
    syncNestedVisibility();
    autoRefreshSV();

    // Final safety: pz must always be at least 0.5 as default
    const pzEl = document.getElementById('press-pz');
    if (pzEl && pzEl.value === '') {
        pzEl.value = '0.5';
    }

    // Benchmark Mode UI Init
    const isBenchmark = document.getElementById('mode-imi-benchmark').checked;
    const banner = document.getElementById('benchmark-warning-banner');
    if (banner) banner.classList.toggle('hidden', !isBenchmark);
    
    if (typeof updateSidePanel === 'function') updateSidePanel();
}


// Event Listeners for Settings
document.getElementById('btn-toggle-settings').addEventListener('click', () => toggleSettings());
document.getElementById('btn-close-settings').addEventListener('click', () => toggleSettings(false));
document.getElementById('btn-save-defaults').addEventListener('click', saveUserDefaults);
document.getElementById('btn-reset-factory').addEventListener('click', resetToFactoryDefaults);
document.getElementById('btn-new-calc').addEventListener('click', resetFullForm);

// Listeners
document.getElementById('btn-save-internal').addEventListener('click', saveProjectInternal);
document.getElementById('project-select').addEventListener('change', loadProjectFromLibrary);
document.getElementById('btn-export-file').addEventListener('click', exportProjectToFile);
document.getElementById('btn-load-trigger').addEventListener('click', () => {
    document.getElementById('project-file-input').click();
});
document.getElementById('project-file-input').addEventListener('change', importProjectFromFile);
document.getElementById('btn-clear-cache').addEventListener('click', clearProjectLibrary);

document.getElementById('btn-copy-comparison')?.addEventListener('click', function() {
    try {
        const text = window.getBenchmarkReportText();
        if (text && text.trim().length > 0) {
            window.copyToClipboard(text);
        } else {
            window.showCustomAlert("Keine Daten vorhanden. Bitte zuerst Berechnung starten.", "Hinweis");
        }
    } catch (e) {
        console.error("Copy failed:", e);
    }
});

// Attach Copy listener for side panel
document.getElementById('btn-copy-side')?.addEventListener('click', function() {
    try {
        const content = document.getElementById('side-results-content');
        if (content) {
            const text = content.innerText;
            if (text && text.trim().length > 0 && !text.includes("Werte eingeben")) {
                window.copyToClipboard(text);
            } else {
                window.showCustomAlert("Keine Live-Resultate zum Kopieren vorhanden.", "Hinweis");
            }
        }
    } catch (e) {
        console.error("Side copy failed:", e);
    }
});

document.getElementById('mode-imi-benchmark').addEventListener('change', () => {
    const isChecked = document.getElementById('mode-imi-benchmark').checked;
    const banner = document.getElementById('benchmark-warning-banner');
    if (banner) banner.classList.toggle('hidden', !isChecked);
    
    if (typeof autoRefreshSV === 'function') autoRefreshSV();
    
    // HIDE RESULTS until Start is clicked again
    const results = document.getElementById('results');
    if (results) {
        results.style.display = 'none';
        results.classList.add('hidden');
    }
    const reportView = document.getElementById('report-view');
    if (reportView) {
        reportView.style.display = 'none';
        reportView.classList.add('hidden');
    }
    window.hasValidationError = true; // Use this to clear side panel too
    if (typeof window.updateSidePanel === 'function') window.updateSidePanel();

    if (typeof window.saveTempState === 'function') window.saveTempState();
});

// Auto-save temp (event delegation also covers dynamically added rows)
const calcFormEl = document.querySelector('.calc-form');
if (calcFormEl) {
    calcFormEl.addEventListener('change', window.saveTempState);
    calcFormEl.addEventListener('input', (e) => {
        if (e.target && e.target.tagName === 'INPUT') window.saveTempState();
    });
}

// Initialization
window.addEventListener('load', initializeApp);

// ==========================================
// TECHNICAL LIBRARY LOGIC
// ==========================================

const docLibraryMaster = [
    { id: 'pb', title: "Planung und Berechnung", desc: "Grundlagen für Druckhaltung, Entgasung und Wasserqualität.", file: "Planung_und_Berechnung_CH_DE_low.pdf", tags: ["swki", "berechnung"] },
    { id: 'sc', title: "Simply Compresso", desc: "Kompakte Druckhaltung mit Kompressoren bis 4 bar.", file: "Simply_Compresso_DE-CH_low.pdf", tags: ["simply", "4 bar"] },
    { id: 'st', title: "Statico - Gefässe", desc: "Details zu Statico SD and SU Druckausdehnungsgefässen.", file: "Statico_DE-CH_low.pdf", tags: ["statico", "vordruck"] },
    { id: 'cc', title: "Compresso Connect", desc: "Präzisionsdruckhaltung mit BrainCube Connect Steuerung.", file: "Compresso_Connect_IN_DE_low.pdf", tags: ["connect", "tecbox"] },
    { id: 'cf', title: "Compresso Connect F", desc: "Modulare TecBox Serie für Compresso-Systeme.", file: "Compresso_Connect_F_IN_DE_low.pdf", tags: ["f", "modular"] },
    { id: 'sv', title: "Sicherheitsventile", desc: "Leistungstabellen und Auswahlhilfen für Sicherheitsventile.", file: "Safety_Valves_DE-CH_low.pdf", tags: ["sv", "psvs"] },
    { id: 'he301', title: "SWKI HE 301-01", desc: "Sicherheitstechnische Einrichtungen für Heizungsanlagen (Auslegung).", file: "SWKI HE 301-01.pdf", tags: ["swki", "norm", "he301"] }
];

let currentDocOrder = docLibraryMaster;

function loadLibraryOrder() {
    const saved = localStorage.getItem('compresso_library_order');
    if (saved) {
        const orderIds = JSON.parse(saved);
        currentDocOrder = orderIds.map(id => docLibraryMaster.find(d => d.id === id)).filter(Boolean);
        // Add any missing new docs
        docLibraryMaster.forEach(d => {
            if (!orderIds.includes(d.id)) currentDocOrder.push(d);
        });
    }
}

function saveLibraryOrder() {
    const order = Array.from(document.querySelectorAll('.doc-card')).map(el => el.dataset.id);
    localStorage.setItem('compresso_library_order', JSON.stringify(order));
}

function renderLibrary(filter = '') {
    const grid = document.getElementById('library-grid');
    grid.innerHTML = '';

    loadLibraryOrder();

    const filtered = currentDocOrder.filter(doc =>
        doc.title.toLowerCase().includes(filter.toLowerCase()) ||
        doc.desc.toLowerCase().includes(filter.toLowerCase()) ||
        doc.tags.some(t => t.includes(filter.toLowerCase()))
    );

    filtered.forEach(doc => {
        const card = document.createElement('div');
        card.className = "doc-card animate-in";
        card.draggable = true;
        card.dataset.id = doc.id;
        card.innerHTML = `
            <div class="doc-info" onclick="window.open('../${doc.file}', '_blank')">
                <h3>${doc.title}</h3>
                <p>${doc.desc}</p>
            </div>
            <div class="doc-meta">
                <span class="btn-doc-open" onclick="window.open('../${doc.file}', '_blank')">PDF Öffnen</span>
                <span style="font-size: 1.2rem; cursor: grab; opacity: 0.5;">⋮⋮</span>
            </div>
        `;

        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            saveLibraryOrder();
        });

        grid.appendChild(card);
    });

    grid.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;

        const target = e.target.closest('.doc-card');
        if (target && target !== dragging) {
            const rect = target.getBoundingClientRect();
            // In a grid, we consider both X and Y center of the target
            const midX = rect.left + rect.width / 2;
            const midY = rect.top + rect.height / 2;
            const after = e.clientX > midX || e.clientY > midY;
            grid.insertBefore(dragging, after ? target.nextSibling : target);
        }
    });

    grid.addEventListener('drop', e => {
        e.preventDefault();
        saveLibraryOrder();
    });
}

window.toggleLibrary = function (show) {
    const drawer = document.getElementById('library-drawer');
    const currentlyClosed = drawer.classList.contains('closed');

    // If 'show' is undefined (from toggle click), flip current state
    const targetState = (show === undefined) ? currentlyClosed : show;

    drawer.classList.toggle('closed', !targetState);

    if (targetState) {
        renderLibrary();
        document.getElementById('library-search').focus();
    }
}

// Global click handler to close drawer when clicking outside
document.addEventListener('mousedown', (e) => {
    const drawer = document.getElementById('library-drawer');
    const btn = document.getElementById('btn-library');
    if (!drawer.classList.contains('closed') && !drawer.contains(e.target) && !btn.contains(e.target)) {
        toggleLibrary(false);
    }
});

document.getElementById('btn-library').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLibrary(); // Toggles automatically
});

document.getElementById('btn-close-library').addEventListener('click', () => toggleLibrary(false));
document.getElementById('library-search').addEventListener('input', (e) => renderLibrary(e.target.value));

// --- ADVANCED 4-WAY GRID NAVIGATION ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleLibrary(false);

    // Prevent ANY keyboard interaction on SELECT elements
    if (e.target.tagName === 'SELECT') {
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    const navKeys = ['Enter', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'];
    if (!navKeys.includes(e.key)) return;

    // Exceptions
    if (e.target.tagName === 'BUTTON' && e.key === 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return;
    // Don't execute grid jumps if originating from a select
    if (e.target.tagName === 'SELECT') return;

    // 1. DISCOVER GRID (Excluding Selects)
    const allElements = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly]), button:not([disabled])'));
    const current = e.target;
    if (!allElements.includes(current)) return;

    // PREVENT ALL (value changes in numbers)
    e.preventDefault();
    e.stopImmediatePropagation();

    const rect = current.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;

    let target = null;

    if (e.key === 'ArrowRight' || e.key === 'Enter') {
        target = allElements[allElements.indexOf(current) + 1];
    } else if (e.key === 'ArrowLeft') {
        target = allElements[allElements.indexOf(current) - 1];
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const isDown = e.key === 'ArrowDown';
        let candidates = allElements.filter(el => {
            const r = el.getBoundingClientRect();
            return isDown ? (r.top > rect.top + 5) : (r.top < rect.top - 5);
        });

        if (candidates.length > 0) {
            // Find target in the nearest row with the closest horizontal position
            const rows = {};
            candidates.forEach(el => {
                const r = el.getBoundingClientRect();
                const rowTop = Math.round(r.top / 10) * 10; // group by 10px tolerance
                if (!rows[rowTop]) rows[rowTop] = [];
                rows[rowTop].push(el);
            });

            const sortedRowTops = Object.keys(rows).map(Number).sort((a, b) => isDown ? (a - b) : (b - a));
            const nearestRow = rows[sortedRowTops[0]];

            // In the nearest row, find the element with closest X center
            let minDist = Infinity;
            nearestRow.forEach(el => {
                const r = el.getBoundingClientRect();
                const dist = Math.abs(midX - (r.left + r.width / 2));
                if (dist < minDist) {
                    minDist = dist;
                    target = el;
                }
            });
        }
    }

    if (target) {
        target.focus({ preventScroll: true });
        if (target.tagName === 'INPUT' && (target.type === 'number' || target.type === 'text')) {
            target.select();
        }
    }
}, { capture: true });

// Apply tabindex="-1" to all selects to prevent Tab key focus
document.querySelectorAll('select').forEach(sel => sel.setAttribute('tabindex', '-1'));

// Block mouse wheel on focused number inputs
document.addEventListener('wheel', (e) => {
    if (document.activeElement && document.activeElement.type === 'number') {
        e.preventDefault();
    }
}, { passive: false });

// Modal Control Functions
function openNormModal() {
    document.getElementById('norm-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent scrolling
}

function openReferenceModal() {
    // 1. Collect current values (same logic as in main calculation)
    const activeVsVariant = document.querySelector('input[name="vs-variant"]:checked').value;
    const Vs = parseFloat(document.getElementById('vol-vs').value) || 0;
    const Q = parseFloat(document.getElementById('power-q').value) || 0;
    const tsmax = parseFloat(document.getElementById('temp-smax').value) || 0;
    const tr = parseFloat(document.getElementById('temp-r').value) || 0;
    const sysType = document.getElementById('system-type').value;
    const fluid = document.getElementById('fluid-type').value;

    const vhsContainerId = (activeVsVariant === 'v1') ? 'v1-vhs-generators' : 'v2-vhs-generators';

    // Calculate central volume (Vcentral)
    let vcentral = 0;
    const manualInputId = (activeVsVariant === 'v1') ? 'vol-vhs' : 'vol-vhs-v2-proxy';
    const manualInputEl = document.getElementById(manualInputId);
    vcentral += window.safeMathEval(manualInputEl ? manualInputEl.value : "0");

    const genRows = document.querySelectorAll(`#${vhsContainerId} .vhs-gen-row`);
    genRows.forEach(row => {
        const typeLabel = row.querySelector('.gen-type').value;
        const typeDef = vhsGeneratorTypes.find(t => t.label === typeLabel);
        const factor = typeDef ? typeDef.factor : 0;
        const powerStr = row.querySelector('.gen-power').value.replace(',', '.');
        const power = parseFloat(powerStr) || 0;
        vcentral += (factor * power);
    });

    let storageVol = 0;
    const stRows = document.querySelectorAll(`#${vhsContainerId} .vhs-storage-row`);
    stRows.forEach(row => {
        const volStr = row.querySelector('.st-vol').value.replace(',', '.');
        storageVol += parseFloat(volStr) || 0;
    });

    const vhsTotal = vcentral + storageVol;
    const distributionVs = Math.max(0, Vs - vhsTotal);

    // 2. Calculate Factors
    let X = 1.5;
    if (sysType === 'geothermal') {
        X = 2.5;
    } else {
        if (Q <= 10) X = 3.0;
        else if (Q > 10 && Q <= 150) X = (87 - 0.3 * Q) / 28;
        else X = 1.5;
    }

    let e = 0;
    if (sysType === 'cooling' || sysType === 'geothermal' || sysType === 'solar' || sysType === 'heatpump') {
        e = getExpansionCoeff(fluid, tsmax);
    } else {
        e = getExpansionCoeff(fluid, (tsmax + tr) / 2.0);
    }
    if (sysType === 'heating') e = Math.max(e, 0.00900);

    let e_hs = getExpansionCoeff(fluid, tsmax);
    if (sysType === 'heating') e_hs = Math.max(e_hs, 0.0107);

    // Calculate Ve (simplified for overview)
    let Ve = (distributionVs * e * X) + (vcentral * e_hs);
    // Add individual storage expansions
    stRows.forEach(row => {
        const vol = parseFloat(row.querySelector('.st-vol').value.replace(',', '.')) || 0;
        const temp = parseFloat(row.querySelector('.st-temp').value.replace(',', '.')) || tsmax;
        let st_e = getExpansionCoeff(fluid, temp);
        if (sysType === 'heating') st_e = Math.max(st_e, 0.0107);
        Ve += (vol * st_e);
    });

    // 3. Update Modal DOM
    const pz = parseFloat(document.getElementById('press-pz').value.replace(',', '.')) || 0;
    document.getElementById('ref-vs-val').innerText = `${distributionVs.toFixed(0)}ℓ Basis + ${vhsTotal.toFixed(0)}ℓ Zentrale/Speicher`;
    document.getElementById('ref-q-val').innerText = `${Q} kW`;
    document.getElementById('ref-temp-val').innerText = (sysType === 'heating' || sysType === 'dh') ? `${tsmax} / ${tr} °C` : `${tsmax} °C`;
    document.getElementById('ref-pz-val').innerText = `${pz.toFixed(1)} bar`;
    document.getElementById('ref-e-val').innerText = e.toFixed(5);
    document.getElementById('ref-esto-val').innerText = e_hs.toFixed(5);
    document.getElementById('ref-x-val').innerText = X.toFixed(2);
    document.getElementById('ref-ve-val').innerText = `${Ve.toFixed(1)} Liter`;

    // 4. Show Modal
    document.getElementById('reference-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeNormModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('norm-modal').classList.add('hidden');
    document.body.style.overflow = ''; // Restore scrolling
}

function closeReferenceModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('reference-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function toggleV1Details() {
    const content = document.getElementById('v1-details-collapsible');
    const icon = document.getElementById('v1-details-toggle-icon');
    if (!content || !icon) return;
    const isHidden = content.classList.toggle('hidden-section');
    icon.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
}

function toggleV2Details() {
    const content = document.getElementById('v2-details-collapsible');
    const icon = document.getElementById('v2-details-toggle-icon');
    if (!content || !icon) return;
    const isHidden = content.classList.toggle('hidden-section');
    icon.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
}

// Global Escape listener for Modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeNormModal();
        closeReferenceModal();
    }
});

function toggleVhs1() {
    const content = document.getElementById('v1-vhs-collapsible');
    const icon = document.getElementById('vhs1-toggle-icon');
    if (!content || !icon) return;
    const isHidden = content.classList.toggle('hidden-section');
    icon.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
}

function toggleVhs2() {
    const content = document.getElementById('v2-vhs-collapsible');
    const icon = document.getElementById('vhs2-toggle-icon');
    if (!content || !icon) return;
    const isHidden = content.classList.toggle('hidden-section');
    icon.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
}

// NOTE: clearVhsFields is no longer called automatically on load 
// to allow loadTempState to restore saved values correctly.
function clearVhsFields() {
    const ids = ['vol-vhs', 'vol-vhs-v2-proxy'];
    const dispIds = ['vhs-res-v1', 'vhs-res-v2'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    dispIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
}

// (Copy listener moved up to central listeners area)
document.getElementById('mode-imi-benchmark')?.addEventListener('change', function() {
    if (this.checked) {
        imiP0Strategy = null; // Re-ask for strategy when enabling IMI mode
        if (typeof handleVsCalculation === 'function') handleVsCalculation();
    }
});
