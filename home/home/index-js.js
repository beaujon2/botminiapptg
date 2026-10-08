/* PREDICTOR HUB — script de la page d accueil. Extrait de index.html.
   Le blocage du pincement est dans shared/protect.js. */

// vibration au clic sur une carte
document.querySelectorAll('.card').forEach(function (c) {
    c.addEventListener('click', function () {
        try { if (navigator.vibrate) navigator.vibrate(35); } catch (e) { }
    });
});

function adjustLayout() {
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
window.addEventListener('resize', adjustLayout);
window.addEventListener('orientationchange', adjustLayout);
adjustLayout();
