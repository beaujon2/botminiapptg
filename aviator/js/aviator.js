/* aviator — logique du jeu.
   Extrait de aviator.html.
   Chargé après shared/protect.js et shared/predictor.js. */

/* ===================== CONFIG ===================== */
const COOLDOWN = 120;   // blocage 2 minutes
const ANALYSE_MS = 2500; // durée de l'animation d'analyse

const API_TOKEN = "b6705c907a83ad9b76c1ba570bc28eab956e22df71dfca96fd5dc5d06f84cfaf33f4a72d51a600d23cd210d72b621c13b35fa9c8d288c8ae497773d27aed4445711cad084dfd8dbb51b45c8adf6a497ce1c304c39571fbf8c95d191526f234385e1e1818ecfe8fb588606790619e02bfcf5e700ac2acf2cf48a3ad4d99c89e2e44a43518f2856dd102774577fbe01d0034b3cd60ad0b57d63fca90b1b7e6f6d3b4b8785994759e909b28532e095fd60f7e209688763ba4ffb2.9f8bf20bd7133274cda5ed14d6aae856.077dee8d-c923-4c02-9bee-757573662e69";

/* ===================== OUTILS ===================== */
const pad = n => String(n).padStart(2, '0');
const fmtHm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const fmtCount = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);

function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { }
}

function showMessage(msg) {
    const t = document.getElementById('message-table');
    document.getElementById('message-text').textContent = msg;
    t.classList.add('active');
    clearTimeout(showMessage._t);
    showMessage._t = setTimeout(() => t.classList.remove('active'), 3000);
}

function getUserTimeZone() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const map = {
        "Asia/Calcutta": "Asia/Kolkata", "US/Eastern": "America/New_York",
        "US/Central": "America/Chicago", "US/Mountain": "America/Denver",
        "US/Pacific": "America/Los_Angeles", "Europe/Kiev": "Europe/Kyiv"
    };
    return map[tz] || tz;
}

/* Repli local si l'API ne répond pas : un seul coefficient */
function fallbackCoeff() {
    const r = Math.random();
    const c = r < 0.85
        ? Math.random() * (2.58 - 2.10) + 2.10
        : Math.random() * (3.00 - 2.59) + 2.59;
    return { coeff: c.toFixed(2), chance: Math.floor(Math.random() * 5) + 94 };
}

