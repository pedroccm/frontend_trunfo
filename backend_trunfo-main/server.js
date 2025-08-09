import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';

// Load car database from JSON file
const carDatabase = JSON.parse(fs.readFileSync('./CARS/cars.json', 'utf8'));

// Configuration
const PORT = process.env.PORT || 3001;
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '*';
const allowedOrigins = allowedOriginsEnv === '*'
  ? '*'
  : allowedOriginsEnv.split(',').map((o) => o.trim());

const app = express();

// CORS for HTTP endpoints
app.use(cors({ origin: allowedOrigins }));

// Basic health endpoints
app.get('/', (_req, res) => res.send('duel-game backend running'));
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

const httpServer = http.createServer(app);

// Socket.IO with CORS
const io = new SocketIOServer(httpServer, {
  cors: { origin: allowedOrigins },
});

// In-memory matchmaking and rooms (MVP)
const waitingQueue = [];
const rooms = new Map(); // roomId -> { players: [socketId1, socketId2], gameState }

function createGameState(db) {
  const shuffled = [...db.cards].sort(() => Math.random() - 0.5);
  const player1Cards = [];
  const player2Cards = [];
  shuffled.forEach((card, index) => (index % 2 === 0 ? player1Cards : player2Cards).push(card));

  return {
    gamePhase: 'playing',
    currentPlayer: Math.random() < 0.5 ? 1 : 2,
    player1Cards,
    player2Cards,
    potCards: [],
    currentComparison: null,
    roundWinner: null,
    gameWinner: null,
  };
}

function serializeState(state) {
  return {
    gamePhase: state.gamePhase,
    currentPlayer: state.currentPlayer,
    player1Card: state.player1Cards[0] || null,
    player2Card: state.player2Cards[0] || null,
    player1CardCount: state.player1Cards.length,
    player2CardCount: state.player2Cards.length,
    potCount: state.potCards.length,
    currentComparison: state.currentComparison,
    roundWinner: state.roundWinner,
    gameWinner: state.gameWinner,
    showResults: state.showResults || false,
  };
}

io.on('connection', (socket) => {
  // Join matchmaking queue
  socket.on('queue:join', () => {
    waitingQueue.push(socket);
    if (waitingQueue.length >= 2) {
      const p1 = waitingQueue.shift();
      const p2 = waitingQueue.shift();
      const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      p1.join(roomId);
      p2.join(roomId);

      const gameState = createGameState(carDatabase);
      rooms.set(roomId, { players: [p1.id, p2.id], gameState });

      // Tell each player their assigned number
      p1.emit('match:found', { roomId, youAre: 1 });
      p2.emit('match:found', { roomId, youAre: 2 });
      io.to(roomId).emit('game:state', serializeState(gameState));
    }
  });

  // Player chooses an attribute to compare
  socket.on('move:choose_attribute', ({ roomId, attribute }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const { players, gameState } = room;
    if (gameState.gamePhase !== 'playing') return;

    const isPlayer1 = socket.id === players[0];
    const isPlayer2 = socket.id === players[1];
    const currentIndex = gameState.currentPlayer === 1 ? 0 : 1;
    const isCurrentPlayer = (currentIndex === 0 && isPlayer1) || (currentIndex === 1 && isPlayer2);
    if (!isCurrentPlayer) return;

    const player1Card = gameState.player1Cards[0];
    const player2Card = gameState.player2Cards[0];
    if (!player1Card || !player2Card) return;

    const config = carDatabase.attributes[attribute];
    if (!config) return;

    const value1 = player1Card.attrs[attribute];
    const value2 = player2Card.attrs[attribute];
    let winner = null;
    if (config.direction === 'max') {
      winner = value1 > value2 ? 1 : value2 > value1 ? 2 : null;
    } else {
      winner = value1 < value2 ? 1 : value2 < value1 ? 2 : null;
    }

    gameState.gamePhase = 'comparing';
    gameState.roundWinner = winner;
    gameState.currentComparison = {
      attribute,
      player1Value: value1,
      player2Value: value2,
      winner,
    };
    io.to(roomId).emit('game:state', serializeState(gameState));

    // FASE 1: Listras por 1500ms
    setTimeout(() => {
      // FASE 2: Mostrar resultado (verde/vermelho + confetti) por 2000ms
      gameState.showResults = true;
      io.to(roomId).emit('game:state', serializeState(gameState));
      
      // FASE 3: Resolver rodada após mostrar resultado
      setTimeout(() => {
        const played1 = gameState.player1Cards.shift();
        const played2 = gameState.player2Cards.shift();
        const pile = [played1, played2, ...gameState.potCards];
        gameState.potCards = [];

        if (winner === 1) {
          gameState.player1Cards.push(...pile);
          gameState.currentPlayer = 1;
        } else if (winner === 2) {
          gameState.player2Cards.push(...pile);
          gameState.currentPlayer = 2;
        } else {
          gameState.potCards.push(...pile);
        }

        if (gameState.player1Cards.length === 0 || gameState.player2Cards.length === 0) {
          gameState.gamePhase = 'game_over';
          gameState.gameWinner =
            gameState.player1Cards.length > gameState.player2Cards.length
              ? 1
              : gameState.player2Cards.length > gameState.player1Cards.length
              ? 2
              : null;
        } else {
          gameState.gamePhase = 'playing';
        }

        gameState.currentComparison = null;
        gameState.roundWinner = null;
        gameState.showResults = false;
        io.to(roomId).emit('game:state', serializeState(gameState));
      }, 2000);
    }, 1500);
  });

  socket.on('disconnect', () => {
    // Remove from queue if present
    const index = waitingQueue.findIndex((s) => s.id === socket.id);
    if (index !== -1) waitingQueue.splice(index, 1);

    // End game if a player leaves (MVP: opponent wins)
    for (const [roomId, room] of rooms) {
      const { players, gameState } = room;
      if (players.includes(socket.id) && gameState.gamePhase !== 'game_over') {
        gameState.gamePhase = 'game_over';
        gameState.gameWinner = socket.id === players[0] ? 2 : 1;
        io.to(roomId).emit('game:state', serializeState(gameState));
        rooms.delete(roomId);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`duel-game backend listening on port ${PORT}`);
});

