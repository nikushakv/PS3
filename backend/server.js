// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the "frontend" directory
app.use(express.static(path.join(__dirname, '../frontend')));

let rooms = {}; // Stores room data: { roomId: { players: [], board: [], currentPlayerIndex: 0, gameActive: false } }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', (roomId) => {
        if (!roomId) {
            socket.emit('error', 'Room ID cannot be empty.');
            return;
        }

        socket.currentRoom = roomId; // Store room in socket for easier access on disconnect

        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                board: Array(9).fill(null),
                currentPlayerIndex: 0, // 0 for 'X', 1 for 'O' (first player)
                gameActive: false
            };
            console.log(`Room ${roomId} created`);
        }

        const room = rooms[roomId];

        if (room.players.length < 2) {
            const playerSymbol = room.players.length === 0 ? 'X' : 'O';
            room.players.push({ id: socket.id, symbol: playerSymbol });
            socket.join(roomId); // Socket.IO room functionality
            socket.emit('playerSymbolAssigned', { symbol: playerSymbol, roomId: roomId });
            console.log(`Player ${socket.id} (${playerSymbol}) joined room ${roomId}`);

            if (room.players.length === 1) {
                socket.emit('waitingForOpponent');
            } else if (room.players.length === 2) {
                room.gameActive = true;
                // Ensure the first player in the array is X
                if (room.players[0].symbol !== 'X') {
                    // Swap if necessary, though assignment order should handle this
                    [room.players[0], room.players[1]] = [room.players[1], room.players[0]];
                }
                room.currentPlayerIndex = room.players.findIndex(p => p.symbol === 'X'); // X always starts

                io.to(roomId).emit('gameStart', {
                    board: room.board,
                    turn: room.players[room.currentPlayerIndex].symbol
                });
                console.log(`Game starting in room ${roomId}. X's turn.`);
            }
        } else {
            socket.emit('roomFull');
        }
    });

    socket.on('makeMove', (data) => {
        const { roomId, index } = data;
        const room = rooms[roomId];

        if (!room || !room.gameActive) {
            socket.emit('error', 'Game not active or room does not exist.');
            return;
        }

        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            socket.emit('error', 'Player not found in room.');
            return;
        }

        const expectedPlayerSymbol = room.players[room.currentPlayerIndex].symbol;

        if (player.symbol !== expectedPlayerSymbol) {
            socket.emit('notYourTurn');
            return;
        }

        if (room.board[index] !== null) {
            socket.emit('invalidMove', 'Cell is already taken.');
            return;
        }

        room.board[index] = player.symbol;
        const winner = checkWinner(room.board);

        if (winner) {
            room.gameActive = false;
            io.to(roomId).emit('gameOver', { winner: winner, board: room.board });
            console.log(`Game over in room ${roomId}. Winner: ${winner}`);
        } else if (room.board.every(cell => cell !== null)) { // Draw
            room.gameActive = false;
            io.to(roomId).emit('gameOver', { winner: 'draw', board: room.board });
            console.log(`Game over in room ${roomId}. It's a draw.`);
        } else {
            // Switch turn
            room.currentPlayerIndex = 1 - room.currentPlayerIndex; // Toggles between 0 and 1
            io.to(roomId).emit('boardUpdate', {
                board: room.board,
                turn: room.players[room.currentPlayerIndex].symbol
            });
        }
    });

    socket.on('restartGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length === 2) { // Only restart if both players are there
            room.board = Array(9).fill(null);
            // X always starts, find which player is X
            room.currentPlayerIndex = room.players.findIndex(p => p.symbol === 'X');
            if (room.currentPlayerIndex === -1) room.currentPlayerIndex = 0; // Fallback, should not happen
            room.gameActive = true;
            io.to(roomId).emit('gameStart', { // Use gameStart to reset client state
                board: room.board,
                turn: room.players[room.currentPlayerIndex].symbol
            });
            console.log(`Game restarted in room ${roomId}`);
        } else if (room) {
            socket.emit('error', "Cannot restart: Waiting for opponent.");
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const roomId = socket.currentRoom; // Get room from socket object

        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const disconnectedPlayerSymbol = room.players[playerIndex].symbol;
                room.players.splice(playerIndex, 1);
                console.log(`Player ${socket.id} (${disconnectedPlayerSymbol}) left room ${roomId}`);

                if (room.gameActive) { // If game was active, notify opponent
                    room.gameActive = false; // Stop the game
                    socket.to(roomId).emit('opponentLeft'); // Notify only the other player(s) in the room
                }

                if (room.players.length === 0) {
                    console.log(`Room ${roomId} is now empty, deleting.`);
                    delete rooms[roomId];
                } else if (room.players.length === 1 && !room.gameActive) {
                    // If one player remains and game wasn't active (e.g., waiting phase or after opponentLeft)
                    // Inform the remaining player they are waiting again, or let them restart/join new
                    // For simplicity now, opponentLeft is handled, this state might just be "waiting"
                }
            }
        }
        // Clean up any other rooms this socket might have been associated with (less likely with current logic)
        // For a more robust solution, iterate all rooms if socket.currentRoom isn't reliable
    });
});

function checkWinner(board) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    for (const combination of winningCombinations) {
        const [a, b, c] = combination;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a]; // Returns 'X' or 'O'
        }
    }
    if (board.every(cell => cell !== null)) {
        return 'draw'; // All cells filled, no winner
    }
    return null; // No winner, game continues
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});