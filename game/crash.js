const crypto = require('crypto');
const config = require('../config');
const { db, queries } = require('../database/db');

class CrashGame {
  constructor(io) {
    this.io = io;
    this.currentRound = null;
    this.multiplier = 1.00;
    this.isRunning = false;
    this.tickInterval = null;
    this.players = new Map(); // socketId -> { userId, telegramId }
    this.roundHistory = [];
    this.pendingBets = [];
    
    this._loadHistory();
  }

  _loadHistory() {
    try {
      const rounds = queries.getLastRounds.all();
      this.roundHistory = rounds.map(r => ({
        id: r.id,
        crashPoint: r.crash_point,
        hash: r.hash
      })).reverse();
    } catch (e) {
      this.roundHistory = [];
    }
  }

  // ===== Генерация крэш-поинта с доказуемой честностью =====
  generateCrashPoint() {
    const seed = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    
    // Генерация крэш-поинта с house edge
    const houseEdge = config.GAME.HOUSE_EDGE;
    const h = parseInt(hash.substring(0, 8), 16);
    
    // Формула: если h % 33 === 0, крэш на 1.00 (instant crash ~3%)
    if (h % 33 === 0) {
      return { crashPoint: 1.00, hash, seed };
    }
    
    // Экспоненциальное распределение с макс 50x
    const e = Math.pow(2, 32);
    let crashPoint = Math.floor((100 * e - h) / (e - h)) / 100;
    crashPoint = Math.max(1.00, Math.min(config.GAME.MAX_MULTIPLIER, crashPoint));
    
    // Применяем house edge
    crashPoint = Math.floor(crashPoint * (1 - houseEdge) * 100) / 100;
    crashPoint = Math.max(1.00, crashPoint);
    
    return { crashPoint, hash, seed };
  }

  // ===== Старт нового раунда =====
  async startNewRound() {
    const { crashPoint, hash, seed } = this.generateCrashPoint();
    
    // Создаём раунд в БД
    const result = queries.createRound.run(crashPoint, hash);
    const roundId = result.lastInsertRowid;
    
    this.currentRound = {
      id: roundId,
      crashPoint,
      hash,
      seed,
      status: 'waiting',
      bets: new Map(),
    };
    
    this.multiplier = 1.00;
    this.isRunning = false;

    // Фаза ожидания ставок (5 секунд)
    this.io.emit('game:newRound', {
      roundId,
      hash,
      countdown: config.GAME.ROUND_INTERVAL / 1000,
      history: this.roundHistory.slice(-20),
    });

    console.log(`[ROUND #${roundId}] Waiting for bets... Crash at ${crashPoint}x`);

    // Ожидание
    await this._sleep(config.GAME.ROUND_INTERVAL);
    
    // Старт раунда
    this._startRound();
  }

  _startRound() {
    if (!this.currentRound) return;
    
    this.currentRound.status = 'running';
    this.isRunning = true;
    this.multiplier = 1.00;

    queries.updateRoundStatus.run('running', 'running', 'running', this.currentRound.id);
    
    this.io.emit('game:start', { 
      roundId: this.currentRound.id 
    });

    console.log(`[ROUND #${this.currentRound.id}] Started! Target: ${this.currentRound.crashPoint}x`);

    // Тик-цикл для увеличения множителя
    const startTime = Date.now();
    
    this.tickInterval = setInterval(() => {
      if (!this.isRunning) return;
      
      const elapsed = Date.now() - startTime;
      // Формула роста множителя (экспоненциальная, как в 1win)
      this.multiplier = Math.pow(Math.E, 0.00006 * elapsed);
      this.multiplier = Math.floor(this.multiplier * 100) / 100;
      
      // Проверка auto-cashout для каждой ставки
      this._checkAutoCashouts();
      
      // Отправляем текущий множитель
      this.io.emit('game:tick', {
        multiplier: this.multiplier,
        elapsed
      });

      // Показ подарков для крупных ставок
      this._checkGiftPreviews(elapsed);
      
      // Краш!
      if (this.multiplier >= this.currentRound.crashPoint) {
        this._crash();
      }
    }, config.GAME.TICK_RATE);
  }

