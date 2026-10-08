/* luckyjet — logique du jeu.
   Extrait de luckyJet.html.
   Chargé après shared/protect.js et shared/predictor.js. */

/* ===================== MOTEUR DE PRÉDICTION ===================== */
const HISTORY_URL = "https://crash-gateway-grm-cr.100hp.app/history";
const SESSION_ID = "b4061aaf-0c67-4e08-92c6-f5c250c6928f";
const CUSTOMER_ID = "077dee8d-c923-4c02-9bee-757573662e69";
const COOLDOWN = 120;          // blocage 2 minutes
const SPIKE_THRESHOLD = 10;    // les tours >= 10x sont ignorés (spikes)
const MAX_COEF = 7.00;         // le predictor ne sort jamais au-dessus

let lastSeenId = null;
const historyData = [];

function getCoef(item) {
    if (!item) return undefined;
    const v = item.coef ?? item.crash ?? item.value ?? item.topCoefficient;
    return v ? Number(v) : undefined;
}
function calcEWMA(d, a = 0.3) { if (!d.length) return 1.5; let e = d[0]; for (let i = 1; i < d.length; i++) e = a * d[i] + (1 - a) * e; return e; }
function calcMA(d, w) { if (d.length < w) return d[d.length - 1] || 1.5; return d.slice(-w).reduce((x, y) => x + y, 0) / w; }
function calcVol(d) { if (d.length < 2) return 0; const m = d.reduce((x, y) => x + y, 0) / d.length; return Math.sqrt(d.reduce((s, v) => s + Math.pow(v - m, 2), 0) / d.length); }
function detectTrend(d, w = 10) { if (d.length < w) return 0; const r = d.slice(-w); let up = 0; for (let i = 1; i < r.length; i++) if (r[i] > r[i - 1]) up++; return (up / (r.length - 1)) - 0.5; }
function calcMomentum(d, p = 5) { if (d.length < p + 1) return 0; return (d[d.length - 1] - d[d.length - p - 1]) / d[d.length - p - 1]; }
function findCycles(d) { if (d.length < 20) return 1.5; const n = d.map(v => Math.log(v)); const m = n.reduce((x, y) => x + y, 0) / n.length; const c = n.map(v => v - m); let maxC = 0, bestLag = 1; for (let lag = 1; lag < Math.min(10, d.length / 2); lag++) { let corr = 0; for (let i = 0; i < c.length - lag; i++) corr += c[i] * c[i + lag]; corr /= (c.length - lag); if (Math.abs(corr) > Math.abs(maxC)) { maxC = corr; bestLag = lag; } } return d.length > bestLag ? d[d.length - bestLag] : d[d.length - 1]; }
function wRegression(d, w) { if (d.length < 3) return d[d.length - 1] || 1.5; const n = d.length; let sX = 0, sY = 0, sXY = 0, sX2 = 0, sW = 0; for (let i = 0; i < n; i++) { const x = i, y = Math.log(d[i]), ww = w[i]; sW += ww; sX += ww * x; sY += ww * y; sXY += ww * x * y; sX2 += ww * x * x; } const slope = (sW * sXY - sX * sY) / (sW * sX2 - sX * sX); const inter = (sY - slope * sX) / sW; return Math.exp(slope * n + inter); }
function ensemblePrediction(h) {
    if (h.length < 10) return 1.2 + Math.random() * 1.5;
    const vol = calcVol(h.slice(-20));
    const alpha = Math.max(0.1, Math.min(0.5, vol / 2));
    const ewmaPred = calcEWMA(h, alpha);
    const trendPred = calcMA(h, 10) * (1 + detectTrend(h, 15) * 0.2);
    const momentumPred = h[h.length - 1] * (1 + calcMomentum(h, 7) * 0.3);
    const cyclePred = findCycles(h);
    const regressionPred = wRegression(h, h.map((_, i) => Math.exp((i - h.length + 1) / 8)));
    const mean = h.reduce((a, b) => a + b, 0) / h.length;
    const last = h[h.length - 1];
    const meanRevPred = last + (mean - last) * 0.3;
    const preds = [
        { v: ewmaPred, w: .25 }, { v: trendPred, w: .20 }, { v: momentumPred, w: .15 },
        { v: cyclePred, w: .10 }, { v: regressionPred, w: .20 }, { v: meanRevPred, w: .10 }
    ];
    // jamais de spike en sortie : la prédiction est plafonnée
    return Math.max(1.01, Math.min(preds.reduce((s, p) => s + p.v * p.w, 0), MAX_COEF));
}

