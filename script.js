document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elementit ---
    const addAttackerBtn = document.getElementById('add-attacker');
    const addDefenderBtn = document.getElementById('add-defender');
    const clearArrowsBtn = document.getElementById('clear-arrows');
    const exportJsonBtn = document.getElementById('export-json');
    const playArea = document.getElementById('play-area');
    const drawingSurface = document.getElementById('drawing-surface');
    const playersGroup = document.getElementById('players-group');
    const arrowsGroup = document.getElementById('arrows-group');
    const jsonOutput = document.getElementById('json-output');
    const viewSelectorRadios = document.querySelectorAll('input[name="court-view"]');

    // --- Sovelluksen tila ---
    let players = []; // Tallentaa pelaajien tiedot { id, type, x, y, element }
    let playerIdCounter = 0;
    let selectedPlayer = null; // Raahattava pelaajaelementti (SVG group)
    let offset = { x: 0, y: 0 };

    let isDrawing = false;
    let currentArrow = null;
    let startCoords = { x: 0, y: 0 };

    let currentView = 'full'; // Oletusnäkymä

    const PLAYER_RADIUS = 15;

    // --- Apufunktiot ---

    // Hakee hiiren/kosketuksen koordinaatit SVG-pinnan koordinaatistossa,
    // ottaen huomioon mahdollisen viewBox-muunnoksen.
    function getSVGPoint(event) {
        const svg = drawingSurface;
        let pt = svg.createSVGPoint();
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        pt.x = clientX;
        pt.y = clientY;
        const CTM = svg.getScreenCTM();
        if (CTM) {
            pt = pt.matrixTransform(CTM.inverse());
        } else {
            // Fallback, jos CTM ei saatavilla (ei pitäisi tapahtua normaalisti)
            const bounds = svg.getBoundingClientRect();
            pt.x = (clientX - bounds.left) * (svg.viewBox.baseVal.width / bounds.width);
            pt.y = (clientY - bounds.top) * (svg.viewBox.baseVal.height / bounds.height);
        }
        return pt;
    }


    // Luo SVG-pelaajaelementin (group, circle, text)
    function createPlayerElement(playerData) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', `player ${playerData.type}`);
        group.setAttribute('transform', `translate(${playerData.x}, ${playerData.y})`);
        group.dataset.id = playerData.id;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', PLAYER_RADIUS);
        circle.setAttribute('cx', 0);
        circle.setAttribute('cy', 0);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'player-text');
        text.setAttribute('x', 0);
        text.setAttribute('y', 1); // Pieni säätö keskitykseen
        text.textContent = playerData.type === 'attacker' ? 'O' : 'X';

        group.appendChild(circle);
        group.appendChild(text);

        // --- Pelaajan raahauksen event listenerit ---
        group.addEventListener('mousedown', startDrag);
        group.addEventListener('touchstart', startDrag, { passive: false });

        return group;
    }

    // Päivittää yksittäisen pelaajan sijainnin SVG:ssä
    function updatePlayerPosition(playerData) {
        const playerElement = playersGroup.querySelector(`.player[data-id='${playerData.id}']`);
        if (playerElement) {
            playerElement.setAttribute('transform', `translate(${playerData.x}, ${playerData.y})`);
        }
    }

    // Lisää pelaajan sekä dataan että SVG:hen
    function addPlayer(type) {
        // Yritä sijoittaa uusi pelaaja näkyvälle alueelle riippuen näkymästä
        const svgRect = drawingSurface.getBoundingClientRect();
        const viewBox = drawingSurface.viewBox.baseVal;
        const defaultX = viewBox.x + viewBox.width / 2; // Keskelle näkyvää aluetta
        let defaultY = viewBox.y + viewBox.height / 2;

        // Siirrä hieman, jotta eivät mene päällekäin heti
        defaultY += (players.length % 5 - 2) * (PLAYER_RADIUS * 1.5);

        const newPlayer = {
            id: playerIdCounter++,
            type: type,
            x: defaultX,
            y: defaultY,
            element: null // Elementti lisätään myöhemmin
        };

        const playerElement = createPlayerElement(newPlayer);
        newPlayer.element = playerElement; // Tallennetaan viittaus elementtiin
        players.push(newPlayer);
        playersGroup.appendChild(playerElement);
    }

    // --- Raahausfunktiot ---

    function startDrag(event) {
        event.preventDefault();
        selectedPlayer = event.currentTarget; // SVG group element
        selectedPlayer.classList.add('dragging');
        playersGroup.appendChild(selectedPlayer); // Nosta päällimmäiseksi

        const mousePos = getSVGPoint(event);
        const playerId = parseInt(selectedPlayer.dataset.id, 10);
        const playerData = players.find(p => p.id === playerId);

        if (playerData) {
            offset = {
                x: mousePos.x - playerData.x,
                y: mousePos.y - playerData.y
            };
        } else {
             console.error("Dragged player data not found!", playerId);
             endDrag(); // Peruuta raahaus jos data puuttuu
             return;
        }


        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
        document.addEventListener('mouseleave', endDrag); // Lopeta myös jos hiiri poistuu ikkunasta
    }

    function drag(event) {
        if (!selectedPlayer) return;
        event.preventDefault();

        const mousePos = getSVGPoint(event);
        const playerId = parseInt(selectedPlayer.dataset.id, 10);
        const playerData = players.find(p => p.id === playerId);

        if (playerData) {
            let newX = mousePos.x - offset.x;
            let newY = mousePos.y - offset.y;

            // Rajoitetaan pelaaja AINA KOKO kentän loogisiin rajoihin,
            // riippumatta nykyisestä viewBoxista. Käytetään SVG:n loogista kokoa (0,0) -> (width, height)
            // Oletetaan, että koko kenttä on viewBox="0 0 W H", jossa W ja H ovat svg:n mitat.
            // Käytetään clientWidth/Height varauksella, kiinteä viewBox olisi varmempi.
            const svgWidth = drawingSurface.clientWidth || 800; // Tarvittaessa kovakoodaa looginen leveys
            const svgHeight = drawingSurface.clientHeight || 426; // Tarvittaessa kovakoodaa looginen korkeus

            // Estetään pelaajaa menemästä reunojen yli (ottaen huomioon säde)
            newX = Math.max(PLAYER_RADIUS, Math.min(svgWidth - PLAYER_RADIUS, newX));
            newY = Math.max(PLAYER_RADIUS, Math.min(svgHeight - PLAYER_RADIUS, newY));

            playerData.x = newX;
            playerData.y = newY;

            // Päivitetään suoraan elementin transform-attribuuttia raahauksen aikana
            selectedPlayer.setAttribute('transform', `translate(${playerData.x}, ${playerData.y})`);
        }
    }

    function endDrag(event) {
        if (selectedPlayer) {
            selectedPlayer.classList.remove('dragging');
            // Datan päivitys tehtiin jo drag-funktiossa
            selectedPlayer = null;
        }

        document.removeEventListener('mousemove', drag);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchend', endDrag);
        document.removeEventListener('mouseleave', endDrag);
    }

    // --- Nuolien piirtofunktiot ---

    function startDrawArrow(event) {
        // Älä aloita piirtoa, jos klikattiin pelaajaa tai kontrollia
        if (event.target.closest('.player') || event.target.closest('#controls')) {
            return;
        }
        // Varmista, että event on SVG-alueelta
        if (event.target !== drawingSurface && !event.target.closest('svg')) {
            return;
        }

        event.preventDefault(); // Estää tekstin valintaa yms.
        isDrawing = true;
        startCoords = getSVGPoint(event);

        currentArrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        currentArrow.setAttribute('x1', startCoords.x);
        currentArrow.setAttribute('y1', startCoords.y);
        currentArrow.setAttribute('x2', startCoords.x);
        currentArrow.setAttribute('y2', startCoords.y);
        currentArrow.setAttribute('class', 'arrow');

        arrowsGroup.appendChild(currentArrow);

        drawingSurface.addEventListener('mousemove', drawArrow);
        drawingSurface.addEventListener('touchmove', drawArrow, { passive: false });
        drawingSurface.addEventListener('mouseup', endDrawArrow);
        drawingSurface.addEventListener('touchend', endDrawArrow);
        drawingSurface.addEventListener('mouseleave', cancelDrawArrow); // Jos hiiri poistuu SVG:stä
    }

    function drawArrow(event) {
        if (!isDrawing || !currentArrow) return;
        event.preventDefault();
        const currentCoords = getSVGPoint(event);
        currentArrow.setAttribute('x2', currentCoords.x);
        currentArrow.setAttribute('y2', currentCoords.y);
    }

    function endDrawArrow(event) {
        if (!isDrawing) return;
        isDrawing = false;

        if (currentArrow) {
            const x1 = parseFloat(currentArrow.getAttribute('x1'));
            const y1 = parseFloat(currentArrow.getAttribute('y1'));
            const x2 = parseFloat(currentArrow.getAttribute('x2'));
            const y2 = parseFloat(currentArrow.getAttribute('y2'));
            const lengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;

            // Poista nuoli, jos se on vain piste (liian lyhyt)
            if (lengthSq < 25) { // Esim. alle 5px pituus
                 if (currentArrow.parentNode) {
                    currentArrow.parentNode.removeChild(currentArrow);
                 }
            }
            // Tulevaisuudessa: Lisää valmis nuoli 'arrows'-taulukkoon tässä
        }

        currentArrow = null;

        drawingSurface.removeEventListener('mousemove', drawArrow);
        drawingSurface.removeEventListener('touchmove', drawArrow);
        drawingSurface.removeEventListener('mouseup', endDrawArrow);
        drawingSurface.removeEventListener('touchend', endDrawArrow);
        drawingSurface.removeEventListener('mouseleave', cancelDrawArrow);
    }

     function cancelDrawArrow(event) {
         if (isDrawing && currentArrow) {
             // Varmistetaan, että poistutaan SVG-alueelta, ei lapsielementistä
             if (event.target === drawingSurface || event.relatedTarget === null || !drawingSurface.contains(event.relatedTarget)) {
                 if (currentArrow.parentNode) {
                     currentArrow.parentNode.removeChild(currentArrow);
                 }
                 isDrawing = false;
                 currentArrow = null;
                 // Poistetaan kuuntelijat varmuuden vuoksi
                 drawingSurface.removeEventListener('mousemove', drawArrow);
                 drawingSurface.removeEventListener('touchmove', drawArrow);
                 drawingSurface.removeEventListener('mouseup', endDrawArrow);
                 drawingSurface.removeEventListener('touchend', endDrawArrow);
                 drawingSurface.removeEventListener('mouseleave', cancelDrawArrow);
             }
         }
    }

    // --- Muut toiminnot ---

    function clearAllArrows() {
        arrowsGroup.innerHTML = '';
        // Tulevaisuudessa: Tyhjennä myös 'arrows'-taulukko
    }

    function exportDataToJson() {
        // Kerätään myös nuolien tiedot (jos ne tallennettaisiin)
        // Tässä esimerkissä viedään vain pelaajat ja näkymä
        const exportablePlayers = players.map(p => ({
            id: p.id,
            type: p.type,
            x: parseFloat(p.x.toFixed(2)),
            y: parseFloat(p.y.toFixed(2))
        }));

        // Tulevaisuudessa: Kerää nuolien tiedot arrowsGroupin lapsista
        const exportableArrows = Array.from(arrowsGroup.children).map(line => ({
             x1: parseFloat(line.getAttribute('x1')).toFixed(2),
             y1: parseFloat(line.getAttribute('y1')).toFixed(2),
             x2: parseFloat(line.getAttribute('x2')).toFixed(2),
             y2: parseFloat(line.getAttribute('y2')).toFixed(2)
        }));


        const exportData = {
            view: currentView,
            players: exportablePlayers,
            arrows: exportableArrows // Lisätty nuolien vienti
        };

        const jsonString = JSON.stringify(exportData, null, 2); // null, 2 tekee siistin tulostuksen
        jsonOutput.textContent = jsonString;
    }

    // --- Näkymän vaihto ---
    function updateView(viewType) {
        currentView = viewType;
        console.log("Vaihdetaan näkymään:", currentView);

        // 1. Päivitä CSS-luokka taustakuvan vaihtamiseksi
        playArea.classList.remove('view-full', 'view-offense', 'view-defense');
        playArea.classList.add(`view-${viewType}`);

        // 2. Aseta SVG:n viewBox
        // Käytetään SVG:n todellista clientWidth/Height -arvoa määrittämään koko kentän rajat.
        // Tämä vaatii, että elementti on renderöity ja sillä on mitat.
        const svgWidth = drawingSurface.clientWidth;
        const svgHeight = drawingSurface.clientHeight;

        if (!svgWidth || !svgHeight) {
            console.warn("SVG dimensions not available yet for viewBox update.");
            // Yritä asettaa oletusarvo tai odota hetki
             // drawingSurface.setAttribute('viewBox', `0 0 800 426`); // Oletus
            return; // Älä jatka, jos mitat puuttuvat
        }

        let viewBoxValue = `0 0 ${svgWidth} ${svgHeight}`; // Oletus: koko kenttä

        if (viewType === 'offense') {
            // Näytä ylempi puolisko (0 -> height/2)
            // Voit säätää pientä marginaalia (esim. 10), jos haluat reunan näkyviin
            viewBoxValue = `0 0 ${svgWidth} ${svgHeight / 2}`;
        } else if (viewType === 'defense') {
            // Näytä alempi puolisko (height/2 -> height)
            viewBoxValue = `0 ${svgHeight / 2} ${svgWidth} ${svgHeight / 2}`;
        }

        drawingSurface.setAttribute('viewBox', viewBoxValue);
        console.log("Asetettu viewBox:", viewBoxValue);

        // Varmista, että pelaajat piirretään uudelleen oikein (ei välttämättä tarpeen, jos vain viewBox muuttuu)
        // players.forEach(updatePlayerPosition); // Tämä ei yleensä ole tarpeen
    }


    // --- Alustukset ja pääevent listenerit ---

    addAttackerBtn.addEventListener('click', () => addPlayer('attacker'));
    addDefenderBtn.addEventListener('click', () => addPlayer('defender'));
    clearArrowsBtn.addEventListener('click', clearAllArrows);
    exportJsonBtn.addEventListener('click', exportDataToJson); // Päivitetty funktion nimi

    // Kuuntelijat näkymän valinnalle
    viewSelectorRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            updateView(event.target.value);
        });
    });

    // Hiiren/kosketuksen painallus SVG-alueella aloittaa nuolen piirron
    drawingSurface.addEventListener('mousedown', startDrawArrow);
    drawingSurface.addEventListener('touchstart', startDrawArrow, { passive: false });

    // Aseta oletusnäkymä ja viewBox heti kun mahdollista
    // Käytetään pientä viivettä varmistamaan, että layout on laskettu ja mitat saatavilla
    setTimeout(() => {
        const initialChecked = document.querySelector('input[name="court-view"]:checked');
        updateView(initialChecked ? initialChecked.value : 'full'); // Aseta alkunäkymä ja viewBox
    }, 0);

}); // End of DOMContentLoaded
