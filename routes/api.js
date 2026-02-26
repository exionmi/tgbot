const express = require('express');
const router = express.Router();
const { queries } = require('../database/db');

// ===== Авторизация / Регистрация =====
router.post('/auth', (req, res) => {
  try {
    const { telegramId, username, firstName } = req.body;
    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId обязателен' });
    }
    
    queries.createUser.run(String(telegramId), username || '', firstName || '');
    const user = queries.getUser.get(String(telegramId));
    
    res.json({
      success: true,
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        balance: user.balance,
        totalDeposited: user.total_deposited,
        totalWagered: user.total_wagered,
        totalWon: user.total_won,
      }
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===== Профиль =====
router.get('/profile/:telegramId', (req, res) => {
  try {
    const user = queries.getUser.get(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const gifts = queries.getUserGifts.all(user.id);
    const bets = queries.getUserBetHistory.all(user.id);
    const deposits = queries.getDepositsByUser.all(user.id);
    const withdrawals = queries.getWithdrawalsByUser.all(user.id);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        balance: user.balance,
        totalDeposited: user.total_deposited,
        totalWagered: user.total_wagered,
        totalWon: user.total_won,
      },
      gifts,
      betHistory: bets,
      deposits,
      withdrawals,
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===== Баланс =====
router.get('/balance/:telegramId', (req, res) => {
  try {
    const user = queries.getUser.get(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ success: true, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===== Подарки =====
router.get('/gifts/:telegramId', (req, res) => {
  try {
    const user = queries.getUser.get(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const gifts = queries.getUserGifts.all(user.id);
    res.json({ success: true, gifts });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===== Лидерборд =====
router.get('/leaderboard', (req, res) => {
  try {
    const leaders = queries.getLeaderboard.all();
    res.json({ success: true, leaders });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ===== История раундов =====
router.get('/rounds/history', (req, res) => {
  try {
    const rounds = queries.getLastRounds.all();
    res.json({ success: true, rounds });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