/* Échantillon sans les spikes : un tour à 10x+ ne tire pas la suite vers le haut */
function sample() {
    const filtered = historyData.filter(v => v < SPIKE_THRESHOLD);
    return filtered.length >= 10 ? filtered : historyData;
}

/* Collecte silencieuse de l'historique (aucun affichage automatique) */
async function collectHistory() {
    try {
        const res = await fetch(HISTORY_URL, {
            headers: { "accept": "application/json", "session-id": SESSION_ID, "customer-id": CUSTOMER_ID }
        });
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) return;
        const latest = data[0];
        if (latest && latest.id === lastSeenId) return;
        if (latest) lastSeenId = latest.id;
        const coef = getCoef(latest);
        if (!coef) return;
        historyData.push(coef);
        if (historyData.length > 300) historyData.shift();
    } catch (e) { /* silencieux */ }
}

/* ===================== UI ===================== */
function showMessage(msg) {
    const t = document.getElementById('message-table');
    document.getElementById('message-text').textContent = msg;
    t.classList.add('active');
    clearTimeout(showMessage._t);
    showMessage._t = setTimeout(() => t.classList.remove('active'), 3000);
}
function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { }
}
const pad = n => String(n).padStart(2, '0');
const fmtClock = d => pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
const fmtCount = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);

const btn = document.getElementById('predict-btn');
const label = document.getElementById('predict-label');
const cool = document.getElementById('btn-cool');
const hint = document.getElementById('hint');
const orb = document.getElementById('orb');
const coefEl = document.getElementById('coefficient');
const timeEl = document.getElementById('play-time');
const chip = document.getElementById('time-chip');
let locked = false;

function startCooldown(playTime, leftOverride) {
    locked = true;
    btn.disabled = true;
    const clockText = (typeof playTime === 'string') ? playTime : fmtClock(playTime);
    // reprise après actualisation : on repart du temps restant
    let left = (typeof leftOverride === 'number' && leftOverride > 0)
        ? Math.min(leftOverride, COOLDOWN)
        : COOLDOWN;
    const tick = () => {
        label.textContent = 'PROCHAINE PRÉDICTION ' + fmtCount(left);
        cool.style.width = ((COOLDOWN - left) / COOLDOWN * 100) + '%';
        hint.textContent = 'SIGNAL VALIDE POUR ' + clockText + ' — PATIENTEZ';
        if (left <= 0) {
            clearInterval(iv);
            locked = false;
            btn.disabled = false;
            cool.style.width = '0%';
            label.textContent = 'NOUVELLE PRÉDICTION';
            hint.textContent = 'APPUYEZ POUR OBTENIR VOTRE SIGNAL';
            showMessage('Vous pouvez demander une nouvelle prédiction ✅');
            vibrate([40, 80, 40]);
            return;
        }
        left--;
    };
    tick();
    const iv = setInterval(tick, 1000);
}