/* ===================== API ===================== */
async function fetchPrediction() {
    const timezone = getUserTimeZone();
    const off = -new Date().getTimezoneOffset();
    const offset = (off >= 0 ? "+" : "-") + pad(Math.floor(Math.abs(off) / 60)) + ":" + pad(Math.abs(off) % 60);

    const url = `aviator.php?b=${API_TOKEN}&language=en&pid=1win&pik=01961b0c-84c8-7d20-a319-48c736b3b49d&t=${encodeURIComponent(timezone)}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API HTTP ' + res.status);
    const data = await res.json();

    const coeff = parseFloat(data?.manual_prediction?.coeff);
    if (!Number.isFinite(coeff)) throw new Error('Payload invalide');

    const conf = Number(data?.manual_prediction?.confidence);
    let hour = null;
    if (data.time_window) {
        const first = String(data.time_window).trim().split(/\s*[-–—]\s*/)[0].trim();
        if (/^\d{1,2}:\d{2}/.test(first)) hour = first;
    }
    return {
        coeff: coeff.toFixed(2),
        chance: Math.max(90, Number.isFinite(conf) ? conf : 90),
        hour
    };
}

/* ===================== UI ===================== */
const btn = document.getElementById('signal-btn');
const label = document.getElementById('signal-label');
const cool = document.getElementById('btn-cool');
const hint = document.getElementById('hint');
const orb = document.getElementById('orb');
const coefEl = document.getElementById('coefficient');
const timeEl = document.getElementById('play-time');
const chanceEl = document.getElementById('chance');
const chipTime = document.getElementById('chip-time');
const chipChance = document.getElementById('chip-chance');
const statusEl = document.getElementById('status');
let locked = false;

function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

function startCooldown(hourText, leftOverride) {
    locked = true;
    btn.disabled = true;
    // reprise après actualisation : on repart du temps restant
    let left = (typeof leftOverride === 'number' && leftOverride > 0)
        ? Math.min(leftOverride, COOLDOWN)
        : COOLDOWN;
    const tick = () => {
        label.textContent = 'PROCHAINE PRÉDICTION ' + fmtCount(left);
        cool.style.width = ((COOLDOWN - left) / COOLDOWN * 100) + '%';
        hint.textContent = 'SIGNAL VALIDE POUR ' + hourText + ' — PATIENTEZ';
        if (left <= 0) {
            clearInterval(iv);
            locked = false;
            btn.disabled = false;
            cool.style.width = '0%';
            label.textContent = 'NOUVELLE PRÉDICTION';
            hint.textContent = 'APPUYEZ POUR OBTENIR VOTRE SIGNAL';
            setStatus('PRÊT POUR UN NOUVEAU SIGNAL', 'ok');
            showMessage('Vous pouvez demander une nouvelle prédiction ✅');
            vibrate([40, 80, 40]);
            return;
        }
        left--;
    };
    tick();
    const iv = setInterval(tick, 1000);
}

async function newSignal() {
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
    setStatus('ANALYSE DES DONNÉES EN COURS', 'run');
    chipTime.classList.remove('on');
    chipChance.classList.remove('on');

    let p;
    try {
        p = await fetchPrediction();
    } catch (e) {
        console.warn('API indisponible → repli local', e);
        p = fallbackCoeff();
    }

    await new Promise(r => setTimeout(r, ANALYSE_MS));

    // heure de jeu : celle de l'API si elle existe, sinon maintenant + 2 min
    const hourText = p.hour || fmtHm(new Date(Date.now() + COOLDOWN * 1000));

    orb.classList.remove('pending');
    coefEl.classList.remove('idle');
    coefEl.textContent = p.coeff + 'x';
    timeEl.textContent = hourText;
    chanceEl.textContent = p.chance + '%';
    chipTime.classList.add('on');
    chipChance.classList.add('on');
    setStatus('SIGNAL ACTIF — JOUEZ À ' + hourText, 'ok');
    showMessage('Signal généré — jouez à ' + hourText);
    vibrate([70, 50, 70, 50, 160]);

    if (window.Predictor) window.Predictor.predictionMade(
        'Jouez à ' + hourText + ' — ' + p.coeff + 'x',
        { coeff: p.coeff + 'x', time: hourText, chance: p.chance + '%',
                  endsAt: Date.now() + COOLDOWN * 1000 });

    startCooldown(hourText);
}

/* Réaffiche la prédiction après une actualisation de la page. */
window.aviatorRestorePrediction = function (d) {
    if (!d) return;
    orb.classList.remove('pending');
    coefEl.classList.remove('idle');
    if (d.coeff) coefEl.textContent = d.coeff;
    if (d.time) timeEl.textContent = d.time;
    if (d.chance) chanceEl.textContent = d.chance;
    chipTime.classList.add('on');
    chipChance.classList.add('on');
    label.textContent = 'DERNIER SIGNAL';
    hint.textContent = 'PRÉDICTION RESTAURÉE';
    if (typeof setStatus === 'function') setStatus('SIGNAL RESTAURÉ — JOUEZ À ' + (d.time || ''), 'ok');

    // le refroidissement reprend exactement là où il en était
    var left = d.endsAt ? Math.ceil((d.endsAt - Date.now()) / 1000) : 0;
    if (left > 0) startCooldown(d.time || '', left);
};

btn.addEventListener('click', newSignal);
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
    game: "aviator",
    accent: "#e50539",
    helpMount: '.topbar',
    waitFor: '#first-page',
    steps: ["Placez votre mise sur le site 1win et ouvrez le jeu Aviator.", "Appuyez ici sur « Obtenir le signal » : vous recevez une heure de départ et un coefficient de retrait.", "À l'heure indiquée, lancez la partie sur le site et retirez vos gains dès que le coefficient annoncé est atteint."],
    onRestore: function (d) {
        if (window.aviatorRestorePrediction) window.aviatorRestorePrediction(d);
    },
    onLockChange: function (locked) {
        var b = document.getElementById("signal-btn");
        if (b) b.disabled = locked;
    }
});

