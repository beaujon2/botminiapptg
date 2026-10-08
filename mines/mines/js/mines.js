/* mines — logique du jeu.
   Extrait de mines.html.
   Chargé après shared/protect.js et shared/predictor.js. */

    document.addEventListener('DOMContentLoaded', function() {
        // === Vibration du téléphone ===
        function vibrer(motif) {
            try {
                if (navigator.vibrate)
                    navigator.vibrate(motif);
            } catch (e) {}
        }

        // === Textes de l'interface (français uniquement) ===
        const textes = {
            traps: "Pièges",
            play: "Obtenir le signal",
            back: "Retour",
            confirm: "Confirmer",
            cancel: "Annuler"
        };

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const cle = el.dataset.i18n;
            if (textes[cle])
                el.textContent = textes[cle];
        }
        );

        // === MAIN GAME SCRIPT BELOW ===
        const cellsBoard = document.querySelector('.cells-board');
        if (!cellsBoard) {
            console.error('Element .cells-board not found.');
            return;
        }

        const trapsOptions = [1, 3, 5, 7];
        const trapsToCellsOpenMapping = {
            1: 16,
            3: 6,
            5: 5,
            7: 4
        };

        let currentPresetIndex = 0;
        let currentMode = 'nesk';
        let isFirstPlay = true;

        const trapsAmountElement = document.getElementById('trapsAmount');
        const prevPresetBtn = document.getElementById('prev_preset_btn');
        const nextPresetBtn = document.getElementById('next_preset_btn');
        const modeButton = document.getElementById('modeButton');
        const playButton = document.getElementById('playButton');

        function updateTrapsAmount() {
            if (trapsAmountElement)
                trapsAmountElement.textContent = trapsOptions[currentPresetIndex];
        }

        updateTrapsAmount();

        if (prevPresetBtn) {
            prevPresetBtn.addEventListener('click', () => {
                if (currentPresetIndex > 0) {
                    currentPresetIndex--;
                    updateTrapsAmount();
                    vibrer(10);
                }
            }
            );
        }

        if (nextPresetBtn) {
            nextPresetBtn.addEventListener('click', () => {
                if (currentPresetIndex < trapsOptions.length - 1) {
                    currentPresetIndex++;
                    updateTrapsAmount();
                    vibrer(10);
                }
            }
            );
        }

        if (modeButton) {
            modeButton.addEventListener('click', () => {
                currentMode = currentMode === 'nesk' ? 'all' : 'nesk';
                modeButton.textContent = currentMode === 'nesk' ? 'Switch to All' : 'Switch to Multiple';
            }
            );
        }

        function attachCellClickListeners() {
            const cells = document.querySelectorAll('.cells-board .cell');
            cells.forEach(cell => {
                cell.addEventListener('click', () => {
                    cell.style.transform = 'scale(0.7)';
                    setTimeout( () => {
                        cell.style.transform = 'scale(1)';
                    }
                    , 200);
                }
                );
            }
            );
        }

        function getRandomUniqueIndices(count, max) {
            const indices = new Set();
            while (indices.size < count) {
                indices.add(Math.floor(Math.random() * max));
            }
            return Array.from(indices);
        }

        /* Réaffiche une prédiction déjà donnée (après actualisation de
           la page) : instantané, sans animation ni vibration. */
        window.minesRestorePrediction = function(data) {
            if (!data || !Array.isArray(data.indices))
                return;

            // on remet le plateau à neuf avant de replacer les étoiles
            generateCells();

            const cells = document.querySelectorAll('.cells-board .cell');
            data.indices.forEach(i => {
                const cell = cells[i];
                if (!cell)
                    return;
                cell.innerHTML = '';
                const img = document.createElement('img');
                img.src = 'img/star.svg';
                img.style.cssText = 'width:85%;height:85%;object-fit:contain;';
                cell.appendChild(img);
            });

            // on rétablit aussi le nombre de pièges choisi
            const idx = trapsOptions.indexOf(data.traps);
            if (idx !== -1) {
                currentPresetIndex = idx;
                updateTrapsAmount();
            }

            // le plateau porte déjà une prédiction : la prochaine
            // partie doit le réinitialiser
            isFirstPlay = false;
        }
        ;

        async function revealCells(indices) {
            const cells = document.querySelectorAll('.cells-board .cell');
            for (let i = 0; i < indices.length; i++) {
                const cell = cells[indices[i]];
                cell.classList.add('cell-fade-out');
                await new Promise(res => setTimeout(res, 300));
                cell.innerHTML = '';

                try {
                    const response = await fetch('img/star.svg');
                    if (!response.ok)
                        throw new Error('star.svg introuvable');
                    const svgText = await response.text();
                    if (svgText.indexOf('<svg') === -1)
                        throw new Error('star.svg invalide');
                    const container = document.createElement('div');
                    container.className = 'star-holder';
                    container.innerHTML = svgText;
                    cell.appendChild(container);
                    const svgElement = container.querySelector('svg');
                    if (svgElement) {
                        // sans viewBox, un SVG n'a pas de taille
                        // intrinsèque exploitable -> on le garantit
                        if (!svgElement.getAttribute('viewBox'))
                            svgElement.setAttribute('viewBox', '0 0 56 56');
                        svgElement.style.cssText = `
    width: 85%;
    height: 85%;
    opacity: 0;
    transform: scale(0);
    transition: opacity 0.3s, transform 0.3s;
  `;
                        requestAnimationFrame( () => {
                            svgElement.style.opacity = '1';
                            svgElement.style.transform = 'scale(1)';
                        }
                        );
                    }
                } catch {
                    const img = document.createElement('img');
                    img.src = 'img/star.svg';
                    img.style.cssText = `
  width: 85%;
  height: 85%;
  object-fit: contain;
  opacity: 0;
  transform: scale(0);
  transition: opacity 0.3s, transform 0.3s;
`;
                    cell.appendChild(img);
                    requestAnimationFrame( () => {
                        img.style.opacity = '1';
                        img.style.transform = 'scale(1)';
                    }
                    );
                }

                // Une vibration à chaque étoile qui apparaît
                vibrer(40);

                cell.classList.remove('cell-fade-out');
                await new Promise(res => setTimeout(res, 500));
            }
        }

        function generateCells() {
            const cellImages = ['img/cell-01.svg', 'img/cell-02.svg', 'img/cell-03.svg', 'img/cell-04.svg', 'img/cell-05.svg', 'img/cell-06.svg', 'img/cell-07.svg', 'img/cell-08.svg', 'img/cell-09.svg', 'img/cell-10.svg', 'img/cell-11.svg', 'img/cell-12.svg', 'img/cell-13.svg', 'img/cell-14.svg', 'img/cell-15.svg', 'img/cell-16.svg', 'img/cell-17.svg', 'img/cell-18.svg', 'img/cell-19.svg', 'img/cell-20.svg', 'img/cell-21.svg', 'img/cell-22.svg', 'img/cell-23.svg', 'img/cell-24.svg', 'img/cell-25.svg'];

            cellsBoard.innerHTML = '';
            cellImages.forEach(imageSrc => {
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'cell';
                cell.innerHTML = `<img width="56" height="56" src="${imageSrc}">`;
                cellsBoard.appendChild(cell);
            }
            );

            attachCellClickListeners();
        }

        function resetBoard() {
            cellsBoard.innerHTML = '';
            generateCells();
            isFirstPlay = true;
        }

        if (playButton) {
            playButton.addEventListener('click', async function() {
                // Pause conseillée en cours, ou question précédente
                // restée sans réponse : on ne lance pas de prédiction.
                if (window.Predictor && !window.Predictor.gate())
                    return;

                playButton.disabled = true;
                vibrer(15);

                if (!isFirstPlay) {
                    resetBoard();
                }

                const cells = document.querySelectorAll('.cells-board .cell');
                const totalCells = cells.length;
                const trapsAmount = parseInt(trapsAmountElement.textContent);
                const openCount = trapsToCellsOpenMapping[trapsAmount] || 5;

                const indices = getRandomUniqueIndices(openCount, totalCells);
                await revealCells(indices);

                // Vibration finale : signal complet
                vibrer([0, 70, 70, 120]);

                playButton.disabled = false;
                isFirstPlay = false;

                if (window.Predictor) {
                    window.Predictor.predictionMade(
                        openCount + ' cases sûres — ' + trapsAmount + ' piège'
                        + (trapsAmount > 1 ? 's' : ''),
                        // gardé pour réafficher la grille après une actualisation
                        {
                            indices: indices,
                            traps: trapsAmount
                        });
                }
            });
        }

        generateCells();
    });