async function newPrediction() {
    if (locked) { vibrate(15); return; }
    // pause conseillée / question précédente sans réponse
    if (window.Predictor && !window.Predictor.gate()) return;
    vibrate(45);
    locked = true;
    btn.disabled = true;
    orb.classList.add('pending');
    coefEl.classList.add('idle');
    coefEl.textContent = 'ANALYSE...';
    label.textContent = 'ANALYSE EN COURS...';
    hint.textContent = 'CALCUL DU SIGNAL...';
    chip.classList.remove('on');

    await collectHistory();
    await new Promise(r => setTimeout(r, 1400));

    const value = ensemblePrediction(sample());
    const playTime = new Date(Date.now() + COOLDOWN * 1000); // heure actuelle + 2 min

    orb.classList.remove('pending');
    coefEl.classList.remove('idle');
    coefEl.textContent = value.toFixed(2) + 'x';
    timeEl.textContent = fmtClock(playTime);
    chip.classList.add('on');
    showMessage('Signal généré — jouez à ' + fmtClock(playTime));
    vibrate([70, 50, 70, 50, 160]);

    if (window.Predictor) window.Predictor.predictionMade(
        'Jouez à ' + fmtClock(playTime) + ' — ' + value.toFixed(2) + 'x',
        { coeff: value.toFixed(2) + 'x', time: fmtClock(playTime),
                  endsAt: Date.now() + COOLDOWN * 1000 });

    startCooldown(playTime);
}

/* Réaffiche la prédiction après une actualisation de la page. */
window.luckyjetRestorePrediction = function (d) {
    if (!d) return;
    orb.classList.remove('pending');
    coefEl.classList.remove('idle');
    if (d.coeff) coefEl.textContent = d.coeff;
    if (d.time) timeEl.textContent = d.time;
    chip.classList.add('on');
    label.textContent = 'DERNIER SIGNAL';
    hint.textContent = 'PRÉDICTION RESTAURÉE';

    // le refroidissement reprend exactement là où il en était
    var left = d.endsAt ? Math.ceil((d.endsAt - Date.now()) / 1000) : 0;
    if (left > 0) startCooldown(d.time || '', left);
};

btn.addEventListener('click', newPrediction);
document.querySelectorAll('.btn-ghost').forEach(b => b.addEventListener('click', () => vibrate(25)));

/* ===================== CHARGEMENT ===================== */
(function () {
    let p = 1;
    const bar = document.getElementById('loader-bar-fill');
    const pct = document.getElementById('loader-pct');
    const iv = setInterval(function () {
        p += Math.floor(Math.random() * 4) + 1;
        if (p >= 100) { p = 100; clearInterval(iv); }
        bar.style.width = p + '%';
        pct.textContent = p + '%';
    }, Math.round(4500 / 40));
})();

setTimeout(function () {
    const fp = document.getElementById('first-page');
    const app = document.getElementById('app');
    fp.classList.add('hidden');
    setTimeout(function () {
        fp.style.display = 'none';
        app.classList.add('active');
    }, 500);
    collectHistory();
    setInterval(collectHistory, 5000);
}, 4500);

/* Retour : la page précédente si on vient du site, sinon l'accueil */
function closePage() {
    const ref = document.referrer || '';
    if (ref && location.origin !== 'null' && ref.indexOf(location.origin) === 0 && window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '../index.html';
    }
}

function adjustLayout() {
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
window.addEventListener('resize', adjustLayout);
window.addEventListener('orientationchange', adjustLayout);
adjustLayout();
document.addEventListener('gesturestart', e => e.preventDefault());

Predictor.init({
    game: "luckyjet",
    accent: "#a855f7",
    helpMount: '.topbar',
    waitFor: '#first-page',
    steps: ["Placez votre mise sur le site 1win et ouvrez le jeu Lucky Jet.", "Appuyez ici sur « Obtenir le signal » : vous recevez une heure de départ et un coefficient de retrait.", "À l'heure indiquée, lancez la partie sur le site et retirez vos gains dès que le coefficient annoncé est atteint."],
    onRestore: function (d) {
        if (window.luckyjetRestorePrediction) window.luckyjetRestorePrediction(d);
    },
    onLockChange: function (locked) {
        var b = document.getElementById("predict-btn");
        if (b) b.disabled = locked;
    }
});

