/* =========================================================
   Système commun aux 4 prédicteurs (Aviator, LuckyJet, Meta, Mines).
   Reprend les règles mises en place sur le prédicteur Barron :

   - bouton "? Comment jouer" : comment jouer + jeu responsable + derniers travaux
   - après prédiction: question "avez-vous gagné ?" (Oui / Non)
   - limite          : 5 pertes en moins de 2 heures -> pause de 12 h
   - stockage        : localStorage, propre à chaque jeu, survit au
                       rafraîchissement et aux coupures de connexion

   Utilisation dans un jeu :

     Predictor.init({
         game: 'mines',
         accent: '#108de7',
         steps: ['...', '...'],
         helpMount: '.topbar',     // facultatif
         helpLabel: 'Comment jouer',// facultatif : texte à côté du "?"
         waitFor: '#first-page',   // facultatif : attend la fin du chargement
         onLockChange: function (locked) { ... }
     });

     if (!Predictor.gate()) return;              // avant de prédire
     Predictor.predictionMade('Jouez à 14:32');  // après avoir affiché la prédiction
   ========================================================= */

(function (global) {
    'use strict';

    var ONE_HOUR = 2 * 60 * 60 * 1000;
    var LOCK_MS = 6 * ONE_HOUR;
    var LOSS_LIMIT = 5;
    var HISTORY_MAX = 20;

    var WARNING_TEXT =
        "Ce prédicteur vous aide à jouer, mais aucune prédiction n'est fiable à 100 %. "
        + "Jouez avec une petite mise, celle que vous pouvez vous permettre de perdre. "
        + "Si vos gains dépassent 2 ou 3 fois votre mise de départ, arrêtez-vous et retirez-les. "
        + "Ne cherchez pas à gagner toujours plus.";

    var cfg = {
        game: 'jeu',
        accent: '#3b82f6',
        steps: [],
        helpMount: null,
        helpLabel: 'Comment jouer',
        waitFor: null,
        onLockChange: null,
        onRestore: null
    };

    var el = {};
    var askTimer = null;
    var lockTimer = null;
    var toastTimer = null;
    var locked = false;

    /* ------------------ Stockage ------------------ */

    function storeKey() {
        return 'pr_' + cfg.game + '_v1';
    }

    function load() {
        try {
            return JSON.parse(localStorage.getItem(storeKey())) || {};
        } catch (e) {
            return {};
        }
    }

    function save(state) {
        try {
            localStorage.setItem(storeKey(), JSON.stringify(state));
        } catch (e) {
            /* stockage indisponible (navigation privée) : on continue sans persistance */
        }
    }

    /* ------------------ Utilitaires ------------------ */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatDuration(ms) {
        var total = Math.max(0, Math.floor(ms / 1000));
        return pad2(Math.floor(total / 3600)) + ':'
            + pad2(Math.floor((total % 3600) / 60)) + ':'
            + pad2(total % 60);
    }

    function formatClock(ts) {
        var d = new Date(ts);
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function buzz(pattern) {
        try {
            if (navigator.vibrate) navigator.vibrate(pattern);
        } catch (e) {}
    }

    /* ------------------ Construction de l'interface ------------------ */

    function buildUI() {
        var steps = cfg.steps.map(function (s) {
            return '<li>' + esc(s) + '</li>';
        }).join('');

        var host = document.createElement('div');
        host.id = 'pr-root';
        host.innerHTML =
            '<div class="pr-toast" id="pr-toast"></div>'

            /* Comment jouer + jeu responsable + derniers travaux */
            + '<div class="pr-overlay" id="pr-rules">'
            + '  <div class="pr-card">'
            + '    <button class="pr-close" type="button" data-pr-close="pr-rules" aria-label="Fermer">✕</button>'
            + '    <p class="pr-title">Comment jouer</p>'
            + '    <ol class="pr-steps">' + steps + '</ol>'
            + '    <p class="pr-warning">' + WARNING_TEXT + '</p>'
            + '    <p class="pr-history-title">Derniers travaux</p>'
            + '    <div id="pr-history-zone"></div>'
            + '  </div>'
            + '</div>'

            /* Question posée après chaque prédiction */
            + '<div class="pr-overlay" id="pr-win">'
            + '  <div class="pr-card">'
            + '    <button class="pr-close" type="button" data-pr-close="pr-win" aria-label="Fermer">✕</button>'
            + '    <p class="pr-text" id="pr-win-text"></p>'
            + '    <div class="pr-actions" id="pr-win-actions">'
            + '      <button class="pr-btn pr-btn-yes" type="button" id="pr-yes">Oui</button>'
            + '      <button class="pr-btn pr-btn-no" type="button" id="pr-no">Non</button>'
            + '    </div>'
            + '  </div>'
            + '</div>'

            /* Pause conseillée */
            + '<div class="pr-overlay" id="pr-lock">'
            + '  <div class="pr-card">'
            + '    <p class="pr-text">🛑 Pause conseillée</p>'
            + '    <p class="pr-warning">Vous avez atteint ' + LOSS_LIMIT + ' prédictions perdantes en moins'
            + '      de 2 heures. Je vous conseille d\'arrêter de jouer pour aujourd\'hui : retirez ce'
            + '      qu\'il vous reste sur votre compte et faites une pause (mangez, changez-vous les idées...).</p>'
            + '    <p class="pr-warning" style="margin-top:14px">Vous pourrez rejouer dans :</p>'
            + '    <p class="pr-countdown" id="pr-countdown">' + formatDuration(LOCK_MS) + '</p>'
            + '  </div>'
            + '</div>';

        document.body.appendChild(host);

        el.toast = document.getElementById('pr-toast');
        el.rules = document.getElementById('pr-rules');
        el.win = document.getElementById('pr-win');
        el.winText = document.getElementById('pr-win-text');
        el.winActions = document.getElementById('pr-win-actions');
        el.lock = document.getElementById('pr-lock');
        el.countdown = document.getElementById('pr-countdown');
        el.historyZone = document.getElementById('pr-history-zone');

        /* Bouton "? Comment jouer" : dans la barre du haut si elle existe,
           sinon flottant en haut à droite */
        var help = document.createElement('button');
        help.type = 'button';
        help.className = 'pr-help';
        help.id = 'pr-help';
        help.setAttribute('aria-label', cfg.helpLabel);
        help.innerHTML =
            '<span class="pr-help-icon" aria-hidden="true">?</span>'
            + '<span class="pr-help-text">' + esc(cfg.helpLabel) + '</span>';
        var mount = cfg.helpMount ? document.querySelector(cfg.helpMount) : null;
        if (mount) {
            mount.appendChild(help);
        } else {
            help.classList.add('pr-help-floating');
            document.body.appendChild(help);
        }
        el.help = help;

        /* Écouteurs */
        help.addEventListener('click', function () {
            buzz(12);
            openRules();
        });
        host.querySelectorAll('[data-pr-close]').forEach(function (b) {
            b.addEventListener('click', function () {
                hide(document.getElementById(b.getAttribute('data-pr-close')));
                if (b.getAttribute('data-pr-close') === 'pr-win') clearTimeout(askTimer);
            });
        });
        document.getElementById('pr-yes').addEventListener('click', function () { answer(true); });
        document.getElementById('pr-no').addEventListener('click', function () { answer(false); });
    }

    function show(node) {
        if (node) node.classList.add('pr-show');
    }

    function hide(node) {
        if (node) node.classList.remove('pr-show');
    }

    /* ------------------ Règles + historique ------------------ */

    function renderHistory() {
        var state = load();
        var list = state.history || [];
        var wins = 0, losses = 0;
        list.forEach(function (h) {
            if (h.won === true) wins++;
            else if (h.won === false) losses++;
        });

        if (!list.length) {
            el.historyZone.innerHTML =
                '<p class="pr-history-empty">Aucune prédiction enregistrée pour le moment.</p>';
            return;
        }

        var items = list.slice().reverse().map(function (h) {
            var icon = h.won === true ? '✅' : (h.won === false ? '❌' : '⏳');
            return '<li>'
                + '<span class="pr-h-icon">' + icon + '</span>'
                + '<span class="pr-h-label">' + esc(h.label || 'Prédiction') + '</span>'
                + '<span class="pr-h-time">' + formatClock(h.at) + '</span>'
                + '</li>';
        }).join('');

        el.historyZone.innerHTML =
            '<ul class="pr-history">' + items + '</ul>'
            + '<div class="pr-stats">'
            + '  <div class="pr-stat"><b>' + list.length + '</b><span>TOTAL</span></div>'
            + '  <div class="pr-stat"><b>' + wins + '</b><span>GAGNÉES</span></div>'
            + '  <div class="pr-stat"><b>' + losses + '</b><span>PERDUES</span></div>'
            + '</div>';
    }

    function openRules() {
        renderHistory();
        show(el.rules);
    }

    /* ------------------ Toast ------------------ */

    function toast(message, duration) {
        el.toast.textContent = message;
        show(el.toast);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { hide(el.toast); }, duration || 1800);
    }

    /* ------------------ Question "avez-vous gagné ?" ------------------ */

    function askWin() {
        clearTimeout(askTimer);
        var state = load();
        var label = state.pending && state.pending.label ? state.pending.label : '';
        el.winText.innerHTML =
            'Lorsque vous avez joué avec cette prédiction,<br>avez-vous gagné ?'
            + (label ? '<span class="pr-sub">' + esc(label) + '</span>' : '');
        el.winActions.style.display = 'flex';
        show(el.win);
        buzz([0, 40, 60, 40]);
    }

    function closeWin() {
        clearTimeout(askTimer);
        hide(el.win);
    }

    function answer(won) {
        clearTimeout(askTimer);
        el.winActions.style.display = 'none';

        var state = load();
        if (state.pending) state.pending.answered = true;

        /* On reporte la réponse sur la dernière ligne d'historique */
        if (state.history && state.history.length) {
            state.history[state.history.length - 1].won = won;
        }

        if (won) {
            el.winText.innerHTML = '🎉 Bravo, félicitations !'
                + '<span class="pr-sub">Ne sois pas trop gourmand : si tes gains dépassent'
                + ' largement ta mise de départ, retire-les tout de suite et fais une pause'
                + ' en attendant la prochaine fois.</span>';
            save(state);
            askTimer = setTimeout(closeWin, 5000);
            return;
        }

        el.winText.innerHTML = '😔 Désolé…'
            + '<span class="pr-sub">Pas de chance cette fois.</span>';

        var now = Date.now();
        state.losses = (state.losses || []).filter(function (t) { return now - t < ONE_HOUR; });
        state.losses.push(now);

        if (state.losses.length >= LOSS_LIMIT) {
            state.lockUntil = now + LOCK_MS;
            save(state);
            askTimer = setTimeout(function () {
                closeWin();
                showLock(state.lockUntil);
            }, 5000);
            return;
        }

        save(state);
        askTimer = setTimeout(closeWin, 5000);
    }

    /* ------------------ Pause conseillée ------------------ */

    function setLocked(value) {
        locked = value;
        if (typeof cfg.onLockChange === 'function') {
            try {
                cfg.onLockChange(value);
            } catch (e) {}
        }
    }

    function showLock(until) {
        setLocked(true);
        closeWin();
        hide(el.rules);
        show(el.lock);

        clearInterval(lockTimer);

        function tick() {
            var remain = until - Date.now();
            if (remain <= 0) {
                clearInterval(lockTimer);
                hide(el.lock);
                var s = load();
                s.lockUntil = null;
                s.losses = [];
                save(s);
                setLocked(false);
                return;
            }
            el.countdown.textContent = formatDuration(remain);
        }

        tick();
        lockTimer = setInterval(tick, 1000);
    }

    /* ------------------ Attente de la fin du chargement ------------------ */

    function whenReady(fn) {
        var node = cfg.waitFor ? document.querySelector(cfg.waitFor) : null;
        if (!node) {
            fn();
            return;
        }
        var done = false;
        function finish() {
            if (done) return;
            done = true;
            clearInterval(iv);
            fn();
        }
        var iv = setInterval(function () {
            if (!node.parentNode
                || node.classList.contains('hidden')
                || getComputedStyle(node).display === 'none'
                || parseFloat(getComputedStyle(node).opacity) === 0) {
                finish();
            }
        }, 200);
        setTimeout(finish, 15000); // filet de sécurité
    }

    /* ------------------ API publique ------------------ */

    var Predictor = {

        init: function (options) {
            options = options || {};
            for (var k in options) {
                if (Object.prototype.hasOwnProperty.call(options, k)) cfg[k] = options[k];
            }

            document.documentElement.style.setProperty('--pr-accent', cfg.accent);
            buildUI();

            var state = load();
            var now = Date.now();

            /* Pause en cours : priorité absolue */
            if (state.lockUntil && state.lockUntil > now) {
                whenReady(function () { showLock(state.lockUntil); });
                return;
            }
            if (state.lockUntil) {
                state.lockUntil = null;
                state.losses = [];
                save(state);
            }

            /* Une question restée sans réponse (page fermée / rafraîchie) */
            var hasPending = !!(state.pending && !state.pending.answered);

            whenReady(function () {
                if (!hasPending) return;

                /* La prédiction n'avait pas encore de réponse : on la
                   réaffiche à l'identique avant de reposer la question. */
                if (typeof cfg.onRestore === 'function') {
                    try {
                        cfg.onRestore(state.pending.data);
                    } catch (e) {
                        console.warn('onRestore a échoué', e);
                    }
                }

                askWin();
            });

            state.lastVisit = now;
            save(state);
        },

        /* À appeler avant de lancer une prédiction.
           Renvoie false (et prévient le joueur) si le jeu doit être bloqué. */
        gate: function () {
            var state = load();

            if (state.lockUntil && state.lockUntil > Date.now()) {
                showLock(state.lockUntil);
                return false;
            }

            if (state.pending && !state.pending.answered) {
                toast("Veuillez d'abord répondre à la question précédente");
                clearTimeout(askTimer);
                askTimer = setTimeout(askWin, 1200);
                return false;
            }

            return true;
        },

        /* À appeler juste après avoir affiché la prédiction au joueur.
           `data` (facultatif) est rendu tel quel à onRestore après un
           rafraîchissement, pour pouvoir réafficher la prédiction. */
        predictionMade: function (label, data) {
            var state = load();
            var now = Date.now();

            state.pending = {
                label: label || '',
                at: now,
                answered: false,
                data: data === undefined ? null : data
            };
            state.history = state.history || [];
            state.history.push({ at: now, label: label || 'Prédiction', won: null });
            if (state.history.length > HISTORY_MAX) {
                state.history = state.history.slice(-HISTORY_MAX);
            }
            save(state);

            clearTimeout(askTimer);
            askTimer = setTimeout(askWin, 1600);
        },

        isLocked: function () {
            return locked;
        },

        openRules: openRules,
        toast: toast
    };

    global.Predictor = Predictor;

})(window);
