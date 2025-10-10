$(document).ready(function() {
    // Determine player color from a global variable set in the HTML, default to 'w'
    const playerColor = window.playerColor || 'w';
    const computerColor = playerColor === 'w' ? 'b' : 'w';
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    var board = null;
    var game = new Chess();
    var allOpeningLines = [];
    var activeOpeningLines = [];
    var isOpeningFinished = false;
    var selectedSquare = null;
    var justDropped = false;

    // Hint state
    let hintState = 0; // 0: none, 1: piece hinted, 2: square hinted
    let hintedMove = null;
    let penaltyTime = 0; // Accumulates hint penalties before the timer starts

    // --- UI & Stats Elements ---
    var $message = $('#message');
    var $resetButton = $('#resetButton');
    var $hintButton = $('#hintButton');
    var $moveList = $('#moveList');
    var $timer = $('#timer');
    var $statsOpenings = $('#statsOpenings');
    var $statsErrors = $('#statsErrors');
    var $statsTotalTime = $('#statsTotalTime');
    var $statsAvgTime = $('#statsAvgTime');
    var $statsMinTime = $('#statsMinTime');
    var $trainingSelect = $('#trainingSelect');
    var $newTrainingButton = $('#newTrainingButton');
    var $currentOpeningName = $('#currentOpeningName');
    var $openingNoteDisplay = $('#openingNoteDisplay');
    var $showOpeningButton = $('#showOpeningButton');
    var $objectiveMessage = $('#objectiveMessage');

    const moveSound = new Audio('move.mp3');
    function playMoveSound() {
        moveSound.play().catch(e => console.error("Error playing sound:", e));
    }

    // --- Stats Tracking Variables ---
    var gamesPlayed = 0;
    var totalErrors = 0;
    var totalTime = 0;
    var minTime = Infinity;
    var gameStartTime = 0;
    var timerInterval = null;
    var currentOpeningTargetCompletions = 5;
    var currentOpeningErrorFreeCompletions = 0;

    // --- Highlighting Functions ---
    function removeHighlights() {
        $('#board [data-square]').removeClass('highlight-selected');
    }

    function addHighlight(square) {
        $('#board [data-square="' + square + '"]').addClass('highlight-selected');
    }

    function removeHintHighlights() {
        $('#board [data-square]').removeClass('highlight-hint-piece highlight-hint-square');
    }

    function addHintHighlight(square, type) {
        const className = type === 'piece' ? 'highlight-hint-piece' : 'highlight-hint-square';
        $('#board [data-square="' + square + '"]').addClass(className);
    }

    function resetHintState() {
        hintState = 0;
        hintedMove = null;
        removeHintHighlights();
    }

    function parsePgnLines(pgnContent) {
        const pgnGames = pgnContent.split(/\n\n(?=\[Event)/).filter(Boolean);
        return pgnGames.map(pgn => {
            const tempGame = new Chess();
            tempGame.load_pgn(pgn);
            const historyFromChessJs = tempGame.history({ verbose: true });
            
            const openingNoteMatch = pgn.match(/\x5BOpeningNote \"(.*?)\"\x5D/);
            const openingNote = openingNoteMatch ? openingNoteMatch[1] : '';

            const targetCompletionsMatch = pgn.match(/\x5BTargetCompletions \"(.*?)\"\x5D/);
            const targetCompletions = targetCompletionsMatch ? parseInt(targetCompletionsMatch[1], 10) : 5;

            const headerEndIndex = pgn.indexOf('\n\n');
            const moveTextRaw = headerEndIndex !== -1 ? pgn.substring(headerEndIndex).trim() : pgn.trim();
            
            const sanWithAnnotations = moveTextRaw.split(/\s+/).filter(token => 
                token && !/^\d+\.$/.test(token) && !/^{.*}$/.test(token) && !['1-0', '0-1', '1/2-1/2', '*'].includes(token)
            );

            if (historyFromChessJs.length === sanWithAnnotations.length) {
                for (let i = 0; i < historyFromChessJs.length; i++) {
                    historyFromChessJs[i].fullSan = sanWithAnnotations[i];
                }
            } else {
                console.warn("Annotation parser mismatch for PGN:", pgn, historyFromChessJs, sanWithAnnotations);
            }

            if (historyFromChessJs.length > 0) {
                historyFromChessJs[0].openingNote = openingNote;
                historyFromChessJs[0].targetCompletions = targetCompletions;
            }
            return historyFromChessJs;
        });
    }

    // --- Timer and Stats Functions ---
    function formatTime(seconds) {
        if (seconds === Infinity) return 'N/A';
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    
    function formatTimer(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function applyHintPenalty() {
        if (timerInterval) { // Timer is running
            gameStartTime -= 30000;
        } else { // Timer has not started
            penaltyTime += 30;
            $timer.text(formatTimer(penaltyTime));
        }
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        // Account for any penalty time accrued before the timer started
        gameStartTime = Date.now() - (penaltyTime * 1000);
        penaltyTime = 0; // Reset penalty time

        timerInterval = setInterval(() => {
            const elapsedTime = Math.floor((Date.now() - gameStartTime) / 1000);
            $timer.text(formatTimer(elapsedTime));
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
            const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
            totalTime += elapsed;
            minTime = Math.min(minTime, elapsed);
            updateStats();
        }
    }
    
    function updateStats() {
        $statsOpenings.text(`${currentOpeningErrorFreeCompletions} / ${currentOpeningTargetCompletions}`);
        $statsErrors.text(`${totalErrors} / 0`);
        $statsTotalTime.text(formatTime(totalTime));
        const avgTime = gamesPlayed > 0 ? formatTime(Math.floor(totalTime / gamesPlayed)) : formatTime(0);
        $statsAvgTime.text(avgTime);
        $statsMinTime.text(formatTime(minTime));

        if (currentOpeningErrorFreeCompletions >= currentOpeningTargetCompletions) {
            $objectiveMessage.text(`Objective achieved for ${$currentOpeningName.text()}!`).addClass('achieved');
            const achievement = {
                date: new Date().toISOString(),
                name: $currentOpeningName.text(),
                time: formatTime(totalTime)
            };
            const achievements = JSON.parse(localStorage.getItem('chessPTAchievements') || '[]');
            const isAlreadySaved = achievements.some(saved => saved.date === achievement.date && saved.name === achievement.name);
            if (!isAlreadySaved) {
                achievements.push(achievement);
                localStorage.setItem('chessPTAchievements', JSON.stringify(achievements));
            }
        } else {
            $objectiveMessage.html('&nbsp;').removeClass('achieved');
        }
    }

    function updateMoveList() {
        const movesToDisplay = activeOpeningLines.length > 0 
            ? activeOpeningLines[0].slice(0, game.history().length) 
            : game.history({ verbose: true });

        var moveListHtml = '';
        for (var i = 0; i < movesToDisplay.length; i++) {
            var move = movesToDisplay[i];
            if (i % 2 === 0) {
                moveListHtml += `<div class="move-row"><span class="move-number">${(i / 2) + 1}.</span>`;
            }
            var displayedSan = move.fullSan || move.san;

            if (move.color === 'b' && i === movesToDisplay.length - 1 && !isOpeningFinished) {
                displayedSan = displayedSan.replace(/[?!+#=]/g, '');
            }

            moveListHtml += `<span class="move-item ${move.color === 'w' ? 'white-move' : 'black-move'}">${displayedSan}</span>`;
            
            if (i % 2 !== 0 || i === movesToDisplay.length - 1) {
                moveListHtml += `</div>`;
            }
        }
        $moveList.html(moveListHtml);
        if ($moveList[0]) {
            $moveList.scrollTop($moveList[0].scrollHeight);
        }
    }

    function updateMessage(msg, isError = false) {
        $message.text(msg);
        $message.toggleClass('error', isError);
    }
    
    function finishOpening(isShown = false) {
        let finalMessage = isShown ? 'Opening line shown.' : 'Opening line completed! Congratulations!';
        let openingNoteContent = (activeOpeningLines.length > 0 && activeOpeningLines[0][0] && activeOpeningLines[0][0].openingNote) ? activeOpeningLines[0][0].openingNote : '';
        
        updateMessage(finalMessage);
        $openingNoteDisplay.html(openingNoteContent);
        isOpeningFinished = true;
        stopTimer();

        if (!isShown && totalErrors === 0) {
            currentOpeningErrorFreeCompletions++;
            updateStats();
        }
    }

    // --- Core Move Logic ---
    function handleMoveAttempt(source, target) {
        resetHintState(); // Reset hints on any move attempt
        const move = game.move({ from: source, to: target, promotion: 'q' });

        if (move === null) {
            return 'snapback';
        }

        board.position(game.fen());
        playMoveSound();
        updateMoveList();

        if (!timerInterval && !isOpeningFinished) startTimer();

        const matchingLines = activeOpeningLines.filter(line => {
            const currentMoveIndex = game.history().length - 1;
            return line[currentMoveIndex] && (line[currentMoveIndex].fullSan || line[currentMoveIndex].san).startsWith(move.san);
        });

        if (matchingLines.length > 0) {
            updateMessage('Correct move! Computer is thinking...');
            activeOpeningLines = matchingLines;

            const possibleComputerResponses = activeOpeningLines
                .map(line => line[game.history().length])
                .filter(nextMove => nextMove && nextMove.color === computerColor);

            if (possibleComputerResponses.length > 0) {
                const computerResponse = possibleComputerResponses[Math.floor(Math.random() * possibleComputerResponses.length)];
                
                setTimeout(() => {
                    game.move(computerResponse.san);
                    board.position(game.fen());
                    playMoveSound();
                    const turnMsg = playerColor === 'w' ? 'Your turn.' : 'Your turn (Black).';
                    updateMessage(`Computer responded with ${computerResponse.san}. ${turnMsg}`);
                    
                    activeOpeningLines = activeOpeningLines.filter(line => {
                        const currentMoveIndex = game.history().length - 1;
                        return line[currentMoveIndex] && (line[currentMoveIndex].fullSan || line[currentMoveIndex].san).startsWith(computerResponse.san);
                    });

                    updateMoveList();
                    
                    if (!activeOpeningLines.some(line => line[game.history().length])) {
                        finishOpening();
                    }
                }, 800);
            } else {
                finishOpening();
            }
        } else {
            updateMessage(`Move "${move.san}" is not in the opening line. Try again.`, true);
            totalErrors++;
            updateStats();
            game.undo();
            return 'snapback';
        }
    }

    // --- Board Interaction Callbacks ---
    function onDragStart(source, piece, position, orientation) {
        if (isOpeningFinished) return false;
        
        const pieceColor = piece.charAt(0);
        if (game.turn() !== playerColor || pieceColor !== playerColor) {
            return false;
        }
    }

    function onDrop(source, target) {
        justDropped = true;
        const result = handleMoveAttempt(source, target);
        if (result === 'snapback') {
            setTimeout(() => { board.position(game.fen()); }, 250);
        }
    }

    function onSnapEnd() {
        board.position(game.fen());
    }

    function onSquareClick(square) {
        if (isOpeningFinished) return;

        if (!selectedSquare) {
            const piece = game.get(square);
            if (piece && piece.color === playerColor && game.turn() === playerColor) {
                selectedSquare = square;
                addHighlight(square);
            }
            return;
        }

        if (selectedSquare === square) {
            selectedSquare = null;
            removeHighlights();
            return;
        }

        const result = handleMoveAttempt(selectedSquare, square);
        if (result === 'snapback') {
            board.position(game.fen());
        }

        selectedSquare = null;
        removeHighlights();
    }

    var config = {
        draggable: !isTouchDevice,
        position: 'start',
        orientation: playerColor === 'w' ? 'white' : 'black',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };
    board = Chessboard('board', config);

    // Custom click-to-move handler
    $('#board').on('mouseup', '[data-square]', function() {
        if (justDropped) {
            justDropped = false;
            return;
        }
        const clickedSquare = $(this).data('square');
        onSquareClick(clickedSquare);
    });

    function resetCurrentGame() {
        if (currentOpeningErrorFreeCompletions >= currentOpeningTargetCompletions) {
            resetAllStats();
        }

        game.reset();
        board.position('start');
        activeOpeningLines = [...allOpeningLines];
        isOpeningFinished = false;
        gamesPlayed++;
        selectedSquare = null;
        penaltyTime = 0;
        removeHighlights();
        resetHintState();
        
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        $timer.text('00:00');

        updateStats();
        updateMoveList();
        const selectedOpeningText = $('#trainingSelect option:selected').text();
        if (selectedOpeningText) {
            $currentOpeningName.text(selectedOpeningText);
        }
        $openingNoteDisplay.empty();

        if (playerColor === 'w') {
            updateMessage('Your turn (White), make the first move.');
        } else {
            updateMessage('Computer is thinking...');
            setTimeout(function() {
                const possibleFirstMoves = activeOpeningLines
                    .map(line => line[0])
                    .filter(move => move && move.color === 'w');

                if (possibleFirstMoves.length > 0) {
                    const firstMove = possibleFirstMoves[Math.floor(Math.random() * possibleFirstMoves.length)];
                    game.move(firstMove.san);
                    board.position(game.fen());
                    playMoveSound();
                    
                    activeOpeningLines = activeOpeningLines.filter(line => 
                        line[0] && (line[0].fullSan || line[0].san).startsWith(firstMove.san)
                    );

                    updateMoveList();
                    updateMessage(`Computer started with ${firstMove.san}. Your turn (Black).`);
                } else {
                    updateMessage('Your turn (Black), make the first move.');
                }
            }, 250);
        }
    }

    function resetAllStats() {
        gamesPlayed = 0;
        totalErrors = 0;
        totalTime = 0;
        minTime = Infinity;
        currentOpeningErrorFreeCompletions = 0;
        updateStats();
    }

    function loadTraining(pgnFile) {
        fetch(pgnFile)
            .then(response => response.text())
            .then(pgnContent => {
                allOpeningLines = parsePgnLines(pgnContent);
                if (allOpeningLines.length > 0 && allOpeningLines[0].length > 0 && allOpeningLines[0][0].targetCompletions) {
                    currentOpeningTargetCompletions = allOpeningLines[0][0].targetCompletions;
                } else {
                    currentOpeningTargetCompletions = 5;
                }
                resetAllStats();
                resetCurrentGame();
            })
            .catch(error => {
                console.error(`Error loading training data from ${pgnFile}:`, error);
                updateMessage(`Error loading training data from ${pgnFile}. Please check console.`, true);
            });
    }

    const trainingsFile = playerColor === 'w' ? 'trainings.json' : 'trainings_black.json';
    fetch(trainingsFile)
        .then(response => response.json())
        .then(data => {
            $trainingSelect.empty();
            data.forEach(category => {
                const $optgroup = $(`<optgroup label="${category.label}"></optgroup>`);
                category.options.forEach(training => {
                    $optgroup.append(`<option value="${training.file}">${training.name}</option>`);
                });
                $trainingSelect.append($optgroup);
            });
            if (data.length > 0 && data[0].options.length > 0) {
                loadTraining(data[0].options[0].file);
            }
        })
        .catch(error => {
            console.error(`Error loading ${trainingsFile}:`, error);
            updateMessage('Error loading training configurations. Please check console.', true);
        });

    // Event Listeners
    $resetButton.on('click', resetCurrentGame);
    $showOpeningButton.on('click', function() {
        if (isOpeningFinished || activeOpeningLines.length === 0) return;
        resetHintState();
        const currentHistoryLength = game.history().length;
        const fullOpeningLine = activeOpeningLines[0];

        for (let i = currentHistoryLength; i < fullOpeningLine.length; i++) {
            game.move(fullOpeningLine[i].san);
        }
        board.position(game.fen());
        playMoveSound();
        
        totalErrors++;
        updateStats();
        finishOpening(true);
        updateMoveList();
    });

    $newTrainingButton.on('click', function() {
        const selectedPgn = $trainingSelect.val();
        if (selectedPgn) {
            loadTraining(selectedPgn);
            // Scroll to board on mobile after starting
            if (window.innerWidth < 768) {
                setTimeout(() => {
                    document.getElementById('board').scrollIntoView({ behavior: 'smooth' });
                }, 100); // Timeout to allow content to load
            }
        }
    });

    $hintButton.on('click', function() {
        if (isOpeningFinished || game.turn() !== playerColor) return;

        const nextMove = activeOpeningLines.map(line => line[game.history().length]).find(move => move);
        if (!nextMove) return;

        if (hintState === 0) {
            hintedMove = nextMove;
            applyHintPenalty();
            addHintHighlight(hintedMove.from, 'piece');
            hintState = 1;
        } else if (hintState === 1) {
            // Ensure the hint is for the current move
            if (hintedMove.from === nextMove.from && hintedMove.to === nextMove.to) {
                applyHintPenalty();
                addHintHighlight(hintedMove.to, 'square');
                hintState = 2;
            } else {
                // The game state changed, reset hint and apply a new one
                resetHintState();
                $hintButton.trigger('click'); // Re-trigger the hint logic for the new state
            }
        }
    });

    // --- PGN Import Logic ---
    const $importPgnButton = $('#importPgnButton');
    const $pgnFileInput = $('#pgnFileInput');

    $importPgnButton.on('click', function() {
        $pgnFileInput.click();
    });

    $pgnFileInput.on('change', function(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const pgnContent = e.target.result;
            if (pgnContent) {
                allOpeningLines = parsePgnLines(pgnContent);
                if (allOpeningLines.length > 0 && allOpeningLines[0].length > 0 && allOpeningLines[0][0].targetCompletions) {
                    currentOpeningTargetCompletions = allOpeningLines[0][0].targetCompletions;
                } else {
                    currentOpeningTargetCompletions = 5;
                }
                resetAllStats();
                resetCurrentGame(); // This will reset the game logic
                
                // After resetCurrentGame, override the opening name and deselect dropdown
                $currentOpeningName.text(file.name.replace('.pgn', ''));
                $('#trainingSelect').prop('selectedIndex', -1);
            }
        };
        reader.readAsText(file);

        // Reset the file input value to allow re-selecting the same file
        $(this).val('');
    });
});
