// frontend/script.js (continued from where you left off)
const socket = io(); // Connects to the server this HTML was served from

// --- UI Elements ---
const roomSelectionContainer = document.getElementById('room-selection-container');
const roomIdInput = document.getElementById('roomIdInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomErrorP = document.getElementById('roomError');

const gameContainerDiv = document.getElementById('game-container');
// const gameTitleH1 = document.getElementById('gameTitle'); // Already got this
const playerSymbolSpan = document.getElementById('playerSymbolSpan');
const currentRoomIdSpan = document.getElementById('currentRoomIdSpan');
const statusMessageP = document.getElementById('statusMessage');
const boardDiv = document.getElementById('board');
const restartBtn = document.getElementById('restartBtn');

// --- Game State Variables ---
let mySymbol = null;
let currentTurnSymbol = null;
let gameActive = false;
let currentRoomId = null;

// --- Event Listeners for UI ---
joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (roomId) {
        socket.emit('joinRoom', roomId);
        // currentRoomId will be set on 'playerSymbolAssigned' or 'gameStart'
        roomErrorP.textContent = '';
    } else {
        roomErrorP.textContent = 'Please enter a Room ID.';
    }
});

restartBtn.addEventListener('click', () => {
    if (currentRoomId) {
        if (gameActive) {
            if (confirm("The game is still active. Are you sure you want to request a restart?")) {
                socket.emit('restartGame', currentRoomId);
            }
        } else {
            // Game is over or opponent left, allow restart without confirmation
            socket.emit('restartGame', currentRoomId);
        }
    }
});

function createBoardCells() {
    boardDiv.innerHTML = ''; // Clear previous board
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        cell.addEventListener('click', handleCellClick);
        boardDiv.appendChild(cell);
    }
}

function handleCellClick(event) {
    if (!gameActive || mySymbol !== currentTurnSymbol) {
        // console.log('Not your turn or game not active.');
        // statusMessageP.textContent = "Not your turn, or game is not active.";
        return; // Do nothing if not player's turn or game inactive
    }
    const index = parseInt(event.target.dataset.index, 10); // Ensure index is a number

    // Check if cell is already taken (client-side check, server also validates)
    if (boardDiv.children[index].textContent !== '') {
        // console.log('Cell already taken.');
        return;
    }

    socket.emit('makeMove', { roomId: currentRoomId, index: index });
}

function updateBoardDisplay(boardData) {
    boardData.forEach((symbol, index) => {
        const cell = boardDiv.children[index];
        cell.textContent = symbol || ''; // Display symbol or empty string
        cell.className = 'cell'; // Reset classes
        if (symbol) {
            cell.classList.add(symbol.toLowerCase()); // e.g., 'x' or 'o' class for styling
        }
    });
}

function updateTurnIndicator() {
    if (!gameActive) return;

    if (mySymbol === currentTurnSymbol) {
        statusMessageP.textContent = "Your turn!";
        gameContainerDiv.dataset.myturn = "true"; // For potential CSS styling
    } else {
        statusMessageP.textContent = `Opponent's turn (${currentTurnSymbol || ''})`;
        gameContainerDiv.dataset.myturn = "false";
    }
}

// --- Socket Event Handlers ---
socket.on('playerSymbolAssigned', (data) => {
    mySymbol = data.symbol;
    currentRoomId = data.roomId; // Set currentRoomId here
    playerSymbolSpan.textContent = mySymbol;
    currentRoomIdSpan.textContent = currentRoomId;

    roomSelectionContainer.style.display = 'none';
    gameContainerDiv.style.display = 'block';
    // gameTitleH1.textContent = `Tic-Tac-Toe - Room: ${currentRoomId}`; // If you want to update title
    createBoardCells(); // Create board once symbol is assigned and in game view
});

socket.on('roomFull', () => {
    roomErrorP.textContent = 'This room is full. Try a different Room ID.';
    currentRoomId = null; // Reset room ID attempt
});

socket.on('waitingForOpponent', () => {
    statusMessageP.textContent = 'Waiting for an opponent...';
    restartBtn.style.display = 'none'; // Hide restart while waiting
    boardDiv.innerHTML = ''; // Clear board if it was shown
});

socket.on('gameStart', (data) => {
    gameActive = true;
    currentTurnSymbol = data.turn;
    if (!boardDiv.children.length) { // If board wasn't created (e.g. first player joining then second)
        createBoardCells();
    }
    updateBoardDisplay(data.board);
    updateTurnIndicator();
    restartBtn.style.display = 'none'; // Hide restart button when game starts
    roomErrorP.textContent = ''; // Clear any previous room errors
});

socket.on('boardUpdate', (data) => {
    if (!gameActive) return; // Should not happen if game over, but good check
    currentTurnSymbol = data.turn;
    updateBoardDisplay(data.board);
    updateTurnIndicator();
});

socket.on('invalidMove', (message) => {
    // You could display this more prominently or temporarily
    console.warn('Invalid move:', message);
    // Keep current turn message, maybe add a temporary warning
    const originalStatus = statusMessageP.textContent;
    statusMessageP.textContent = `Invalid move: ${message}. ${originalStatus}`;
    setTimeout(() => {
        if (statusMessageP.textContent.startsWith(`Invalid move: ${message}`)) {
             updateTurnIndicator(); // Revert to turn indicator
        }
    }, 2500);
});

socket.on('notYourTurn', () => {
    console.warn('Not your turn!');
    // statusMessageP.textContent = `Not your turn! Waiting for ${currentTurnSymbol}.`;
    // No need to change status message if updateTurnIndicator is robust
    updateTurnIndicator();
});

socket.on('gameOver', (data) => {
    gameActive = false;
    updateBoardDisplay(data.board); // Show final board state
    if (data.winner === 'draw') {
        statusMessageP.textContent = "It's a Draw!";
    } else if (data.winner === mySymbol) {
        statusMessageP.textContent = "Congratulations, You Win!";
    } else if (data.winner) { // Opponent won
        statusMessageP.textContent = `You Lose. Player ${data.winner} wins.`;
    } else {
        statusMessageP.textContent = "Game Over."; // Should not happen if winner is 'draw' or a symbol
    }
    restartBtn.style.display = 'block'; // Show restart button
});

socket.on('opponentLeft', () => {
    gameActive = false;
    statusMessageP.textContent = 'Your opponent left the game. You can restart in this room (if they rejoin) or join a new one.';
    restartBtn.style.display = 'block'; // Allow restarting (which will wait for a new opponent) or player can manually choose a new room
    // Optionally, you could automatically take them back to room selection:
    // roomSelectionContainer.style.display = 'block';
    // gameContainerDiv.style.display = 'none';
    // currentRoomId = null; mySymbol = null; // Reset state
});

socket.on('error', (message) => {
    // Generic error handling from server
    console.error('Server error:', message);
    // Display in a user-friendly way. Could be roomErrorP or statusMessageP depending on context
    if (roomSelectionContainer.style.display !== 'none') {
        roomErrorP.textContent = `Error: ${message}`;
    } else {
        statusMessageP.textContent = `Error: ${message}`;
    }
});

// Initial setup:
// createBoardCells(); // Don't create cells until player is in a room and game view is shown
// Call it in 'playerSymbolAssigned' or 'gameStart' when game view becomes active