  // ===== Проверяем автокэшаут =====
  _checkAutoCashouts() {
    if (!this.currentRound) return;
    
    for (const [betId, bet] of this.currentRound.bets) {
      if (bet.status !== 'active') continue;
      if (bet.autoCashout > 0 && this.multiplier >= bet.autoCashout) {
        this._processCashout(bet.telegramId, bet.socketId);
      }
    }
  }

  // ===== Показ подарков для крупных ставок =====
  _checkGiftPreviews(elapsed) {
    if (!this.currentRound) return;
    
    for (const [betId, bet] of this.currentRound.bets) {
      if (bet.status !== 'active') continue;
      if (bet.giftPreviewShown) continue;
      
      // Для крупных ставок после 4.5 секунд показываем превью подарков
      if (bet.amount >= config.GAME.BIG_BET_THRESHOLD && elapsed >= config.GAME.GIFT_SHOW_DELAY) {
        if (this.multiplier >= config.GAME.MIN_WIN_MULTIPLIER) {
          const gift = this._determineGift(this.multiplier, bet.amount);
          if (gift) {
            this.io.to(bet.socketId).emit('game:giftPreview', {
              gift: gift.name,
              tier: gift.tier,
              value: gift.value,
              multiplier: this.multiplier
            });
            bet.giftPreviewShown = true;
          }
        }
      }
    }
  }

  // ===== Определяем подарок по множителю =====
  _determineGift(multiplier, betAmount) {
    if (multiplier < config.GAME.MIN_WIN_MULTIPLIER) return null;
    
    for (const tier of config.GIFT_TIERS) {
      if (multiplier >= tier.minMultiplier && multiplier < tier.maxMultiplier) {
        const giftIndex = Math.floor(Math.random() * tier.gifts.length);
        // Масштабируем ценность относительно ставки
        const scaledValue = Math.floor(tier.value * (betAmount / 10) * 100) / 100;
        return {
          name: tier.gifts[giftIndex],
          tier: `${tier.minMultiplier}x-${tier.maxMultiplier}x`,
          value: Math.max(tier.value, scaledValue),
        };
      }
    }
    
    // Максимальный тир для 50x
    const lastTier = config.GIFT_TIERS[config.GIFT_TIERS.length - 1];
    if (multiplier >= lastTier.minMultiplier) {
      const giftIndex = Math.floor(Math.random() * lastTier.gifts.length);
      return {
        name: lastTier.gifts[giftIndex],
        tier: `${lastTier.minMultiplier}x+`,
        value: lastTier.value * (betAmount / 10),
      };
    }
    
    return null;
  }

  // ===== Краш =====
  _crash() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    clearInterval(this.tickInterval);
    
    const crashPoint = this.currentRound.crashPoint;
    
    // Все активные ставки проигрывают
    queries.loseBet.run(this.currentRound.id);
    
    // Обновляем раунд
    queries.updateRoundStatus.run('crashed', 'crashed', 'crashed', this.currentRound.id);

    // Добавляем в историю
    this.roundHistory.push({
      id: this.currentRound.id,
      crashPoint,
      hash: this.currentRound.hash
    });
    if (this.roundHistory.length > 50) this.roundHistory.shift();

    this.io.emit('game:crash', {
      roundId: this.currentRound.id,
      crashPoint,
      hash: this.currentRound.hash,
      seed: this.currentRound.seed,
    });

    console.log(`[ROUND #${this.currentRound.id}] CRASHED at ${crashPoint}x`);

