/* =========================================================
   Gêne l'inspection de la page.

   IMPORTANT — à lire avant de compter sur ce fichier :
   ce n'est qu'une GÊNE, pas une protection. Tout ce qui arrive dans le
   navigateur (HTML, CSS, JS, images) est forcément lisible par le visiteur.
   N'importe qui peut encore :
     - ouvrir les outils de développement par le menu du navigateur,
     - désactiver le JavaScript,
     - lire "view-source:" ou télécharger les fichiers directement,
     - passer par le cache ou un proxy.
   Donc : ne mettez jamais de secret (clé d'API, mot de passe, formule
   confidentielle) dans ces pages. Ce qui doit rester secret doit vivre
   sur le serveur, pas ici.

   Ce fichier bloque simplement les gestes les plus courants :
     - clic droit / appui long (menu contextuel)
     - F12
     - Ctrl/Cmd + Shift + I / J / C / E   (outils de dev)
     - Ctrl/Cmd + U                        (code source)
     - Ctrl/Cmd + S                        (enregistrer la page)
     - glisser-déposer des images
   ========================================================= */

(function () {
    'use strict';

    /* --- Clic droit et appui long --- */
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    }, { capture: true });

    /* --- Raccourcis clavier --- */
    document.addEventListener('keydown', function (e) {
        var k = (e.key || '').toLowerCase();
        var ctrl = e.ctrlKey || e.metaKey;

        var blocked =
            k === 'f12'
            // outils de développement
            || (ctrl && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'e' || k === 'k'))
            // équivalent macOS : Cmd + Alt + I / J / C
            || (e.metaKey && e.altKey && (k === 'i' || k === 'j' || k === 'c'))
            // code source et enregistrement de la page
            || (ctrl && !e.shiftKey && (k === 'u' || k === 's'));

        if (blocked) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, { capture: true });

    /* --- Glisser-déposer des images (récupération des visuels) --- */
    document.addEventListener('dragstart', function (e) {
        if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    }, { capture: true });

    /* --- Zoom par pincement sur iOS (garde la mise en page intacte) --- */
    document.addEventListener('gesturestart', function (e) {
        e.preventDefault();
    });
})();