/* Retour : la page précédente si on vient du site, sinon l'accueil */
function closePage() {
    var ref = document.referrer || '';
    if (ref && location.origin !== 'null' && ref.indexOf(location.origin) === 0 && window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '../index.html';
    }
}

/* ===================== CHARGEMENT ===================== */
(function() {
    var p = 1;
    var bar = document.getElementById('loader-bar-fill');
    var pct = document.getElementById('loader-pct');
    var iv = setInterval(function() {
        p += Math.floor(Math.random() * 4) + 1;
        if (p >= 100) {
            p = 100;
            clearInterval(iv);
        }
        bar.style.width = p + '%';
        pct.textContent = p + '%';
    }, Math.round(4500 / 40));

    setTimeout(function() {
        var fp = document.getElementById('first-page');
        fp.classList.add('hidden');
        setTimeout(function() {
            fp.style.display = 'none';
        }, 500);
    }, 4500);
})();

Predictor.init({
    game: 'mines',
    accent: '#108de7',
    waitFor: '#first-page',
    steps: ['Placez votre mise sur le site 1win et ouvrez le jeu Mines.', 'Choisissez ici le même nombre de pièges que sur le site, puis appuyez sur « Obtenir le signal ».', 'Ouvrez sur le site les cases indiquées par les étoiles, dans le même ordre, puis encaissez.'],
    onLockChange: function(locked) {
        var btn = document.getElementById('playButton');
        if (btn)
            btn.disabled = locked;
    },
    // réaffiche la prédiction si la page a été actualisée
    // avant que le joueur ait répondu
    onRestore: function(data) {
        if (window.minesRestorePrediction)
            window.minesRestorePrediction(data);
    }
});