    // Следующий раунд через 3 секунды
    setTimeout(() => this.startNewRound(), 3000);
  }

  // ===== Размещение ставки =====
  placeBet(telegramId, socketId, amount, autoCashout = 0) {
    if (!this.currentRound || this.currentRound.status !== 'waiting') {
      return { success: false, error: 'Раунд уже начался! Ждите следующий.' };
    }
    
    if (amount < config.GAME.MIN_BET) {
      return { success: false, error: `Минимальная ставка: ${config.GAME.MIN_BET}` };
    }
    if (amount > config.GAME.MAX_BET) {
      return { success: false, error: `Максимальная ставка: ${config.GAME.MAX_BET}` };
    }
    
    const user = queries.getUser.get(telegramId);
    if (!user) {
      return { success: false, error: 'Пользователь не найден' };
    }
    
    if (user.balance < amount) {
      return { success: false, error: 'Недостаточно средств! Пополните баланс.' };
    }

    // Проверка нет ли уже ставки
    const existingBet = queries.getUserActiveBet.get(user.id, this.currentRound.id);
    if (existingBet) {
      return { success: false, error: 'Вы уже сделали ставку в этом раунде!' };
    }

    // Списываем баланс
    queries.updateBalance.run(-amount, telegramId);
    queries.addWagered.run(amount, telegramId);
    
    // Создаём ставку в БД
    const result = queries.createBet.run(user.id, this.currentRound.id, amount, autoCashout || 0);
    const betId = result.lastInsertRowid;
    
    // Сохраняем в памяти
    this.currentRound.bets.set(betId, {
      id: betId,
      userId: user.id,
      telegramId,
      socketId,
      amount,
      autoCashout: autoCashout || 0,
      status: 'active',
      giftPreviewShown: false,
      username: user.username || user.first_name,
    });

    // Оповещаем всех
    this.io.emit('game:bet', {
      username: user.username || user.first_name || 'Аноним',
      amount,
      telegramId,
    });

    const newUser = queries.getUser.get(telegramId);

    return { 
      success: true, 
      betId,
      balance: newUser.balance,
      message: `Ставка ${amount} принята!` 
    };
  }

  // ===== Кэшаут =====
  _processCashout(telegramId, socketId) {
    if (!this.currentRound || !this.isRunning) return null;
    
    let targetBet = null;
    for (const [betId, bet] of this.currentRound.bets) {
      if (bet.telegramId === telegramId && bet.status === 'active') {
        targetBet = bet;
        break;
      }
    }
    
    if (!targetBet) return null;
    
    const cashoutMultiplier = this.multiplier;
    targetBet.status = 'cashed_out';
    
    // Определяем подарок (только если >= 3x)
    let giftWon = null;
    let profit = targetBet.amount * cashoutMultiplier;
    
    if (cashoutMultiplier >= config.GAME.MIN_WIN_MULTIPLIER) {
      giftWon = this._determineGift(cashoutMultiplier, targetBet.amount);
      
      if (giftWon) {
        // Сохраняем подарок в БД
        const user = queries.getUser.get(telegramId);
        const giftResult = queries.createGift.run(
          user.id,
          this.currentRound.id,
          giftWon.name,
          giftWon.tier,
          giftWon.value,
          cashoutMultiplier,
          targetBet.amount
        );
        giftWon.id = giftResult.lastInsertRowid;
      }
    }
    
    // Возвращаем выигрыш на баланс
    queries.updateBalance.run(profit, telegramId);
    queries.addWon.run(profit, telegramId);
    
    // Обновляем ставку в БД
    queries.cashoutBet.run(
      cashoutMultiplier,
      profit - targetBet.amount,
      giftWon ? giftWon.name : '',
      targetBet.id
    );
    
    const updatedUser = queries.getUser.get(telegramId);

    return {
      betId: targetBet.id,
      cashoutAt: cashoutMultiplier,
      profit: Math.floor((profit - targetBet.amount) * 100) / 100,
      totalWin: Math.floor(profit * 100) / 100,
      balance: updatedUser.balance,
      gift: giftWon,
      username: targetBet.username,
    };
  }

  cashout(telegramId, socketId) {
    const result = this._processCashout(telegramId, socketId);
    
    if (!result) {
      return { success: false, error: 'Нет активной ставки' };
    }

    // Оповещаем всех
    this.io.emit('game:cashout', {
      username: result.username,
      multiplier: result.cashoutAt,
      profit: result.totalWin,
      gift: result.gift,
    });

    return { success: true, ...result };
  }

  // ===== Состояние =====
  getState() {
    return {
      roundId: this.currentRound?.id || null,
      status: this.currentRound?.status || 'waiting',
      multiplier: this.multiplier,
      bets: this.currentRound ? 
        Array.from(this.currentRound.bets.values()).map(b => ({
          username: b.username,
          amount: b.amount,
          status: b.status,
          cashoutAt: b.status === 'cashed_out' ? b.cashoutAt : null,
        })) : [],
      history: this.roundHistory.slice(-20),
    };
  }

  // ===== Хелперы =====
  registerPlayer(socketId, telegramId) {
    this.players.set(socketId, { telegramId });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CrashGame;
