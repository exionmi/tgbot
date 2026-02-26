require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const config = require('./config');
const CrashGame = require('./game/crash');
const { queries } = require('./database/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== Routes =====
const apiRoutes = require('./routes/api');
const depositRoutes = require('./routes/deposit');

app.use('/api', apiRoutes);
app.use('/api/deposit', depositRoutes);

// ===== Catch-all for SPA =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Инициализация игры =====
const crashGame = new CrashGame(io);

// ===== Socket.IO =====
io.on('connection', (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);

  // Регистрация
  socket.on('auth', (data) => {
    const { telegramId, username, firstName } = data;
    if (!telegramId) return;
    
    queries.createUser.run(String(telegramId), username || '', firstName || '');
    crashGame.registerPlayer(socket.id, String(telegramId));
    
    const user = queries.getUser.get(String(telegramId));
    socket.emit('auth:success', {
      balance: user.balance,
      telegramId: user.telegram_id,
    });
    
    // Отправляем текущее состояние игры
    socket.emit('game:state', crashGame.getState());
  });

  // Размещение ставки
  socket.on('game:placeBet', (data) => {
    const { telegramId, amount, autoCashout } = data;
    const result = crashGame.placeBet(
      String(telegramId), socket.id,
      parseFloat(amount), parseFloat(autoCashout) || 0
    );
    socket.emit('game:betResult', result);
  });

  // Кэшаут
  socket.on('game:cashout', (data) => {
    const { telegramId } = data;
    const result = crashGame.cashout(String(telegramId), socket.id);
    socket.emit('game:cashoutResult', result);
  });

  // Получить состояние
  socket.on('game:getState', () => {
    socket.emit('game:state', crashGame.getState());
  });

  // Отключение
  socket.on('disconnect', () => {
    crashGame.removePlayer(socket.id);
    console.log(`[WS] Disconnected: ${socket.id}`);
  });
});

// ===== Запуск сервера =====
server.listen(config.PORT, () => {
  console.log(`\n🚀 Crash Rocket Game Server`);
  console.log(`📡 Port: ${config.PORT}`);
  console.log(`🌐 URL: http://localhost:${config.PORT}`);
  console.log(`🎮 Game starting...\n`);
  
  // Запуск первого раунда
  crashGame.startNewRound();
});

module.exports = { app, server, io, crashGame };
